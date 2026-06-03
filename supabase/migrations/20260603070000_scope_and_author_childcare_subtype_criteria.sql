-- =============================================================================
-- SCOPE + AUTHOR: childcare subtype compliance criteria (ADE Office of Early Childhood)
-- =============================================================================
-- The original 77 `childcare_center` criteria were authored for a full Licensed
-- Child Care Center. Left unscoped they would also apply in full to Licensed
-- Family Homes, Registered Family Homes (<5 children, minimal oversight), and
-- Out-of-School-Time (OST, school-age only) facilities. This migration:
--   (1) scopes the existing center rules to the license tiers they govern, and
--   (2) authors the subtype-specific requirements for family homes / OST /
--       registered homes that the center catalog does not cover.
--
-- Governing authority: ADE Office of Early Childhood, Child Care Licensing Unit
--   * Licensed Child Care Center      -> childcare_center
--   * Licensed Child Care Family Home -> childcare_family_home (6-16 children)
--   * Registered Child Care Family Home -> registered_family_home (<5 children)
--   * Out-of-School-Time Facility      -> ost (school-age only)
--
-- Idempotent: scoping touches only rows still NULL; inserts guarded by NOT EXISTS.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. New role for OST staff (so OST personnel criteria have a selectable title).
-- ---------------------------------------------------------------------------
INSERT INTO public.regulatory_roles (role_name, facility_type, sub_classification, license_type)
SELECT 'Out-of-School-Time Staff', 'childcare_center', NULL, 'ost'
WHERE NOT EXISTS (
  SELECT 1 FROM public.regulatory_roles r
  WHERE r.role_name = 'Out-of-School-Time Staff' AND r.facility_type = 'childcare_center'
);

-- ---------------------------------------------------------------------------
-- 1. SCOPE EXISTING CHILDCARE RULES (most specific first; each row set once).
-- ---------------------------------------------------------------------------

-- (A) CENTER-ONLY: center license + center director governance.
UPDATE public.compliance_criteria
SET applicable_license_types = ARRAY['childcare_center']
WHERE facility_type = 'childcare_center' AND applicable_license_types IS NULL
  AND requirement_name = ANY (ARRAY[
    'State Child Care License','Director Educational Credentials','New Director Orientation (QRIS)']);

-- (B) INFANT/TODDLER CARE (centers + family homes + registered homes; NOT OST,
--     which is school-age only). Still gated by the infant_toddler toggle.
UPDATE public.compliance_criteria
SET applicable_license_types = ARRAY['childcare_center','childcare_family_home','registered_family_home']
WHERE facility_type = 'childcare_center' AND applicable_license_types IS NULL
  AND requirement_name = ANY (ARRAY[
    'Bottle Labeling Compliance','Crib Safety Inspection Log','Infant Feeding & Diapering Log',
    'Infant/Toddler Toy Sanitation','Safe Sleep Training Certificate','Infant CPR Certification']);

-- (C) CHILD-PROTECTION INTEGRITY (ALL four tiers, including registered homes).
UPDATE public.compliance_criteria
SET applicable_license_types = ARRAY[
  'childcare_center','childcare_family_home','registered_family_home','ost']
WHERE facility_type = 'childcare_center' AND applicable_license_types IS NULL
  AND requirement_name = ANY (ARRAY[
    'AR State Police Background Check','Arkansas Child Maltreatment Registry',
    'FBI Criminal Background Check','Mandated Reporter Training']);

-- (D) DEFAULT: everything else applies to centers, licensed family homes, and OST
--     (the supervised, licensed tiers) but NOT registered homes (<5 children,
--     minimal oversight, which only carry their explicit tier rules).
UPDATE public.compliance_criteria
SET applicable_license_types = ARRAY['childcare_center','childcare_family_home','ost']
WHERE facility_type = 'childcare_center' AND applicable_license_types IS NULL;

-- ---------------------------------------------------------------------------
-- 2. LICENSED FAMILY HOME criteria
-- ---------------------------------------------------------------------------
INSERT INTO public.compliance_criteria
  (facility_type, requirement_name, required_document_type, severity, frequency, description,
   sub_classification, is_scored, score_category, applicable_roles, task_kind, attestation_allowed,
   regulatory_body, applicable_license_types)
