-- =============================================================================
-- SEED: license-type-scoped regulatory roles + compliance criteria
-- =============================================================================
-- Adds the regulatory categories the catalog was missing once nursing homes and
-- childcare are broken out into their exact Arkansas license types. Every
-- INSERT is guarded with WHERE NOT EXISTS so the migration is idempotent.
--
--   Childcare (regulatory_body = ADE_OEC):
--     childcare_family_home, registered_family_home, ost
--   Long-Term Care (regulatory_body = AR_DHS_DPSQA_OLTC):
--     assisted_living_i, assisted_living_ii, residential_care, icf_iid, prtf,
--     adult_day_care, post_acute_head_injury
--
-- New personnel rules only reference role_names that are seeded here (or that
-- already exist), so the orphan-role audit stays clean.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. New regulatory roles for the new license subtypes.
-- ---------------------------------------------------------------------------
INSERT INTO public.regulatory_roles (role_name, facility_type, sub_classification, license_type)
SELECT v.role_name, v.facility_type, NULL, v.license_type
FROM (VALUES
  ('Family Child Care Home Provider', 'childcare_center', 'childcare_family_home'),
  ('Assisted Living Administrator',   'nursing_home',     NULL),
  ('Qualified Intellectual Disabilities Professional (QIDP)', 'nursing_home', 'icf_iid'),
  ('Adult Day Care Program Director', 'nursing_home',     'adult_day_care')
) AS v(role_name, facility_type, license_type)
WHERE NOT EXISTS (
  SELECT 1 FROM public.regulatory_roles r
  WHERE r.role_name = v.role_name AND r.facility_type = v.facility_type
);

-- ===========================================================================
-- 2. CHILDCARE (ADE Office of Early Childhood) license-type criteria
-- ===========================================================================

-- Licensed Child Care Family Home — Minimum Licensing Requirements (PUB-001)
INSERT INTO public.compliance_criteria
  (facility_type, requirement_name, required_document_type, severity, frequency,
   description, sub_classification, is_scored, score_category, applicable_roles,
   regulatory_body, applicable_license_types)
SELECT 'childcare_center', 'Family Home Minimum Licensing Compliance (PUB-001)',
       'license_certificate', 'critical', 'annual',
       'Licensed Child Care Family Homes must comply with the Minimum Licensing Requirements for Child Care Family Homes (PUB-001) administered by the ADE Office of Early Childhood.',
       NULL, true, 'facility', NULL,
       'ADE_OEC', ARRAY['childcare_family_home']
WHERE NOT EXISTS (
  SELECT 1 FROM public.compliance_criteria
  WHERE requirement_name = 'Family Home Minimum Licensing Compliance (PUB-001)'
);

-- Family Home (11+ children) — Health & Fire Department approval
INSERT INTO public.compliance_criteria
  (facility_type, requirement_name, required_document_type, severity, frequency,
   description, sub_classification, is_scored, score_category, applicable_roles,
   regulatory_body, applicable_license_types)
SELECT 'childcare_center', 'Health & Fire Department Approval (Family Home 11+)',
       'inspection_approval', 'critical', 'annual',
       'Licensed Child Care Family Homes providing care to eleven (11) or more children must obtain health and fire department approval per the ADE Office of Early Childhood Minimum Licensing Requirements.',
       NULL, true, 'facility', NULL,
       'ADE_OEC', ARRAY['childcare_family_home']
WHERE NOT EXISTS (
  SELECT 1 FROM public.compliance_criteria
  WHERE requirement_name = 'Health & Fire Department Approval (Family Home 11+)'
);

-- Family Child Care Provider Training (BAS) — personnel, provider role
INSERT INTO public.compliance_criteria
  (facility_type, requirement_name, required_document_type, severity, frequency,
   description, sub_classification, is_scored, score_category, applicable_roles,
   regulatory_body, applicable_license_types)
