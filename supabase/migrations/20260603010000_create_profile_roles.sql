-- =============================================================================
-- PROFILE_ROLES — multiple regulatory titles per user (self-compliance, layer 1)
-- =============================================================================
-- Objective 1 ("both layers"): the logged-in user's `profile` carries the
-- regulatory titles they selected during onboarding (UX / self-identification),
-- while a linked `personnel` record (see 20260603020000) carries the actual
-- document requirements and scoring.
--
-- A user often holds MULTIPLE titles (e.g. "Nursing Home Administrator" AND
-- "LPN"), and may hold different titles at different facilities, so this is a
-- proper junction table rather than a single column on profiles.
--
-- We keep both the FK (`regulatory_role_id`) for integrity AND a denormalized
-- `role_name` + `facility_type` snapshot. The snapshot keeps the row meaningful
-- even if reference data is re-seeded, and matches how the rest of the app keys
-- off role_name strings (personnel.role, compliance_criteria.applicable_roles).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.profile_roles (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  regulatory_role_id uuid REFERENCES public.regulatory_roles(id) ON DELETE SET NULL,
  facility_id        uuid REFERENCES public.facilities(id) ON DELETE CASCADE,
  role_name          text NOT NULL,
  facility_type      text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  -- One title per (user, role, facility). NULL facility_id => an org-level
  -- title not pinned to a specific facility. (Postgres treats NULLs as
  -- distinct, which is acceptable: onboarding controls these inserts.)
  CONSTRAINT profile_roles_unique UNIQUE (profile_id, role_name, facility_id)
);

CREATE INDEX IF NOT EXISTS idx_profile_roles_profile
  ON public.profile_roles (profile_id);
CREATE INDEX IF NOT EXISTS idx_profile_roles_facility
  ON public.profile_roles (facility_id);

ALTER TABLE public.profile_roles ENABLE ROW LEVEL SECURITY;

-- Users can read their own titles; all writes go through service-role server
-- actions (which bypass RLS), mirroring the rest of the schema.
DROP POLICY IF EXISTS "profile_roles_select_own" ON public.profile_roles;
CREATE POLICY "profile_roles_select_own"
  ON public.profile_roles FOR SELECT TO authenticated
  USING (profile_id = (SELECT auth.uid()));
