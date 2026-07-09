-- =============================================================================
-- AUTHOR: Alzheimer's Special Care Unit (ASCU) Disclosure Statement
-- =============================================================================
-- Arkansas treats the ASCU disclosure as a distinct, state-approved document,
-- separate from the general ALF "Comprehensive Disclosure Statement". A facility
-- that markets/operates an Alzheimer's Special Care Unit must provide this
-- disclosure to residents/families before admission, and it is reviewed
-- annually (Ark. Code Ann. § 20-10-111 and the ALF/ASCU rules, e.g. 016.25.19).
--
-- Modeled as a memory_care-gated facility requirement so it lights up only when
-- the Alzheimer's / Memory Care Unit scope toggle is ON. Scope mirrors the other
-- memory-care rows: nursing_facility + ALF I/II.
--
-- Idempotent: guarded with WHERE NOT EXISTS (by requirement_name).
-- =============================================================================

INSERT INTO public.compliance_criteria
  (facility_type, requirement_name, required_document_type, severity, frequency, description,
   sub_classification, is_scored, score_category, applicable_roles, task_kind, attestation_allowed,
   regulatory_body, applicable_license_types)
SELECT * FROM (VALUES
  ('nursing_home','Alzheimer''s Special Care Unit Disclosure Statement','disclosure_statement','critical','annual',
   'State-approved written disclosure specific to the Alzheimer''s Special Care Unit, provided to residents/representatives and families before admission. Describes the unit''s philosophy and form of care, admission/discharge criteria, staff training, minimum direct-care staffing, and related costs. Reviewed at least annually (Ark. Code Ann. § 20-10-111 / ASCU rules).',
   'memory_care',true,'facility',NULL::text[],'document',false,'AR_DHS_DPSQA_OLTC',
   ARRAY['nursing_facility','assisted_living_i','assisted_living_ii'])
) AS t(facility_type,requirement_name,required_document_type,severity,frequency,description,sub_classification,is_scored,score_category,applicable_roles,task_kind,attestation_allowed,regulatory_body,applicable_license_types)
WHERE NOT EXISTS (SELECT 1 FROM public.compliance_criteria c WHERE c.requirement_name = t.requirement_name);