SELECT * FROM (VALUES
  ('childcare_center','Family Home Caregiver Annual Training (15 Hours)','training_certificate','critical','annual',
   'All family-home caregivers who work directly with children must obtain at least 15 hours of annual training (incl. child development) registered with the ADE/OEC Professional Development Registry.',
   NULL,true,'personnel',ARRAY['Family Child Care Home Provider'],'document',false,'ADE_OEC',ARRAY['childcare_family_home']),
  ('childcare_center','Family Home Infant Care Fire Approval','inspection_report','critical','annual',
   'Family homes specializing in infant care must maintain a Fire Department inspection/approval and a 1:3 caregiver-to-infant ratio.',
   'infant_toddler',true,'facility',NULL::text[],'document',false,'ADE_OEC',ARRAY['childcare_family_home']),
  ('childcare_center','Family Home New Staff Orientation (Pre-Solo)','training_certificate','standard','one-time',
   'New family-home staff must complete orientation within three months of hire and may not be left alone with children until orientation is complete.',
   NULL,true,'personnel',ARRAY['Family Child Care Home Provider'],'document',false,'ADE_OEC',ARRAY['childcare_family_home'])
) AS t(facility_type,requirement_name,required_document_type,severity,frequency,description,sub_classification,is_scored,score_category,applicable_roles,task_kind,attestation_allowed,regulatory_body,applicable_license_types)
WHERE NOT EXISTS (SELECT 1 FROM public.compliance_criteria c WHERE c.requirement_name = t.requirement_name);

-- ---------------------------------------------------------------------------
-- 3. OUT-OF-SCHOOL-TIME (OST) criteria
-- ---------------------------------------------------------------------------
INSERT INTO public.compliance_criteria
  (facility_type, requirement_name, required_document_type, severity, frequency, description,
   sub_classification, is_scored, score_category, applicable_roles, task_kind, attestation_allowed,
   regulatory_body, applicable_license_types)
SELECT * FROM (VALUES
  ('childcare_center','OST Staff Annual Training (15 Hours)','training_certificate','critical','annual',
   'All OST staff must obtain 15 hours of annual training registered with the ADE/OEC Professional Development Registry, focused on the age group and responsibilities they serve (school-age / youth development).',
   NULL,true,'personnel',ARRAY['Out-of-School-Time Staff'],'document',false,'ADE_OEC',ARRAY['ost']),
  ('childcare_center','OST Staff-to-Participant Ratio Plan','ratio_plan','critical','annual',
   'OST facilities must document and maintain compliant staff-to-participant ratios at all times, including during transitions and outdoor activities.',
   NULL,true,'facility',NULL::text[],'document',false,'ADE_OEC',ARRAY['ost']),
  ('childcare_center','OST Fire & Health Inspection (11+)','inspection_report','critical','annual',
   'OST facilities must maintain fire and health (food service) inspection approvals as required by the OST Minimum Licensing Requirements.',
   NULL,true,'facility',NULL::text[],'document',false,'ADE_OEC',ARRAY['ost'])
) AS t(facility_type,requirement_name,required_document_type,severity,frequency,description,sub_classification,is_scored,score_category,applicable_roles,task_kind,attestation_allowed,regulatory_body,applicable_license_types)
WHERE NOT EXISTS (SELECT 1 FROM public.compliance_criteria c WHERE c.requirement_name = t.requirement_name);

-- ---------------------------------------------------------------------------
-- 4. REGISTERED FAMILY HOME criteria (minimal tier, <5 children)
-- ---------------------------------------------------------------------------
INSERT INTO public.compliance_criteria
  (facility_type, requirement_name, required_document_type, severity, frequency, description,
   sub_classification, is_scored, score_category, applicable_roles, task_kind, attestation_allowed,
   regulatory_body, applicable_license_types)
SELECT * FROM (VALUES
  ('childcare_center','Registered Home Caregiver Qualifications','qualification_record','standard','one-time',
   'The registered family-home caregiver must document the qualifications required under the Registered Child Care Family Home rules (PUB-003).',
   NULL,true,'facility',NULL::text[],'document',false,'ADE_OEC',ARRAY['registered_family_home']),
  ('childcare_center','Registered Home Safe Environment Self-Certification','self_certification','standard','annual',
   'The registered family-home caregiver must self-certify a safe care environment (basic fire/health/safety) consistent with the Registered Child Care Family Home rules.',
   NULL,true,'facility',NULL::text[],'document',true,'ADE_OEC',ARRAY['registered_family_home'])
) AS t(facility_type,requirement_name,required_document_type,severity,frequency,description,sub_classification,is_scored,score_category,applicable_roles,task_kind,attestation_allowed,regulatory_body,applicable_license_types)
WHERE NOT EXISTS (SELECT 1 FROM public.compliance_criteria c WHERE c.requirement_name = t.requirement_name);
