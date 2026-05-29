-- =============================================================================
-- Compliance "brain" hardening (Opus 4.8 audit)
--   1. Un-break nursing-home professional licensing rules (clinical was a dead tag)
--   2. Introduce a real 'rehabilitation' nursing-home scope flag for optional therapy
--   3. Make ECSE selectable; dedupe roles/criteria; fix frequency + description bugs
--   4. Add missing AR regulatory items
-- compliance_criteria has NO updated_at column; regulatory_roles does.
-- Applied to project scwijekgmmodoadbnheu via Supabase MCP.
-- =============================================================================

-- 1. New nursing-home scope flag column ---------------------------------------
ALTER TABLE facilities ADD COLUMN IF NOT EXISTS rehabilitation boolean NOT NULL DEFAULT false;

-- 2. Un-break the 5 universally-required NH licensing rules --------------------
--    'clinical' is NOT a nursing-home toggle, so these never applied. RN/LPN/MD/
--    Pharmacist/Dietitian licensing is mandatory for every NH -> sub = NULL.
UPDATE compliance_criteria SET sub_classification = NULL
WHERE id IN (
  '5c5c2c00-6adb-43b5-92bd-c0b0d839d3c7',  -- LPN Board Verification
  '2b2a6173-e450-4b49-9d6e-d66f8213a6a1',  -- Medical Board Licensure & Agreement
  '5eb37c9a-ee05-491c-86b3-0095961f4e70',  -- Registered Dietitian Credentialing
  'c7214827-b17b-49ec-91e7-e63030d6b6f9',  -- RN Board Verification
  '3a0e798c-1fb1-4de6-92b7-5d98ee6a317e'   -- State Board of Pharmacy Licensure
);

-- 3. Optional rehab therapy gated behind the new flag -------------------------
UPDATE compliance_criteria SET sub_classification = 'rehabilitation'
WHERE id = 'e3373491-f526-4f08-923b-953bdcd4b156';  -- Rehabilitation Therapist Licensure

UPDATE regulatory_roles SET sub_classification = 'rehabilitation', updated_at = NOW()
WHERE id = 'a51dadf6-a0ad-470b-86b3-7cf6e51ec221';  -- Rehabilitation Therapist (OT/PT/SLP)

-- 4. ECSE was tagged 'education' (a criteria baseline tag, not a facility column)
--    so it could never be selected. Match its sibling clinical roles -> NULL.
UPDATE regulatory_roles SET sub_classification = NULL, updated_at = NOW()
WHERE id = '295e3e37-bd1a-43f0-b524-10884dd5deda';  -- ECSE

-- 5. Delete duplicate roles (keep earliest-created) ---------------------------
DELETE FROM regulatory_roles WHERE id IN (
  '75a32ea7-5546-4c10-a00d-13e8d46971f0',  -- dup Activities Director
  'aebe74fe-7725-4255-9246-0bac0eae4b36'   -- dup Social Worker
);

-- 6. Delete duplicate criteria (keep the better-scoped sibling) ---------------
DELETE FROM compliance_criteria WHERE id IN (
  'db2dc2fc-a520-44a9-83f3-844f0b6ebed3',  -- Annual Boiler Inspection (keep Boiler & Water Heater Inspection)
  '2768dcf6-a680-4bcc-a487-8c35f5572113',  -- Annual Fire Department Inspection (keep Annual Fire Marshal Clearance)
  'b23f289f-d71f-4036-9ff0-c20ac98594ef',  -- Child Maltreatment Central Registry one-time (keep biennial recheck)
  '25d3861a-ec24-4685-a70e-55171bcdf381',  -- Therapy Board Licensure (keep Professional Board Licensure)
  '8e506feb-cbc7-47eb-882a-f5dd7748b92e'   -- Director of Nursing Agreement (keep DON Agreement)
);
DELETE FROM compliance_criteria
WHERE facility_type = 'childcare_center'
  AND requirement_name = 'Annual Health Department Sanitation';  -- keep Annual Health Department Inspection

-- 7. Frequency mislabels (names/descriptions said quarterly, stored monthly) ---
UPDATE compliance_criteria SET frequency = 'quarterly'
WHERE id IN (
  '30e386f0-e740-4134-a6f0-d14c6d08b8a0',  -- Quarterly Evacuation Drills (NH)
  '90a08df3-d7c8-4cd6-a44e-e41b0db72d2f',  -- Quarterly Tornado Drill Log (CC)
  'e0efefc4-60bf-4059-b397-5c2431c1b579'   -- Quarterly Pharmacist Audit (NH)
);

-- 8. Clean double-appended description tags (idempotency bug) ------------------
UPDATE compliance_criteria SET description = 'Verification of 15 hours of dynamic, DHS-approved early childhood professional development training per year. [Tracked per-staff via 15-Hour Annual ECE Training personnel rule.]'
WHERE id = '1ab4063f-0392-4e20-baa2-f9ea54259ede';
UPDATE compliance_criteria SET description = 'All staff members who work directly with children shall obtain at least fifteen (15) hours of continuing Early Childhood Education. [Tracked per-staff via 15-Hour Annual ECE Training personnel rule.]'
WHERE id = '491c57bc-68b8-4ad4-a5d0-b6a8fae3242a';
UPDATE compliance_criteria SET description = 'All personnel must be screened for tuberculosis upon hire and annually thereafter. [Superseded by Annual TB Screening / Health Assessment personnel rule.]'
WHERE id = '6fe17d22-36ca-4cf7-ad31-fce6c8cbfad4';

