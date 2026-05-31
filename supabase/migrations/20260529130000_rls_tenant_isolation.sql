-- =============================================================================
-- RLS TENANT ISOLATION HARDENING
-- =============================================================================
-- PROBLEM (pre-migration state):
--   Every tenant table carried a permissive `SELECT ... USING (true)` policy for
--   the `anon` + `authenticated` roles, and the storage bucket had a "Public
--   Access" ALL policy. Because Postgres RLS combines permissive policies with
--   OR, these wide-open policies overrode the correctly-scoped ones that also
--   existed. Net effect: anyone holding the public anon key could read EVERY
--   org's facilities, personnel, and documents via the REST/storage API, and the
--   document bucket was world-readable.
--
-- WHY THIS IS SAFE FOR THE APP:
--   * All server actions use the service-role (admin) client, which bypasses RLS
--     entirely and already enforces `org_id` ownership in code.
--   * The ONLY browser-side (anon/authenticated key) operations are:
--       - INSERT into public.facility_documents
--       - upload/read of objects in the `facility-documents` bucket
--     Document VIEWING uses server-generated signed URLs (service role), so a
--     private bucket continues to work.
--   This migration grants exactly those browser operations, scoped to the
--   caller's own organization, and removes all anon/public access.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Helper functions (SECURITY DEFINER so they read profiles/facilities
--    without tripping RLS or recursing). Fixed search_path per linter guidance.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.current_org_facility_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.id
  FROM public.facilities f
  WHERE f.org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
$$;

-- Only `authenticated` policies reference these helpers; anon never needs them.
-- (Keeping anon out also clears the anon_security_definer advisor warning.)
GRANT EXECUTE ON FUNCTION public.current_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_org_facility_ids() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.current_org_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_org_facility_ids() FROM anon;

-- ---------------------------------------------------------------------------
-- 1. facilities — own-org read only (writes happen server-side via admin)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow anon and auth to create facilities" ON public.facilities;
DROP POLICY IF EXISTS "Allow anon and auth to view facilities" ON public.facilities;
DROP POLICY IF EXISTS "facilities_select_own_org" ON public.facilities;

CREATE POLICY "facilities_select_own_org"
  ON public.facilities FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());

-- ---------------------------------------------------------------------------
-- 2. facility_documents — own-org read + insert (browser uploads insert here)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Enable insert access for all users" ON public.facility_documents;
DROP POLICY IF EXISTS "Enable read access for documents" ON public.facility_documents;
DROP POLICY IF EXISTS "Enable select access for all users" ON public.facility_documents;
DROP POLICY IF EXISTS "Users can view their facility documents" ON public.facility_documents;
DROP POLICY IF EXISTS "facility_documents_select_own_org" ON public.facility_documents;
DROP POLICY IF EXISTS "facility_documents_insert_own_org" ON public.facility_documents;

CREATE POLICY "facility_documents_select_own_org"
  ON public.facility_documents FOR SELECT TO authenticated
  USING (facility_id IN (SELECT public.current_org_facility_ids()));

CREATE POLICY "facility_documents_insert_own_org"
  ON public.facility_documents FOR INSERT TO authenticated
  WITH CHECK (facility_id IN (SELECT public.current_org_facility_ids()));

-- ---------------------------------------------------------------------------
-- 3. personnel — own-org read only (inserts happen server-side via admin)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Enable insert access" ON public.personnel;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.personnel;
DROP POLICY IF EXISTS "Users can view their facility personnel" ON public.personnel;
DROP POLICY IF EXISTS "personnel_select_own_org" ON public.personnel;

CREATE POLICY "personnel_select_own_org"
  ON public.personnel FOR SELECT TO authenticated
  USING (facility_id IN (SELECT public.current_org_facility_ids()));

-- ---------------------------------------------------------------------------
-- 4. organizations — own org read only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow anon and auth to create organizations" ON public.organizations;
DROP POLICY IF EXISTS "Allow anon and auth to view organizations" ON public.organizations;
DROP POLICY IF EXISTS "Users can see their own org" ON public.organizations;
DROP POLICY IF EXISTS "Users can view their own organization" ON public.organizations;
DROP POLICY IF EXISTS "organizations_select_own" ON public.organizations;

CREATE POLICY "organizations_select_own"
  ON public.organizations FOR SELECT TO authenticated
  USING (id = public.current_org_id());

-- ---------------------------------------------------------------------------
-- 5. regulatory_roles — shared reference data (RLS was on with NO policy,
--    which silently blocked any non-admin read). Make it public read-only.
--    compliance_criteria already has a public read policy and is left as-is.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "regulatory_roles_public_read" ON public.regulatory_roles;
CREATE POLICY "regulatory_roles_public_read"
  ON public.regulatory_roles FOR SELECT TO anon, authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- 6. STORAGE: make the bucket private and scope objects by facility -> org.
--    Path convention across all uploaders is `${facilityId}/...`, so the first
--    folder segment is the facility id.
-- ---------------------------------------------------------------------------
UPDATE storage.buckets SET public = false WHERE id = 'facility-documents';

DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "facility_docs_select_own_org" ON storage.objects;
DROP POLICY IF EXISTS "facility_docs_insert_own_org" ON storage.objects;
DROP POLICY IF EXISTS "facility_docs_update_own_org" ON storage.objects;
DROP POLICY IF EXISTS "facility_docs_delete_own_org" ON storage.objects;

CREATE POLICY "facility_docs_select_own_org"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'facility-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT fid::text FROM public.current_org_facility_ids() AS fid
    )
  );

CREATE POLICY "facility_docs_insert_own_org"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'facility-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT fid::text FROM public.current_org_facility_ids() AS fid
    )
  );

CREATE POLICY "facility_docs_update_own_org"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'facility-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT fid::text FROM public.current_org_facility_ids() AS fid
    )
  );

CREATE POLICY "facility_docs_delete_own_org"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'facility-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT fid::text FROM public.current_org_facility_ids() AS fid
    )
  );

-- ---------------------------------------------------------------------------
-- 7. Harden existing function search_paths (linter: function_search_path_mutable)
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('match_regulations', 'match_regulations_v2')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', r.sig);
  END LOOP;
END $$;
