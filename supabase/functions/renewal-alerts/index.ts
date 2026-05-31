// Supabase Edge Function: renewal-alerts
// =============================================================================
// Scheduled job that emails facility directors a digest of credentials/documents
// expiring soon. SCAFFOLD — safe to deploy now; it no-ops on email until a
// RESEND_API_KEY is configured, so it can be wired the moment creds arrive.
//
// Deploy:
//   supabase functions deploy renewal-alerts --no-verify-jwt
//
// Required secrets (set when credentials are available):
//   supabase secrets set RESEND_API_KEY=...           # email provider
//   supabase secrets set ALERT_FROM_EMAIL="Compliance Guard <alerts@yourdomain>"
//   # SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
// Schedule daily (run once in the SQL editor after deploy):
//   select cron.schedule(
//     'renewal-alerts-daily', '0 13 * * *',  -- 13:00 UTC ~= 8am CT
//     $$ select net.http_post(
//          url := 'https://<PROJECT_REF>.supabase.co/functions/v1/renewal-alerts',
//          headers := jsonb_build_object('Authorization','Bearer <ANON_OR_SERVICE_KEY>')
//        ); $$
//   );
//
// This first cut alerts on documents that carry a printed (AI-extracted)
// expiration date — the common case for staff credentials. Frequency-derived
// expirations are already surfaced in the in-app Renewals view and can be
// folded in here later by porting src/lib/renewals.ts.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const WINDOW_DAYS = 30;
const DAY_MS = 1000 * 60 * 60 * 24;

interface ExpiringDoc {
  facility_id: string;
  name: string | null;
  document_type: string | null;
  expiration: string;
}

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const fromEmail = Deno.env.get('ALERT_FROM_EMAIL') ?? 'Compliance Guard <onboarding@resend.dev>';

  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Missing Supabase env' }), { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const now = Date.now();
  const horizon = new Date(now + WINDOW_DAYS * DAY_MS).toISOString().split('T')[0];
  const today = new Date(now).toISOString().split('T')[0];

  // Pull documents with a printed expiration date due within the window.
  const { data: docs, error } = await supabase
    .from('facility_documents')
    .select('facility_id, name, document_type, metadata, status')
    .in('status', ['approved', 'pending']);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const expiring: ExpiringDoc[] = (docs ?? [])
    .map((d: Record<string, unknown>) => {
      const meta = (d.metadata ?? null) as Record<string, unknown> | null;
      const exp = typeof meta?.ai_extracted_expiration === 'string' ? meta.ai_extracted_expiration : null;
      return exp
        ? {
            facility_id: d.facility_id as string,
            name: (d.name as string) ?? null,
            document_type: (d.document_type as string) ?? null,
            expiration: exp,
          }
        : null;
    })
    .filter((d): d is ExpiringDoc => d !== null && d.expiration <= horizon);

  // Group by facility and resolve a recipient (assigned director's email).
  const byFacility = new Map<string, ExpiringDoc[]>();
  for (const d of expiring) {
    const list = byFacility.get(d.facility_id) ?? [];
    list.push(d);
    byFacility.set(d.facility_id, list);
  }

  let emailsSent = 0;
  for (const [facilityId, items] of byFacility) {
    const { data: facility } = await supabase
      .from('facilities')
      .select('name, director_id')
      .eq('id', facilityId)
      .single();
    if (!facility?.director_id) continue;

    const { data: director } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', facility.director_id)
      .single();
    if (!director?.email) continue;

    const lines = items
      .sort((a, b) => a.expiration.localeCompare(b.expiration))
      .map((i) => `• ${i.name ?? i.document_type ?? 'Document'} — ${i.expiration <= today ? 'EXPIRED' : 'expires'} ${i.expiration}`)
      .join('<br/>');

    const html = `<p>Hi ${director.full_name ?? 'there'},</p>
      <p>The following items at <b>${facility.name}</b> need attention before your next inspection:</p>
      <p>${lines}</p>
      <p>Open Compliance Guard Pro to renew them.</p>`;

    if (!resendKey) {
      console.log(`[renewal-alerts] (dry run) would email ${director.email}: ${items.length} item(s)`);
      continue;
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: fromEmail,
        to: director.email,
        subject: `${items.length} compliance item(s) need renewal — ${facility.name}`,
        html,
      }),
    });
    if (res.ok) emailsSent += 1;
    else console.error(`[renewal-alerts] email failed for ${director.email}: ${await res.text()}`);
  }

  return new Response(
    JSON.stringify({ facilities: byFacility.size, expiringDocs: expiring.length, emailsSent }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
