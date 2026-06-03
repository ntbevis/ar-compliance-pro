-- =============================================================================
-- AUTHOR: LTC subtype compliance criteria + roles
-- =============================================================================
-- Builds out the requirement sets for the long-term care license subtypes that
-- previously had only a licensing anchor. Grounded in Arkansas OLTC rules and
-- the applicable federal frameworks (42 CFR 483 for ICF/IID and PRTF):
--   * Assisted Living Level I & II  (DHS OLTC)
--   * Residential Care Facility     (DHS OLTC)
--   * ICF/IID                       (DHS OLTC + CMS active-treatment CoPs)
--   * PRTF                          (DHS OLTC + CMS psych CoPs)
--   * Adult Day Care / ADHC         (DHS OLTC)
--   * Post-Acute Head Injury        (DHS OLTC)
--
-- SME NOTE: these reflect the current published rulebooks at authoring time and
-- should be validated against the live regulation revisions before go-live.
-- Every INSERT is guarded with WHERE NOT EXISTS (idempotent by requirement_name).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. New regulatory roles (one license_type each; ALF staff left unscoped so
--    they appear for both Level I and Level II in the title picker).
-- ---------------------------------------------------------------------------
INSERT INTO public.regulatory_roles (role_name, facility_type, sub_classification, license_type)
SELECT v.role_name, 'nursing_home', NULL, v.license_type
FROM (VALUES
  ('Assisted Living Direct Care Staff', NULL),
  ('Residential Care Aide', 'residential_care'),
  ('Direct Support Professional (DSP)', 'icf_iid'),
  ('PRTF Mental Health Paraprofessional', 'prtf'),
  ('Adult Day Care Direct Care Staff', 'adult_day_care')
) AS v(role_name, license_type)
WHERE NOT EXISTS (
  SELECT 1 FROM public.regulatory_roles r
  WHERE r.role_name = v.role_name AND r.facility_type = 'nursing_home'
);

-- Helper: insert a criterion only if its requirement_name does not already exist.
-- (Done inline per row below for clarity / idempotency.)

-- ===========================================================================
-- 2. ASSISTED LIVING (Level I & II)
-- ===========================================================================
INSERT INTO public.compliance_criteria
  (facility_type, requirement_name, required_document_type, severity, frequency, description,
   sub_classification, is_scored, score_category, applicable_roles, task_kind, attestation_allowed,
   regulatory_body, applicable_license_types)