-- 9. Missing regulatory items -------------------------------------------------
-- Nursing: Adult & Long-Term Care Facility Resident Maltreatment Registry check
INSERT INTO compliance_criteria (id, facility_type, requirement_name, required_document_type, severity, frequency, description, sub_classification, is_scored, score_category, applicable_roles)
SELECT gen_random_uuid(), 'nursing_home', 'Adult Maltreatment Central Registry Check', 'background_check', 'critical', 'one-time',
 'Prior to employment, the facility must query the Arkansas Adult and Long-Term Care Facility Resident Maltreatment Central Registry to confirm each employee has no founded report of adult maltreatment.',
 NULL, true, 'personnel',
 ARRAY['Activities Director','Alzheimer''s Special Care Staff','Certified Nursing Assistant (CNA)','Consulting Dietitian','Consulting Pharmacist','Director of Nursing (DON)','General Support Staff (Dietary/Maintenance)','Licensed Practical Nurse (LPN)','Medical Director','Nursing Home Administrator','Registered Nurse (RN)','Rehabilitation Therapist (OT/PT/SLP)','Social Worker']
WHERE NOT EXISTS (SELECT 1 FROM compliance_criteria WHERE facility_type='nursing_home' AND requirement_name='Adult Maltreatment Central Registry Check');

-- Nursing: QAPI / Quality Assurance Committee minutes
INSERT INTO compliance_criteria (id, facility_type, requirement_name, required_document_type, severity, frequency, description, sub_classification, is_scored, score_category, applicable_roles)
SELECT gen_random_uuid(), 'nursing_home', 'Quality Assurance (QAPI) Committee Minutes', 'meeting_minutes', 'standard', 'quarterly',
 'The facility must maintain a Quality Assurance and Performance Improvement (QAPI) committee that meets at least quarterly, with documented minutes of identified quality deficiencies and corrective actions.',
 NULL, true, 'facility', NULL
WHERE NOT EXISTS (SELECT 1 FROM compliance_criteria WHERE facility_type='nursing_home' AND requirement_name='Quality Assurance (QAPI) Committee Minutes');

-- Nursing: Resident Influenza & Pneumococcal Vaccination program
INSERT INTO compliance_criteria (id, facility_type, requirement_name, required_document_type, severity, frequency, description, sub_classification, is_scored, score_category, applicable_roles)
SELECT gen_random_uuid(), 'nursing_home', 'Resident Influenza & Pneumococcal Vaccination', 'medical_record', 'standard', 'annual',
 'The facility must offer and document annual influenza and pneumococcal vaccinations (or documented declination) for each resident.',
 NULL, true, 'facility', NULL
WHERE NOT EXISTS (SELECT 1 FROM compliance_criteria WHERE facility_type='nursing_home' AND requirement_name='Resident Influenza & Pneumococcal Vaccination');

-- Nursing: Resident Rights & Admission Agreement
INSERT INTO compliance_criteria (id, facility_type, requirement_name, required_document_type, severity, frequency, description, sub_classification, is_scored, score_category, applicable_roles)
SELECT gen_random_uuid(), 'nursing_home', 'Resident Rights & Admission Agreement', 'consent_form', 'critical', 'one-time',
 'A signed admission agreement and written acknowledgment of resident rights must be on file for each resident.',
 NULL, true, 'facility', NULL
WHERE NOT EXISTS (SELECT 1 FROM compliance_criteria WHERE facility_type='nursing_home' AND requirement_name='Resident Rights & Admission Agreement');

-- Childcare: Discipline & Guidance Policy (no corporal punishment)
INSERT INTO compliance_criteria (id, facility_type, requirement_name, required_document_type, severity, frequency, description, sub_classification, is_scored, score_category, applicable_roles)
SELECT gen_random_uuid(), 'childcare_center', 'Discipline & Guidance Policy', 'policy_document', 'standard', 'one-time',
 'The facility must maintain a written discipline and guidance policy that prohibits corporal punishment and provide it to staff and parents.',
 NULL, true, 'facility', NULL
WHERE NOT EXISTS (SELECT 1 FROM compliance_criteria WHERE facility_type='childcare_center' AND requirement_name='Discipline & Guidance Policy');

-- Childcare: Parent Handbook & Written Policies acknowledgment
INSERT INTO compliance_criteria (id, facility_type, requirement_name, required_document_type, severity, frequency, description, sub_classification, is_scored, score_category, applicable_roles)
SELECT gen_random_uuid(), 'childcare_center', 'Parent Handbook & Written Policies', 'policy_document', 'standard', 'one-time',
 'The facility must provide parents written operating policies (hours, fees, illness exclusion, emergency procedures) and retain acknowledgment of receipt.',
 NULL, true, 'facility', NULL
WHERE NOT EXISTS (SELECT 1 FROM compliance_criteria WHERE facility_type='childcare_center' AND requirement_name='Parent Handbook & Written Policies');
