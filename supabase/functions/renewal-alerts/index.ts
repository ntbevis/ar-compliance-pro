// Supabase Edge Function: renewal-alerts
// =============================================================================
// Scheduled daily job that emails the responsible person at each facility a
// SINGLE digest of credentials/documents that are expiring soon or already
// expired. One email per recipient per run — never one email per document.
//
// Recipient rule (per facility):
//   • the facility's assigned DIRECTOR, if one exists; otherwise
//   • the ORG OWNER, who is assumed to be acting in a director capacity.
//   (Owners are NOT cc'd when a director exists — no inbox clutter.)
// If one person is responsible for several facilities, they receive a single
// email with a section per facility, not one email each.
//
// Anti-spam: alerts are idempotent per (document, urgency bucket, expiration).
// An item is escalated at most once as it enters each bucket — 30 days out,
// 7 days out, and on/after expiry — so a daily schedule never repeats itself.
//
// Security: if CRON_SECRET is set, the request must send a matching
// `x-cron-secret` header. Deployed with verify_jwt=false so pg_cron can call it.
//
// Email: sends via Resend when RESEND_API_KEY is set; otherwise it performs a
// safe DRY RUN (logs intended recipients, writes nothing) so it can be deployed
// and scheduled before the email provider is connected.
//
// Required secrets (set in Supabase dashboard → Edge Functions → Secrets):
//   RESEND_API_KEY      provider key (omit to keep dry-run)
//   ALERT_FROM_EMAIL    e.g. "Compliance Guard <alerts@yourdomain.com>"
//   CRON_SECRET         shared secret the cron job sends (recommended)
//   APP_URL             optional, link shown in the email (defaults below)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.
// =============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

const WINDOW_DAYS = 30;
const DAY_MS = 1000 * 60 * 60 * 24;

type Bucket = 'd30' | 'd7' | 'expired';

interface ExpiringDoc {
  id: string;
  facility_id: string;
  name: string | null;
  document_type: string | null;
  expiration: string; // YYYY-MM-DD
  daysUntil: number;
  bucket: Bucket;
}

interface FacilitySection {
  facilityName: string;
  items: ExpiringDoc[];
  newItems: ExpiringDoc[];
}