SELECT * FROM (VALUES
  ('nursing_home','Comprehensive Disclosure Statement','disclosure_statement','standard','one-time',
   'Each ALF must provide every prospective resident (or representative) a comprehensive disclosure statement describing the form of care, services, staffing, emergency preparedness, special services, and related costs.',
   NULL,true,'facility',NULL::text[],'document',false,'AR_DHS_DPSQA_OLTC',ARRAY['assisted_living_i','assisted_living_ii']),
  ('nursing_home','Occupancy Admission Agreement & Service Plan','admission_agreement','critical','one-time',
   'Each resident must have an occupancy admission agreement including the direct care services plan; for Level II the RN prepares, coordinates, and implements the direct care services plan portion.',
   NULL,true,'facility',NULL::text[],'document',false,'AR_DHS_DPSQA_OLTC',ARRAY['assisted_living_i','assisted_living_ii']),
  ('nursing_home','ALF Direct Care Staff Orientation','training_certificate','critical','one-time',
   'Direct care staff must complete orientation within 7 days of hire (building/emergency safety, abuse/neglect/exploitation reporting, incident reporting, sanitation/food safety, resident health, Residents Bill of Rights) per OLTC ALF rules.',
   NULL,true,'personnel',ARRAY['Assisted Living Direct Care Staff'],'document',false,'AR_DHS_DPSQA_OLTC',ARRAY['assisted_living_i','assisted_living_ii']),
  ('nursing_home','ALF Dementia Training','training_certificate','standard','one-time',
   'Covered ALF staff must complete dementia training within 90 days of hire (4 initial hours), repeated after any lapse of 24 consecutive months.',
   NULL,true,'personnel',ARRAY['Assisted Living Direct Care Staff'],'document',false,'AR_DHS_DPSQA_OLTC',ARRAY['assisted_living_i','assisted_living_ii']),
  ('nursing_home','ALF Ongoing Annual Training (6 Hours)','training_certificate','standard','annual',
   'All ALF staff and contracted providers with direct resident contact, and food service personnel, must receive at least 6 hours per year of ongoing in-service education.',
   NULL,true,'personnel',ARRAY['Assisted Living Direct Care Staff'],'document',false,'AR_DHS_DPSQA_OLTC',ARRAY['assisted_living_i','assisted_living_ii']),
  ('nursing_home','ALF Level II RN Coverage Agreement','staffing_agreement','critical','annual',
   'A Level II ALF must employ or contract with at least one RN (available by phone/pager) responsible for the direct care services plan and oversight of LPN/CNA/PCA personnel.',
   NULL,true,'personnel',ARRAY['Registered Nurse (RN)'],'document',false,'AR_DHS_DPSQA_OLTC',ARRAY['assisted_living_ii']),
  ('nursing_home','ALF Level II Medication Administration Records','medication_record','critical','monthly',
   'Level II ALFs administering medication through licensed nursing personnel must maintain medication administration records; Level I facilities only assist with self-administration.',
   NULL,true,'facility',NULL::text[],'document',false,'AR_DHS_DPSQA_OLTC',ARRAY['assisted_living_ii'])
) AS t(facility_type,requirement_name,required_document_type,severity,frequency,description,sub_classification,is_scored,score_category,applicable_roles,task_kind,attestation_allowed,regulatory_body,applicable_license_types)
WHERE NOT EXISTS (SELECT 1 FROM public.compliance_criteria c WHERE c.requirement_name = t.requirement_name);

-- ===========================================================================
-- 3. RESIDENTIAL CARE FACILITY
-- ===========================================================================
INSERT INTO public.compliance_criteria
  (facility_type, requirement_name, required_document_type, severity, frequency, description,
   sub_classification, is_scored, score_category, applicable_roles, task_kind, attestation_allowed,
   regulatory_body, applicable_license_types)
SELECT * FROM (VALUES
  ('nursing_home','Residential Care Individual Service Plan','service_plan','standard','annual',
   'Residential Care Facilities must maintain an individual service plan addressing each resident''s supportive (non-nursing) care needs.',
   NULL,true,'facility',NULL::text[],'document',false,'AR_DHS_DPSQA_OLTC',ARRAY['residential_care']),
  ('nursing_home','Residential Care Staff Orientation & Training','training_certificate','standard','annual',
   'Residential Care staff must complete orientation and ongoing training on resident safety, abuse/neglect reporting, and emergency procedures.',
   NULL,true,'personnel',ARRAY['Residential Care Aide'],'document',false,'AR_DHS_DPSQA_OLTC',ARRAY['residential_care'])
) AS t(facility_type,requirement_name,required_document_type,severity,frequency,description,sub_classification,is_scored,score_category,applicable_roles,task_kind,attestation_allowed,regulatory_body,applicable_license_types)
WHERE NOT EXISTS (SELECT 1 FROM public.compliance_criteria c WHERE c.requirement_name = t.requirement_name);

-- ===========================================================================
-- 4. ICF/IID  (active treatment framework, 42 CFR 483 Subpart I)
-- ===========================================================================
INSERT INTO public.compliance_criteria
  (facility_type, requirement_name, required_document_type, severity, frequency, description,
   sub_classification, is_scored, score_category, applicable_roles, task_kind, attestation_allowed,
   regulatory_body, applicable_license_types)