SELECT 'childcare_center', 'Family Child Care Provider Training (BAS)',
       'training_certificate', 'standard', 'one-time',
       'Newly licensed family child care providers shall complete the Family Child Care Provider Training (BAS) within the first six months of licensure per the ADE Office of Early Childhood.',
       NULL, true, 'personnel', ARRAY['Family Child Care Home Provider'],
       'ADE_OEC', ARRAY['childcare_family_home']
WHERE NOT EXISTS (
  SELECT 1 FROM public.compliance_criteria
  WHERE requirement_name = 'Family Child Care Provider Training (BAS)'
);

-- Registered Child Care Family Home — voluntary registration (PUB-003)
INSERT INTO public.compliance_criteria
  (facility_type, requirement_name, required_document_type, severity, frequency,
   description, sub_classification, is_scored, score_category, applicable_roles,
   regulatory_body, applicable_license_types)
SELECT 'childcare_center', 'Voluntary Registration Compliance (PUB-003)',
       'registration_confirmation', 'standard', 'annual',
       'Registered Child Care Family Homes (caring for fewer than six children) are regulated under the Registered Child Care Family Homes requirements (PUB-003) and receive periodic unannounced monitoring visits by the ADE Office of Early Childhood.',
       NULL, true, 'facility', NULL,
       'ADE_OEC', ARRAY['registered_family_home']
WHERE NOT EXISTS (
  SELECT 1 FROM public.compliance_criteria
  WHERE requirement_name = 'Voluntary Registration Compliance (PUB-003)'
);

-- Out-of-School-Time — Minimum Licensing Requirements
INSERT INTO public.compliance_criteria
  (facility_type, requirement_name, required_document_type, severity, frequency,
   description, sub_classification, is_scored, score_category, applicable_roles,
   regulatory_body, applicable_license_types)
SELECT 'childcare_center', 'Out-of-School-Time Minimum Licensing Compliance',
       'license_certificate', 'critical', 'annual',
       'Out-of-School-Time facilities (center-based, school-age only) must comply with the Minimum Licensing Requirements for Out-of-School-Time Facilities administered by the ADE Office of Early Childhood.',
       NULL, true, 'facility', NULL,
       'ADE_OEC', ARRAY['ost']
WHERE NOT EXISTS (
  SELECT 1 FROM public.compliance_criteria
  WHERE requirement_name = 'Out-of-School-Time Minimum Licensing Compliance'
);

-- ===========================================================================
-- 3. LONG-TERM CARE (DHS DPSQA / OLTC) license-type criteria
-- ===========================================================================

-- Assisted Living Level I — license
INSERT INTO public.compliance_criteria
  (facility_type, requirement_name, required_document_type, severity, frequency,
   description, sub_classification, is_scored, score_category, applicable_roles,
   regulatory_body, applicable_license_types)
SELECT 'nursing_home', 'Assisted Living Level I License',
       'license_certificate', 'critical', 'annual',
       'Level I Assisted Living Facilities must hold a current OLTC license. Level I facilities do not provide nursing services and may not serve residents who require nursing home level of care.',
       NULL, true, 'facility', NULL,
       'AR_DHS_DPSQA_OLTC', ARRAY['assisted_living_i', 'assisted_living_ii']
WHERE NOT EXISTS (
  SELECT 1 FROM public.compliance_criteria
  WHERE requirement_name = 'Assisted Living Level I License'
);

-- Assisted Living Level II — license (nursing services authorized)
INSERT INTO public.compliance_criteria
  (facility_type, requirement_name, required_document_type, severity, frequency,
   description, sub_classification, is_scored, score_category, applicable_roles,
   regulatory_body, applicable_license_types)
