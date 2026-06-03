-- =============================================================================
-- BACKFILL LICENSE TYPES + ADE / DHS / ADH REGULATORY REALIGNMENT
-- =============================================================================
-- Brings the EXISTING catalog and facilities in line with the new columns:
--   1. Backfill facilities.license_type from the broad facility_type so no
--      facility is left without an exact license.
--   2. Re-tag the childcare catalog to ADE_OEC (Arkansas Dept. of Education,
--      Office of Early Childhood) and scrub stale DHS/DCCECE prose. Childcare
--      licensing in Arkansas is administered by ADE's Office of Early Childhood
--      (via DESE) -- it is NOT a DHS function.
--   3. Tag long-term care rows AR_DHS_DPSQA_OLTC.
--   4. Relocate any hospice rules to ADH (Arkansas Department of Health), which
--      licenses hospice -- NOT the DHS Office of Long Term Care.
--
-- Idempotent: guarded UPDATEs only touch rows that still need it.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Backfill facilities.license_type from facility_type.
--    Existing nursing homes default to the Nursing Facility license; existing
--    childcare facilities default to the Licensed Child Care Center license.
--    Owners can correct the exact subtype from facility settings afterward.
-- ---------------------------------------------------------------------------
UPDATE public.facilities
SET license_type = 'nursing_facility'
WHERE facility_type = 'nursing_home'
  AND (license_type IS NULL OR length(btrim(license_type)) = 0);

UPDATE public.facilities
SET license_type = 'childcare_center'
WHERE facility_type = 'childcare_center'
  AND (license_type IS NULL OR length(btrim(license_type)) = 0);

-- ---------------------------------------------------------------------------
-- 2. Childcare catalog -> ADE_OEC.
--    First move hospice-looking rows out of the way (none expected in
--    childcare, but keep the realignment exhaustive), then tag the rest.
-- ---------------------------------------------------------------------------
UPDATE public.compliance_criteria
SET regulatory_body = 'ADE_OEC'
WHERE facility_type = 'childcare_center'
  AND regulatory_body IS DISTINCT FROM 'ADE_OEC';

-- Scrub stale "DHS" / "DCCECE" / "Division of Child Care..." references in the
-- childcare prose so customer-facing copy reflects the ADE Office of Early
-- Childhood. (DCCECE -> Office of Early Childhood; DHS -> ADE.)
UPDATE public.compliance_criteria
SET description = regexp_replace(
      description,
      'Division of Child Care and Early Childhood Education \(DCCECE\)',
      'Office of Early Childhood (OEC)',
      'gi'
    )
WHERE facility_type = 'childcare_center'
  AND description ILIKE '%DCCECE%';

UPDATE public.compliance_criteria
SET description = regexp_replace(description, 'DCCECE', 'Office of Early Childhood', 'g')
WHERE facility_type = 'childcare_center'
  AND description LIKE '%DCCECE%';

UPDATE public.compliance_criteria
SET requirement_name = regexp_replace(requirement_name, 'DCCECE', 'OEC', 'g')
WHERE facility_type = 'childcare_center'
  AND requirement_name LIKE '%DCCECE%';

-- Department-of-Human-Services attributions in childcare prose now point at the
-- Arkansas Department of Education (ADE). Department of Health references are
-- left intact -- ADH genuinely co-regulates childcare sanitation/inspections.
UPDATE public.compliance_criteria
SET description = regexp_replace(
      description,
      'Arkansas Department of Human Services \(DHS\)',
      'Arkansas Department of Education (ADE)',
      'gi'
    )
WHERE facility_type = 'childcare_center'
  AND description ILIKE '%Department of Human Services%';

-- ---------------------------------------------------------------------------
-- 3. Long-term care catalog -> AR_DHS_DPSQA_OLTC (default), except hospice.
-- ---------------------------------------------------------------------------
UPDATE public.compliance_criteria
SET regulatory_body = 'AR_DHS_DPSQA_OLTC'
WHERE facility_type = 'nursing_home'
  AND regulatory_body IS NULL;

-- ---------------------------------------------------------------------------
-- 4. Hospice -> ADH. Hospice is licensed by the Arkansas Department of Health,
--    not the DHS Office of Long Term Care. Re-tag any hospice-flavored rows so
--    we never present hospice as an OLTC license.
-- ---------------------------------------------------------------------------
UPDATE public.compliance_criteria
SET regulatory_body = 'ADH'
WHERE facility_type = 'nursing_home'
  AND (requirement_name ILIKE '%hospice%' OR description ILIKE '%hospice%');