function bucketFor(daysUntil: number): Bucket {
  if (daysUntil <= 0) return 'expired';
  if (daysUntil <= 7) return 'd7';
  return 'd30';
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function rowsHtml(items: ExpiringDoc[]): string {
  return [...items]
    .sort((a, b) => a.expiration.localeCompare(b.expiration))
    .map((i) => {
      const label = escapeHtml(i.name ?? i.document_type ?? 'Document');
      const state =
        i.bucket === 'expired'
          ? `<span style="color:#dc2626;font-weight:600">EXPIRED ${i.expiration}</span>`
          : `expires ${i.expiration} (${i.daysUntil}d)`;
      return `<tr><td style="padding:6px 12px 6px 0">${label}</td><td style="padding:6px 0">${state}</td></tr>`;
    })
    .join('');
}

Deno.serve(async (req: Request) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const cronSecret = Deno.env.get('CRON_SECRET');
  const fromEmail = Deno.env.get('ALERT_FROM_EMAIL') ?? 'Compliance Guard <onboarding@resend.dev>';
  const appUrl = Deno.env.get('APP_URL') ?? 'https://app.complianceguard.pro';

  // Shared-secret guard (enforced only once CRON_SECRET is configured).
  if (cronSecret && req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Missing Supabase env' }), { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const now = Date.now();
  const horizon = new Date(now + WINDOW_DAYS * DAY_MS).toISOString().split('T')[0];
  const dryRun = !resendKey;

  // 1. Documents with a printed (AI-extracted) expiration within the window.
  const { data: docs, error } = await supabase
    .from('facility_documents')
    .select('id, facility_id, name, document_type, metadata, status')
    .in('status', ['approved', 'pending']);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const expiring: ExpiringDoc[] = [];
  for (const d of docs ?? []) {
    const meta = (d.metadata ?? null) as Record<string, unknown> | null;
    const exp = typeof meta?.ai_extracted_expiration === 'string' ? meta.ai_extracted_expiration : null;
    if (!exp || exp > horizon) continue;
    const daysUntil = Math.floor((new Date(exp).getTime() - now) / DAY_MS);
    expiring.push({
      id: d.id as string,
      facility_id: d.facility_id as string,
      name: (d.name as string) ?? null,
      document_type: (d.document_type as string) ?? null,
      expiration: exp,
      daysUntil,
      bucket: bucketFor(daysUntil),
    });
  }

  if (expiring.length === 0) {
    return new Response(JSON.stringify({ expiringDocs: 0, emailsSent: 0, dryRun }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 2. Which (document, bucket, expiration) combinations have we already sent?
  const docIds = [...new Set(expiring.map((e) => e.id))];
  const { data: alreadySent } = await supabase
    .from('renewal_alerts_log')
    .select('document_id, bucket, expiration')
    .in('document_id', docIds);

  const sentKeys = new Set(
    (alreadySent ?? []).map(
      (r: { document_id: string; bucket: string; expiration: string }) =>
        `${r.document_id}|${r.bucket}|${r.expiration}`
    )
  );
  const keyOf = (e: ExpiringDoc) => `${e.id}|${e.bucket}|${e.expiration}`;

  // 3. Group items by facility.
  const byFacility = new Map<string, ExpiringDoc[]>();
  for (const e of expiring) {
    const list = byFacility.get(e.facility_id) ?? [];
    list.push(e);
    byFacility.set(e.facility_id, list);
  }

  // 4. Resolve each facility's recipient and bucket facilities under that person,
  //    so everyone gets exactly ONE consolidated email.
  const byRecipient = new Map<string, { name: string | null; sections: FacilitySection[] }>();

  for (const [facilityId, items] of byFacility) {
    const newItems = items.filter((e) => !sentKeys.has(keyOf(e)));
    if (newItems.length === 0) continue; // nothing newly escalated for this facility

    const { data: facility } = await supabase
      .from('facilities')
      .select('name, org_id, director_id')
      .eq('id', facilityId)
      .single();
    if (!facility) continue;

    let recipientEmail: string | null = null;
    let recipientName: string | null = null;

    if (facility.director_id) {
      const { data: director } = await supabase
        .from('profiles')
        .select('email, full_name, account_status')
        .eq('id', facility.director_id)
        .maybeSingle();
      if (director?.email && director.account_status !== 'deactivated') {
        recipientEmail = director.email as string;
        recipientName = (director.full_name as string) ?? null;
      }
    }

    if (!recipientEmail) {
      const { data: owner } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('org_id', facility.org_id)
        .eq('role', 'owner')
        .eq('account_status', 'active')
        .not('email', 'is', null)
        .limit(1)
        .maybeSingle();
      if (owner?.email) {
        recipientEmail = owner.email as string;
        recipientName = (owner.full_name as string) ?? null;
      }
    }

    if (!recipientEmail) continue; // no one to notify

    const entry = byRecipient.get(recipientEmail) ?? { name: recipientName, sections: [] };
    entry.sections.push({ facilityName: facility.name as string, items, newItems });
    byRecipient.set(recipientEmail, entry);
  }

  // 5. Send one digest email per recipient.
  let emailsSent = 0;
  let facilitiesNotified = 0;
  const logRows: { document_id: string; facility_id: string; bucket: string; expiration: string }[] = [];

  for (const [email, { name, sections }] of byRecipient) {
    const totalItems = sections.reduce((n, s) => n + s.items.length, 0);
    const multi = sections.length > 1;

    const sectionsHtml = sections
      .sort((a, b) => a.facilityName.localeCompare(b.facilityName))
      .map((s) => {
        const heading = multi
          ? `<h3 style="margin:18px 0 6px;font-size:15px;color:#0f172a">${escapeHtml(s.facilityName)}</h3>`
          : '';
        return `${heading}<table style="border-collapse:collapse;font-size:14px">${rowsHtml(s.items)}</table>`;
      })
      .join('');

    const intro = multi
      ? `You have compliance items needing attention across <b>${sections.length} facilities</b>:`
      : `The following items at <b>${escapeHtml(sections[0].facilityName)}</b> need attention before your next inspection:`;

    const html = `<div style="font-family:system-ui,Arial,sans-serif;color:#0f172a">
      <p>Hi ${escapeHtml(name ?? 'there')},</p>
      <p>${intro}</p>
      ${sectionsHtml}
      <p style="margin-top:16px"><a href="${appUrl}" style="color:#2563eb">Open Compliance Guard Pro</a> to renew them.</p>
      <p style="color:#94a3b8;font-size:12px">You're receiving this because you're the director (or acting director) for ${multi ? 'these facilities' : 'this facility'}.</p>
    </div>`;

    const subject = multi
      ? `Compliance renewals need attention — ${sections.length} facilities`
      : `${totalItems} compliance item(s) need renewal — ${escapeHtml(sections[0].facilityName)}`;

    if (dryRun) {
      console.log(`[renewal-alerts] (dry run) → ${email}: ${sections.length} facility section(s), ${totalItems} item(s)`);
      facilitiesNotified += sections.length;
      continue; // do not write the log in dry-run, so the first live run still sends
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromEmail, to: email, subject, html }),
    });

    if (res.ok) {
      emailsSent += 1;
      facilitiesNotified += sections.length;
      for (const s of sections) {
        for (const e of s.newItems) {
          logRows.push({ document_id: e.id, facility_id: e.facility_id, bucket: e.bucket, expiration: e.expiration });
        }
      }
    } else {
      console.error(`[renewal-alerts] email failed for ${email}: ${await res.text()}`);
    }
  }

  // 6. Record what we sent so we don't repeat the same bucket tomorrow.
  if (logRows.length > 0) {
    const { error: logError } = await supabase
      .from('renewal_alerts_log')
      .upsert(logRows, { onConflict: 'document_id,bucket,expiration', ignoreDuplicates: true });
    if (logError) console.error('[renewal-alerts] failed to write log:', logError.message);
  }

  return new Response(
    JSON.stringify({
      expiringDocs: expiring.length,
      recipientsNotified: dryRun ? byRecipient.size : emailsSent,
      facilitiesNotified,
      emailsSent,
      dryRun,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