SELECT 'nursing_home', 'Assisted Living Level II License (Nursing Services)',
       'license_certificate', 'critical', 'annual',
       'Level II Assisted Living Facilities are licensed by OLTC to serve residents who are medically eligible for nursing home level of care or who receive the Living Choices 1915(c) waiver. A Level II license also grants Level I authority.',
       NULL, true, 'facility', NULL,
       'AR_DHS_DPSQA_OLTC', ARRAY['assisted_living_ii']
WHERE NOT EXISTS (
  SELECT 1 FROM public.compliance_criteria
  WHERE requirement_name = 'Assisted Living Level II License (Nursing Services)'
);

-- Options Counseling — nursing facilities + Level II ALF
INSERT INTO public.compliance_criteria
  (facility_type, requirement_name, required_document_type, severity, frequency,
   description, sub_classification, is_scored, score_category, applicable_roles,
   regulatory_body, applicable_license_types)
SELECT 'nursing_home', 'Options Counseling Documentation',
       'options_counseling_record', 'standard', 'ongoing',
       'Nursing homes and Level II Assisted Living Facilities must offer new residents and Medicaid applicants Options Counseling on alternatives to institutional care, and document the offer to DHS.',
       NULL, true, 'facility', NULL,
       'AR_DHS_DPSQA_OLTC', ARRAY['nursing_facility', 'assisted_living_ii']
WHERE NOT EXISTS (
  SELECT 1 FROM public.compliance_criteria
  WHERE requirement_name = 'Options Counseling Documentation'
);

-- Assisted Living Administrator credential — personnel (ALF I + II)
INSERT INTO public.compliance_criteria
  (facility_type, requirement_name, required_document_type, severity, frequency,
   description, sub_classification, is_scored, score_category, applicable_roles,
   regulatory_body, applicable_license_types)
SELECT 'nursing_home', 'Assisted Living Administrator Credential',
       'administrator_credential', 'critical', 'annual',
       'Assisted Living Facilities must be managed by an administrator who holds the credential required by OLTC for the facility level.',
       NULL, true, 'personnel', ARRAY['Assisted Living Administrator'],
       'AR_DHS_DPSQA_OLTC', ARRAY['assisted_living_i', 'assisted_living_ii']
WHERE NOT EXISTS (
  SELECT 1 FROM public.compliance_criteria
  WHERE requirement_name = 'Assisted Living Administrator Credential'
);

-- Residential Care Facility — license
INSERT INTO public.compliance_criteria
  (facility_type, requirement_name, required_document_type, severity, frequency,
   description, sub_classification, is_scored, score_category, applicable_roles,
   regulatory_body, applicable_license_types)
SELECT 'nursing_home', 'Residential Care Facility License',
       'license_certificate', 'critical', 'annual',
       'Residential Care Facilities must hold a current OLTC license appropriate to the non-nursing supportive care they provide.',
       NULL, true, 'facility', NULL,
       'AR_DHS_DPSQA_OLTC', ARRAY['residential_care']
WHERE NOT EXISTS (
  SELECT 1 FROM public.compliance_criteria
  WHERE requirement_name = 'Residential Care Facility License'
);

-- ICF/IID — active treatment plan
INSERT INTO public.compliance_criteria
  (facility_type, requirement_name, required_document_type, severity, frequency,
   description, sub_classification, is_scored, score_category, applicable_roles,
   regulatory_body, applicable_license_types)
SELECT 'nursing_home', 'ICF/IID Active Treatment Program',
       'active_treatment_plan', 'critical', 'annual',
       'Intermediate Care Facilities for Individuals with Intellectual Disabilities (ICF/IID) must maintain an active treatment program and individualized plans of care as a condition of licensure and certification.',
       NULL, true, 'facility', NULL,
       'AR_DHS_DPSQA_OLTC', ARRAY['icf_iid']
WHERE NOT EXISTS (
  SELECT 1 FROM public.compliance_criteria
  WHERE requirement_name = 'ICF/IID Active Treatment Program'
);

