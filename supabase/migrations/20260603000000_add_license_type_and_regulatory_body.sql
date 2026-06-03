-- =============================================================================
-- LICENSE TYPE + REGULATORY BODY COLUMNS
-- =============================================================================
-- Objectives 2 & 3 of the Roles & Arkansas Regulatory Realignment.
--
-- We keep `facility_type` as the broad 2-value sector ('childcare_center' |
-- 'nursing_home') to limit blast radius, and layer an ADDITIVE, exact
-- `license_type` on top so the compliance engine can filter strictly by the
-- precise Arkansas license a facility actually holds:
--
--   Childcare (ADE Office of Early Childhood):
--     childcare_center | childcare_family_home | registered_family_home | ost
--   Long-Term Care (DHS DPSQA / Office of Long Term Care):
--     nursing_facility | assisted_living_i | assisted_living_ii |
--     residential_care | icf_iid | prtf | adult_day_care | post_acute_head_injury
--
-- `regulatory_body` records the authority a criterion belongs to so the
-- childcare catalog can be realigned away from DHS/DCCECE to ADE_OEC, and so
-- hospice rules (Arkansas Department of Health) are never mislabeled as OLTC.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. facilities.license_type — the exact license a facility holds.
--    Nullable for now; backfilled in 20260603030000.
-- ---------------------------------------------------------------------------
ALTER TABLE public.facilities
  ADD COLUMN IF NOT EXISTS license_type text;

CREATE INDEX IF NOT EXISTS idx_facilities_license_type
  ON public.facilities (license_type);

-- ---------------------------------------------------------------------------
-- 2. compliance_criteria.applicable_license_types — text[] of exact license
--    types this rule is scoped to. NULL/empty = applies to ALL license types
--    within the rule's facility_type (the common case for sector-wide rules).
-- ---------------------------------------------------------------------------
ALTER TABLE public.compliance_criteria
  ADD COLUMN IF NOT EXISTS applicable_license_types text[];

-- GIN index so `facility.license_type = ANY(applicable_license_types)` style
-- containment lookups stay fast as the catalog grows.
CREATE INDEX IF NOT EXISTS idx_compliance_criteria_applicable_license_types
  ON public.compliance_criteria USING gin (applicable_license_types);

-- ---------------------------------------------------------------------------
-- 3. compliance_criteria.regulatory_body — the governing authority.
--    Allowed values:
--      ADE_OEC            Arkansas Dept. of Education, Office of Early Childhood
--      AR_DHS_DPSQA_OLTC  DHS Division of Provider Services & QA, OLTC
--      ADH                Arkansas Department of Health (e.g. hospice, sanitation)
--      CMS                Federal Medicare/Medicaid certification overlay
-- ---------------------------------------------------------------------------
ALTER TABLE public.compliance_criteria
  ADD COLUMN IF NOT EXISTS regulatory_body text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'compliance_criteria_regulatory_body_check'
  ) THEN
    ALTER TABLE public.compliance_criteria
      ADD CONSTRAINT compliance_criteria_regulatory_body_check
      CHECK (regulatory_body IS NULL OR regulatory_body = ANY (ARRAY[
        'ADE_OEC', 'AR_DHS_DPSQA_OLTC', 'ADH', 'CMS'
      ]));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_compliance_criteria_regulatory_body
  ON public.compliance_criteria (regulatory_body);

-- ---------------------------------------------------------------------------
-- 4. regulatory_roles.license_type — optional scope so a role can be limited
--    to an exact license type (e.g. a role that only exists at SNFs). NULL =
--    the role applies across all license types within its facility_type.
-- ---------------------------------------------------------------------------
ALTER TABLE public.regulatory_roles
  ADD COLUMN IF NOT EXISTS license_type text;

CREATE INDEX IF NOT EXISTS idx_regulatory_roles_license_type
  ON public.regulatory_roles (license_type);
