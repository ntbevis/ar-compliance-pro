-- =============================================================================
-- NURSYS PHASE 2 — automated rotation, server-side polling, alerting
-- =============================================================================
-- Adds the infrastructure for:
--   1. Vault-backed Nursys API password (read by the app, rotated by a cron job)
--   2. A shared cron secret (Vault) so pg_cron can authenticate to the app's
--      /api/cron/* routes without the secret living in env or source.
--   3. Bookkeeping tables: integration_alerts (system alerts) and
--      nursys_integration_state (rotation/poll timestamps).
--   4. Scheduled pg_cron jobs that call the app's cron routes via pg_net.
--
-- All new objects are service-role only (RLS enabled, no anon/authenticated
-- policy; RPCs revoked from anon/authenticated and granted to service_role).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Persist the requirement type key so the server-side poller can create a
--    correctly-typed compliance document (must equal the requirement typeKey).
-- ---------------------------------------------------------------------------
ALTER TABLE public.nursys_verifications ADD COLUMN IF NOT EXISTS type_key text;

-- ---------------------------------------------------------------------------
-- 2. System alert log (rotation failures, etc.). Service-role only.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.integration_alerts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration text NOT NULL,
  severity    text NOT NULL DEFAULT 'error' CHECK (severity IN ('info','warning','error','critical')),
  message     text NOT NULL,
  context     jsonb,
  resolved_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_integration_alerts_unresolved
  ON public.integration_alerts (created_at DESC) WHERE resolved_at IS NULL;
ALTER TABLE public.integration_alerts ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. Single-row integration state (rotation cadence + last poll).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nursys_integration_state (
  id                  boolean PRIMARY KEY DEFAULT true CHECK (id),
  password_rotated_at timestamptz,
  last_poll_at        timestamptz,
  last_rotation_status text,
  last_rotation_error  text,
  updated_at          timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.nursys_integration_state (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.nursys_integration_state ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 4. Vault: seed a random shared cron secret (only if it doesn't exist yet).
--    The Nursys password secret is seeded by the first rotation run, not here,
--    so the real password never lives in a migration file.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'cron_secret') THEN
    PERFORM vault.create_secret(
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      'cron_secret',
      'Shared secret pg_cron sends to the app /api/cron/* routes'
    );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Service-role-only RPCs (public schema so PostgREST .rpc() can reach them,
--    but EXECUTE revoked from anon/authenticated). SECURITY DEFINER + empty
--    search_path with fully-qualified vault references.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_cron_secret()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_nursys_password()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'nursys_api_password' LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.set_nursys_password(new_secret text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE sid uuid;
BEGIN
  SELECT id INTO sid FROM vault.secrets WHERE name = 'nursys_api_password';
  IF sid IS NULL THEN
    PERFORM vault.create_secret(new_secret, 'nursys_api_password', 'Nursys e-Notify API password (auto-rotated)');
  ELSE
    PERFORM vault.update_secret(sid, new_secret);
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.get_cron_secret() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_nursys_password() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_nursys_password(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_cron_secret() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_nursys_password() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_nursys_password(text) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Schedule cron jobs (idempotent: unschedule-if-exists, then schedule).
--    Poll every 5 minutes; attempt rotation daily (the route no-ops unless the
--    password is older than its rotation threshold).
-- ---------------------------------------------------------------------------
DO $$ BEGIN PERFORM cron.unschedule('nursys-poll');   EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('nursys-rotate'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'nursys-poll',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://app.complianceguardpro.io/api/cron/nursys-poll',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.get_cron_secret()),
    body    := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'nursys-rotate',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://app.complianceguardpro.io/api/cron/nursys-rotate',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.get_cron_secret()),
    body    := '{}'::jsonb
  );
  $$
);