SELECT * FROM (VALUES
  ('nursing_home','Individual Program Plan (IPP)','individual_program_plan','critical','annual',
   'Each ICF/IID client must have an Individual Program Plan developed by the interdisciplinary team and implemented as a continuous active treatment program.',
   NULL,true,'facility',NULL::text[],'document',false,'AR_DHS_DPSQA_OLTC',ARRAY['icf_iid']),
  ('nursing_home','Comprehensive Functional Assessment (30-Day)','functional_assessment','critical','annual',
   'Within 30 days of admission the interdisciplinary team must complete a comprehensive functional assessment considering the client''s age and active-treatment implications.',
   NULL,true,'facility',NULL::text[],'document',false,'AR_DHS_DPSQA_OLTC',ARRAY['icf_iid']),
  ('nursing_home','24-Hour Awake Direct Care Staffing','staffing_log','critical','monthly',
   'ICF/IID residential living units must have responsible direct care staff on duty and awake on a 24-hour basis whenever clients are present.',
   NULL,true,'facility',NULL::text[],'recurring_log',false,'AR_DHS_DPSQA_OLTC',ARRAY['icf_iid']),
  ('nursing_home','Client Protections & Rights Policy','rights_policy','critical','annual',
   'ICF/IID must maintain and implement client-protection and client-rights policies (behavior management, freedom from abuse, and management of the client''s funds).',
   NULL,true,'facility',NULL::text[],'document',false,'AR_DHS_DPSQA_OLTC',ARRAY['icf_iid']),
  ('nursing_home','Direct Support Professional Training','training_certificate','standard','annual',
   'Direct Support Professionals must be trained to implement each client''s active treatment program and behavior-management plans.',
   NULL,true,'personnel',ARRAY['Direct Support Professional (DSP)'],'document',false,'AR_DHS_DPSQA_OLTC',ARRAY['icf_iid'])
) AS t(facility_type,requirement_name,required_document_type,severity,frequency,description,sub_classification,is_scored,score_category,applicable_roles,task_kind,attestation_allowed,regulatory_body,applicable_license_types)
WHERE NOT EXISTS (SELECT 1 FROM public.compliance_criteria c WHERE c.requirement_name = t.requirement_name);

-- ===========================================================================
-- 5. PRTF  (psychiatric residential treatment, under age 21)
-- ===========================================================================
INSERT INTO public.compliance_criteria
  (facility_type, requirement_name, required_document_type, severity, frequency, description,
   sub_classification, is_scored, score_category, applicable_roles, task_kind, attestation_allowed,
   regulatory_body, applicable_license_types)
SELECT * FROM (VALUES
  ('nursing_home','Individualized Plan of Care (Physician-Directed)','plan_of_care','critical','annual',
   'Each PRTF resident under age 21 must have a physician-directed individualized plan of care delivering active psychiatric treatment.',
   NULL,true,'facility',NULL::text[],'document',false,'AR_DHS_DPSQA_OLTC',ARRAY['prtf']),
  ('nursing_home','Restraint & Seclusion Safeguards (1-Hour Face-to-Face)','restraint_policy','critical','annual',
   'PRTFs must follow federal restraint/seclusion safeguards, including a 1-hour face-to-face evaluation by trained staff and incident reporting.',
   NULL,true,'facility',NULL::text[],'document',false,'AR_DHS_DPSQA_OLTC',ARRAY['prtf']),
  ('nursing_home','Resident Rights & Grievance Policy (Under 21)','rights_policy','critical','annual',
   'PRTFs must maintain resident-rights and grievance policies appropriate to residents under age 21 and their families.',
   NULL,true,'facility',NULL::text[],'document',false,'AR_DHS_DPSQA_OLTC',ARRAY['prtf']),
  ('nursing_home','PRTF Behavioral Health Staff Training','training_certificate','standard','annual',
   'PRTF mental-health paraprofessionals must complete training in crisis intervention, restraint/seclusion, and active psychiatric treatment.',
   NULL,true,'personnel',ARRAY['PRTF Mental Health Paraprofessional'],'document',false,'AR_DHS_DPSQA_OLTC',ARRAY['prtf'])
) AS t(facility_type,requirement_name,required_document_type,severity,frequency,description,sub_classification,is_scored,score_category,applicable_roles,task_kind,attestation_allowed,regulatory_body,applicable_license_types)
WHERE NOT EXISTS (SELECT 1 FROM public.compliance_criteria c WHERE c.requirement_name = t.requirement_name);

