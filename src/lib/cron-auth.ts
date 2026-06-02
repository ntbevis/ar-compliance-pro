import { createAdminClient } from 'src/app/utils/supabase/admin';

/**
 * Validates a request from pg_cron by comparing the `x-cron-secret` header to
 * the shared secret stored in Supabase Vault. Both pg_cron and this app read
 * the same Vault value, so the secret never lives in env or source.
 */
export async function isValidCronRequest(req: Request): Promise<boolean> {
  const provided = req.headers.get('x-cron-secret');
  if (!provided) return false;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('get_cron_secret');
    if (error || typeof data !== 'string' || data.length === 0) return false;
    return provided === data;
  } catch {
    return false;
  }
}
