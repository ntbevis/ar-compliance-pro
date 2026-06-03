-- =============================================================================
-- PERSONNEL SELF-RECORDS + PERSONNEL_ROLES (self-compliance, layer 2)
-- =============================================================================
-- Objective 1 ("both layers"): the actual document requirements and scoring
-- live on a `personnel` row. This migration lets:
--   1. A personnel row represent the logged-in user (`profile_id`,
--      `is_self_record`) so owners/directors who also work a regulated title
--      (e.g. they are the LPN) carry their own personnel requirements.
--   2. A single person hold MULTIPLE regulatory titles via `personnel_roles`
--      (e.g. Administrator + LPN), so the twin-score engine evaluates the
--      union of every requirement their titles imply — not just one role.
--
-- `personnel.role` is retained as the PRIMARY title for backward compatibility
-- with existing UI and queries; `personnel_roles` is the authoritative
-- multi-title set the engine unions over.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Link personnel to an app account + flag self-records.
-- ---------------------------------------------------------------------------
ALTER TABLE public.personnel
  ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.personnel
  ADD COLUMN IF NOT EXISTS is_self_record boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_personnel_profile_id
  ON public.personnel (profile_id);

-- At most one self-record per (profile, facility): a user is one person at a
-- given facility, even if they hold several titles there.
CREATE UNIQUE INDEX IF NOT EXISTS uq_personnel_self_per_facility
  ON public.personnel (profile_id, facility_id)
  WHERE is_self_record = true;

-- ---------------------------------------------------------------------------
-- 2. personnel_roles — additional regulatory titles a person holds.
--    role_name is the source of truth used by the matcher; regulatory_role_id
--    is a soft FK for integrity/reporting.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.personnel_roles (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  personnel_id       bigint NOT NULL REFERENCES public.personnel(id) ON DELETE CASCADE,
  role_name          text NOT NULL,
  regulatory_role_id uuid REFERENCES public.regulatory_roles(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT personnel_roles_unique UNIQUE (personnel_id, role_name)
);

CREATE INDEX IF NOT EXISTS idx_personnel_roles_personnel
  ON public.personnel_roles (personnel_id);

ALTER TABLE public.personnel_roles ENABLE ROW LEVEL SECURITY;

-- Org-scoped reads (a personnel row's facility must belong to the caller's
-- org); all writes go through service-role server actions.
DROP POLICY IF EXISTS "personnel_roles_select_own_org" ON public.personnel_roles;
CREATE POLICY "personnel_roles_select_own_org"
  ON public.personnel_roles FOR SELECT TO authenticated
  USING (
    personnel_id IN (
      SELECT p.id FROM public.personnel p
      WHERE p.facility_id IN (SELECT public.current_org_facility_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Backfill personnel_roles from the existing single-role column so the
--    multi-role matcher has parity with today's behavior on day one.
-- ---------------------------------------------------------------------------
INSERT INTO public.personnel_roles (personnel_id, role_name)
SELECT p.id, p.role
FROM public.personnel p
WHERE p.role IS NOT NULL
  AND length(btrim(p.role)) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.personnel_roles pr
    WHERE pr.personnel_id = p.id AND pr.role_name = p.role
  );
