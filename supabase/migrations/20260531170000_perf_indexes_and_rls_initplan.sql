-- =============================================================================
-- PERFORMANCE HARDENING FOR SCALE
-- =============================================================================
-- Source: Supabase performance advisors (run via MCP get_advisors).
--
-- Two classes of fix, both purely additive / non-destructive:
--
--   1. COVERING INDEXES FOR FOREIGN KEYS
--      Every tenant query funnels through org_id / facility_id joins, and the
--      RLS helper `current_org_facility_ids()` filters facilities by org_id.
--      Without covering indexes these become sequential scans as row counts
--      grow — the #1 thing that degrades under real customer load.
--
--   2. RLS INITPLAN OPTIMIZATION
--      Policies that call `auth.uid()` directly re-evaluate it once PER ROW.
--      Wrapping it as `(select auth.uid())` lets Postgres evaluate it once per
--      statement (an initplan), which is dramatically faster on wide scans.
--      Semantics are identical; only the evaluation count changes.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Covering indexes for unindexed foreign keys
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_facilities_org_id
  ON public.facilities (org_id);

CREATE INDEX IF NOT EXISTS idx_facility_documents_facility_id
  ON public.facility_documents (facility_id);

CREATE INDEX IF NOT EXISTS idx_personnel_facility_id
  ON public.personnel (facility_id);

CREATE INDEX IF NOT EXISTS idx_profiles_org_id
  ON public.profiles (org_id);

-- ---------------------------------------------------------------------------
-- 2. RLS initplan: wrap auth.uid() in a scalar subquery so it is evaluated
--    once per statement instead of once per row. Logic is unchanged.
-- ---------------------------------------------------------------------------

-- profiles: own-row read (role: public = anon + authenticated)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING ((select auth.uid()) = id);

-- profiles: own-row update (role: public)
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING ((select auth.uid()) = id);

-- audit_logs: own-org read (role: authenticated).
--
-- SECURITY FIX (not just perf): the previous policy was
--   facility_id IN (SELECT audit_logs.facility_id FROM profiles WHERE profiles.id = auth.uid())
-- `profiles` has no facility_id column, so `audit_logs.facility_id` inside the
-- subquery is a CORRELATED reference to the outer row. The predicate therefore
-- reduced to `facility_id IN (facility_id)` => TRUE for every row as long as the
-- caller had any profile. Net effect: any authenticated user could read EVERY
-- org's audit logs. We re-scope to the caller's own organization using the same
-- org helper already used by personnel/facility_documents policies.
DROP POLICY IF EXISTS "Users can view own facility audit logs" ON public.audit_logs;
CREATE POLICY "Users can view own facility audit logs"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (facility_id IN (SELECT public.current_org_facility_ids()));