-- ===========================================================================
-- 6. ADULT DAY CARE / ADULT DAY HEALTH CARE
-- ===========================================================================
INSERT INTO public.compliance_criteria
  (facility_type, requirement_name, required_document_type, severity, frequency, description,
   sub_classification, is_scored, score_category, applicable_roles, task_kind, attestation_allowed,
   regulatory_body, applicable_license_types)
SELECT * FROM (VALUES
  ('nursing_home','Life Safety Code Survey (Adult Day)','life_safety_survey','critical','annual',
   'A new Adult Day Care/ADHC facility must pass an OLTC life-safety code survey before admitting clients, with the license renewed annually (effective July 1 / expiring June 30).',
   NULL,true,'facility',NULL::text[],'document',false,'AR_DHS_DPSQA_OLTC',ARRAY['adult_day_care']),
  ('nursing_home','Monthly Group Activity Schedule','activity_schedule','standard','monthly',
   'Adult Day programs must maintain and post a monthly schedule of group activities for clients.',
   NULL,true,'facility',NULL::text[],'recurring_log',false,'AR_DHS_DPSQA_OLTC',ARRAY['adult_day_care']),
  ('nursing_home','Individual Participant Care Plan','care_plan','standard','annual',
   'Each Adult Day participant must have an individualized care plan addressing their functional needs and goals.',
   NULL,true,'facility',NULL::text[],'document',false,'AR_DHS_DPSQA_OLTC',ARRAY['adult_day_care']),
  ('nursing_home','ADC In-Service Training (16 Hours/Year)','training_certificate','standard','annual',
   'All Adult Day direct care staff and counted volunteers must complete at least 16 hours of in-service training per year (4 hours per quarter).',
   NULL,true,'personnel',ARRAY['Adult Day Care Direct Care Staff'],'document',false,'AR_DHS_DPSQA_OLTC',ARRAY['adult_day_care'])
) AS t(facility_type,requirement_name,required_document_type,severity,frequency,description,sub_classification,is_scored,score_category,applicable_roles,task_kind,attestation_allowed,regulatory_body,applicable_license_types)
WHERE NOT EXISTS (SELECT 1 FROM public.compliance_criteria c WHERE c.requirement_name = t.requirement_name);

-- ===========================================================================
-- 7. POST-ACUTE HEAD INJURY RETRAINING FACILITY
-- ===========================================================================
INSERT INTO public.compliance_criteria
  (facility_type, requirement_name, required_document_type, severity, frequency, description,
   sub_classification, is_scored, score_category, applicable_roles, task_kind, attestation_allowed,
   regulatory_body, applicable_license_types)
SELECT * FROM (VALUES
  ('nursing_home','Head Injury Individualized Rehabilitation Plan','rehabilitation_plan','critical','annual',
   'Post-Acute Head Injury facilities must maintain an individualized rehabilitation/retraining plan for each resident.',
   NULL,true,'facility',NULL::text[],'document',false,'AR_DHS_DPSQA_OLTC',ARRAY['post_acute_head_injury']),
  ('nursing_home','Specialized Rehabilitation Staffing Plan','staffing_plan','standard','annual',
   'Post-Acute Head Injury facilities must document a specialized rehabilitation staffing plan appropriate to the program''s scope.',
   NULL,true,'facility',NULL::text[],'document',false,'AR_DHS_DPSQA_OLTC',ARRAY['post_acute_head_injury'])
) AS t(facility_type,requirement_name,required_document_type,severity,frequency,description,sub_classification,is_scored,score_category,applicable_roles,task_kind,attestation_allowed,regulatory_body,applicable_license_types)
WHERE NOT EXISTS (SELECT 1 FROM public.compliance_criteria c WHERE c.requirement_name = t.requirement_name);