-- ICF/IID — QIDP designation (personnel)
INSERT INTO public.compliance_criteria
  (facility_type, requirement_name, required_document_type, severity, frequency,
   description, sub_classification, is_scored, score_category, applicable_roles,
   regulatory_body, applicable_license_types)
SELECT 'nursing_home', 'QIDP Designation & Qualifications',
       'qidp_credential', 'critical', 'annual',
       'Each ICF/IID must designate a Qualified Intellectual Disabilities Professional (QIDP) who meets the federal/state qualification standards and oversees each resident''s active treatment.',
       NULL, true, 'personnel', ARRAY['Qualified Intellectual Disabilities Professional (QIDP)'],
       'AR_DHS_DPSQA_OLTC', ARRAY['icf_iid']
WHERE NOT EXISTS (
  SELECT 1 FROM public.compliance_criteria
  WHERE requirement_name = 'QIDP Designation & Qualifications'
);

-- PRTF — certification & treatment protocols
INSERT INTO public.compliance_criteria
  (facility_type, requirement_name, required_document_type, severity, frequency,
   description, sub_classification, is_scored, score_category, applicable_roles,
   regulatory_body, applicable_license_types)
SELECT 'nursing_home', 'PRTF Certification & Treatment Protocols',
       'certification_document', 'critical', 'annual',
       'Psychiatric Residential Treatment Facilities (PRTF) serving residents under age 21 must maintain certification and physician-directed treatment protocols, including restraint/seclusion safeguards.',
       NULL, true, 'facility', NULL,
       'AR_DHS_DPSQA_OLTC', ARRAY['prtf']
WHERE NOT EXISTS (
  SELECT 1 FROM public.compliance_criteria
  WHERE requirement_name = 'PRTF Certification & Treatment Protocols'
);

-- Adult Day Care / Adult Day Health Care — license
INSERT INTO public.compliance_criteria
  (facility_type, requirement_name, required_document_type, severity, frequency,
   description, sub_classification, is_scored, score_category, applicable_roles,
   regulatory_body, applicable_license_types)
SELECT 'nursing_home', 'Adult Day Care License',
       'license_certificate', 'critical', 'annual',
       'Adult Day Care and Adult Day Health Care Centers must hold a current OLTC license for the daytime supportive/health services they provide.',
       NULL, true, 'facility', NULL,
       'AR_DHS_DPSQA_OLTC', ARRAY['adult_day_care']
WHERE NOT EXISTS (
  SELECT 1 FROM public.compliance_criteria
  WHERE requirement_name = 'Adult Day Care License'
);

-- Post-Acute Head Injury Retraining Facility — license
INSERT INTO public.compliance_criteria
  (facility_type, requirement_name, required_document_type, severity, frequency,
   description, sub_classification, is_scored, score_category, applicable_roles,
   regulatory_body, applicable_license_types)
SELECT 'nursing_home', 'Post-Acute Head Injury Program License',
       'license_certificate', 'critical', 'annual',
       'Post-Acute Head Injury Retraining Facilities must hold a current OLTC license for the specialized rehabilitative program they operate.',
       NULL, true, 'facility', NULL,
       'AR_DHS_DPSQA_OLTC', ARRAY['post_acute_head_injury']
WHERE NOT EXISTS (
  SELECT 1 FROM public.compliance_criteria
  WHERE requirement_name = 'Post-Acute Head Injury Program License'
);

-- ---------------------------------------------------------------------------
-- 4. Pin the existing nursing-home "Administrator License" rule to the license
--    types where a Nursing Home Administrator license is the correct credential
--    (nursing facilities). Leave it unrestricted if the row is absent.
-- ---------------------------------------------------------------------------
UPDATE public.compliance_criteria
SET applicable_license_types = ARRAY['nursing_facility']
WHERE facility_type = 'nursing_home'
  AND (requirement_name ILIKE '%Administrator License%'
       OR requirement_name ILIKE '%Administrator Licensure%')
  AND applicable_license_types IS NULL;
