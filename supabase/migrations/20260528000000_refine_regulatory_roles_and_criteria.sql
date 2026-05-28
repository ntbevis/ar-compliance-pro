-- =============================================================================
-- Refine regulatory_roles + compliance_criteria for Arkansas childcare centers
-- and nursing homes. Run in Supabase SQL Editor (or via supabase db push).
--
-- Note: compliance_criteria.applicable_roles is PostgreSQL text[] (not jsonb).
-- This script uses inline ARRAY[...] literals (no TEMP tables) so the Supabase
-- SQL Editor can run it even when statements are not wrapped in one transaction.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Canonical role lists (must match regulatory_roles.role_name EXACTLY)
-- ---------------------------------------------------------------------------

-- Childcare: all staff (§303–304)
-- ARRAY['Center Director','Child Care Staff / Teacher','Infant/Toddler Caregiver',
--   'Support Staff (Janitorial/Admin)','Driver / Transportation Staff',
--   'Food Service / Kitchen Staff','Volunteer (Counted in Ratios)',
--   'Early Childhood Special Education Teacher (ECSE)','Speech-Language Pathologist (SLP)',
--   'Physical Therapist (PT)','Occupational Therapist (OT)',
--   'Board Certified Behavior Analyst (BCBA)','Registered Nurse (RN) - Childcare',
--   'Licensed Practical Nurse (LPN) - Childcare','Lifeguard / Water Safety','Sick Care Director']

-- ---------------------------------------------------------------------------
-- 1. ADD missing nursing-home regulatory roles (OLTC §328–329, §584)
-- ---------------------------------------------------------------------------
INSERT INTO regulatory_roles (role_name, facility_type, sub_classification)
VALUES
  ('Activities Director', 'nursing_home', NULL),
  ('Social Worker', 'nursing_home', NULL),
  ('Rehabilitation Therapist (OT/PT/SLP)', 'nursing_home', 'clinical')
ON CONFLICT (role_name, facility_type, sub_classification) DO NOTHING;

UPDATE regulatory_roles
SET sub_classification = NULL, updated_at = NOW()
WHERE sub_classification IS NOT NULL
  AND TRIM(sub_classification) = '';

-- ---------------------------------------------------------------------------
-- 2. FIX applicable_roles — replace phantom names with real role_name values
-- ---------------------------------------------------------------------------

-- Nursing home: universal personnel rules (abuse ack, TB, fire training, abuse in-service)
UPDATE compliance_criteria
SET applicable_roles = ARRAY[
  'Activities Director',
  'Alzheimer''s Special Care Staff',
  'Certified Nursing Assistant (CNA)',
  'Consulting Dietitian',
  'Consulting Pharmacist',
  'Director of Nursing (DON)',
  'General Support Staff (Dietary/Maintenance)',
  'Licensed Practical Nurse (LPN)',
  'Medical Director',
  'Nursing Home Administrator',
  'Registered Nurse (RN)',
  'Rehabilitation Therapist (OT/PT/SLP)',
  'Social Worker'
]
WHERE id IN (
  '03e176c3-7bf5-450c-a3d4-f1806d79f0d4',
  '2a8bc612-4bf8-4189-ae4c-4131bf62be91',
  '68622022-6bf8-4c91-af4e-3bbb3b4e9c74',
  'ae6d1c32-e6af-41e6-895a-babfb8ef9af8'
);

-- Nursing home: memory-care dementia training
UPDATE compliance_criteria
SET applicable_roles = ARRAY[
  'Activities Director',
  'Alzheimer''s Special Care Staff',
  'Certified Nursing Assistant (CNA)',
  'Director of Nursing (DON)',
  'Licensed Practical Nurse (LPN)',
  'Registered Nurse (RN)',
  'Social Worker'
],
    sub_classification = 'memory_care'
WHERE id = '6a35681f-d136-4f90-8a23-5c9f19b54a4c';

UPDATE compliance_criteria
SET applicable_roles = ARRAY['Certified Nursing Assistant (CNA)']
WHERE id = '74e2a2a6-2660-426f-bf2c-b55dd5ace674';

UPDATE compliance_criteria
SET applicable_roles = ARRAY['Nursing Home Administrator']
WHERE id = '773c0ea3-b095-4923-b840-b7aabf287145';

UPDATE compliance_criteria
SET applicable_roles = ARRAY['Director of Nursing (DON)'],
    score_category = 'personnel'
WHERE id = '958e07b6-46b2-40a7-8b8c-ce4ae4959583';

-- LPN license proof is only for LPN staff (§513.1)
UPDATE compliance_criteria
SET applicable_roles = ARRAY['Licensed Practical Nurse (LPN)']
WHERE id = '5c5c2c00-6adb-43b5-92bd-c0b0d839d3c7';

-- RN license proof for RNs; DON must hold RN licensure per §511.1
UPDATE compliance_criteria
SET applicable_roles = ARRAY['Registered Nurse (RN)', 'Director of Nursing (DON)']
WHERE id = 'c7214827-b17b-49ec-91e7-e63030d6b6f9';

INSERT INTO compliance_criteria (
  id, facility_type, requirement_name, required_document_type,
  severity, frequency, description, sub_classification,
  is_scored, score_category, applicable_roles
)
SELECT
  gen_random_uuid(),
  'nursing_home',
  'Rehabilitation Therapist Licensure',
  'license',
  'critical',
  'annual',
  'Active Arkansas licensure for OT, PT, or speech-language pathology staff providing specialized rehabilitative services per §326.',
  'clinical',
  true,
  'personnel',
  ARRAY['Rehabilitation Therapist (OT/PT/SLP)']
WHERE NOT EXISTS (
  SELECT 1 FROM compliance_criteria
  WHERE facility_type = 'nursing_home'
    AND requirement_name = 'Rehabilitation Therapist Licensure'
);

UPDATE compliance_criteria
SET applicable_roles = ARRAY['Driver / Transportation Staff']
WHERE id IN (
  '6ed6dbee-b858-4b09-baf1-6f0cbdbc5cef',
  '8c6813d1-17ff-4a59-ad75-4a0473282e35'
);

UPDATE compliance_criteria
SET applicable_roles = ARRAY[
  'Center Director',
  'Child Care Staff / Teacher',
  'Early Childhood Special Education Teacher (ECSE)',
  'Infant/Toddler Caregiver',
  'Sick Care Director'
],
    score_category = 'personnel',
    sub_classification = 'all_staff',
    is_scored = false
WHERE id = '82bf66f4-7075-4773-a60e-4ae0723da80a';

UPDATE compliance_criteria
SET applicable_roles = ARRAY[
  'Board Certified Behavior Analyst (BCBA)',
  'Center Director',
  'Child Care Staff / Teacher',
  'Driver / Transportation Staff',
  'Early Childhood Special Education Teacher (ECSE)',
  'Food Service / Kitchen Staff',
  'Infant/Toddler Caregiver',
  'Licensed Practical Nurse (LPN) - Childcare',
  'Lifeguard / Water Safety',
  'Occupational Therapist (OT)',
  'Physical Therapist (PT)',
  'Registered Nurse (RN) - Childcare',
  'Sick Care Director',
  'Speech-Language Pathologist (SLP)',
  'Support Staff (Janitorial/Admin)',
  'Volunteer (Counted in Ratios)'
]
WHERE facility_type = 'childcare_center'
  AND score_category = 'personnel'
  AND (
    sub_classification = 'all_staff'
    OR requirement_name ILIKE '%Background%'
    OR requirement_name ILIKE '%Maltreatment%'
    OR requirement_name ILIKE '%Orientation%'
    OR requirement_name ILIKE '%8-Hour%'
  )
  AND id NOT IN (
    '6ed6dbee-b858-4b09-baf1-6f0cbdbc5cef',
    '8c6813d1-17ff-4a59-ad75-4a0473282e35',
    '72c3290e-6b46-4e7d-bdd0-a0b92cee190f',
    'a66745c4-e670-48a3-a2f3-bf2dc9dc9561',
    'e71e0ad7-9e3e-460b-b424-3b7cb0a3a93e',
    'b310b7b5-d670-40e2-89ce-f3bb72ae4db9',
    '25d3861a-ec24-4685-a70e-55171bcdf381'
  );

UPDATE compliance_criteria
SET applicable_roles = ARRAY[
  'Board Certified Behavior Analyst (BCBA)',
  'Center Director',
  'Child Care Staff / Teacher',
  'Driver / Transportation Staff',
  'Early Childhood Special Education Teacher (ECSE)',
  'Food Service / Kitchen Staff',
  'Infant/Toddler Caregiver',
  'Licensed Practical Nurse (LPN) - Childcare',
  'Lifeguard / Water Safety',
  'Occupational Therapist (OT)',
  'Physical Therapist (PT)',
  'Registered Nurse (RN) - Childcare',
  'Sick Care Director',
  'Speech-Language Pathologist (SLP)',
  'Volunteer (Counted in Ratios)'
]
WHERE id IN (
  '1d3cae08-416e-496b-a0ea-69b509c0a8dc',
  'da11ee65-1d5b-47b6-8796-3d1297b085c0'
);

UPDATE compliance_criteria
SET applicable_roles = ARRAY[
  'Driver / Transportation Staff',
  'Center Director',
  'Child Care Staff / Teacher',
  'Infant/Toddler Caregiver',
  'Volunteer (Counted in Ratios)'
],
    sub_classification = 'transportation'
WHERE id = 'f39cb0d3-6396-400d-8123-210d4491f9c8';

UPDATE compliance_criteria
SET applicable_roles = ARRAY[
  'Center Director',
  'Child Care Staff / Teacher',
  'Early Childhood Special Education Teacher (ECSE)',
  'Infant/Toddler Caregiver',
  'Sick Care Director'
]
WHERE id IN (
  '8689531d-529a-44f4-8bc2-e78aadfba58a',
  '828f14ef-0254-4c80-98a8-4d16731f41a5'
);

UPDATE compliance_criteria
SET applicable_roles = ARRAY[
  'Speech-Language Pathologist (SLP)',
  'Physical Therapist (PT)',
  'Occupational Therapist (OT)',
  'Board Certified Behavior Analyst (BCBA)'
]
WHERE id = '25d3861a-ec24-4685-a70e-55171bcdf381';

UPDATE compliance_criteria
SET applicable_roles = ARRAY[
  'Speech-Language Pathologist (SLP)',
  'Physical Therapist (PT)',
  'Occupational Therapist (OT)',
  'Board Certified Behavior Analyst (BCBA)',
  'Early Childhood Special Education Teacher (ECSE)'
]
WHERE id = 'b310b7b5-d670-40e2-89ce-f3bb72ae4db9';

UPDATE compliance_criteria
SET applicable_roles = applicable_roles || ARRAY['Board Certified Behavior Analyst (BCBA)']
WHERE id = '25d3861a-ec24-4685-a70e-55171bcdf381'
  AND NOT (applicable_roles @> ARRAY['Board Certified Behavior Analyst (BCBA)']);

-- ---------------------------------------------------------------------------
-- 3. FACILITY vs PERSONNEL score_category corrections
-- ---------------------------------------------------------------------------

UPDATE compliance_criteria
SET score_category = 'personnel',
    sub_classification = COALESCE(NULLIF(sub_classification, ''), 'all_staff')
WHERE id IN (
  '07e82062-ff7c-43d6-83b0-2f03ddc2ae8f',
  '6fe17d22-36ca-4cf7-ad31-fce6c8cbfad4',
  '4f946256-99ee-46ae-878b-76ee80a2bbe6',
  '742245a5-7bf6-4512-afdc-f5424c7c7d2f',
  '24cce013-c1fc-42b8-ab11-2da95f387c4e',
  '5c27b712-8879-4a83-b111-da46d7ddd183',
  'c04e45b3-941f-4a9f-a313-3c3ec362fea8'
);

UPDATE compliance_criteria
SET applicable_roles = ARRAY[
  'Activities Director',
  'Alzheimer''s Special Care Staff',
  'Certified Nursing Assistant (CNA)',
  'Consulting Dietitian',
  'Consulting Pharmacist',
  'Director of Nursing (DON)',
  'General Support Staff (Dietary/Maintenance)',
  'Licensed Practical Nurse (LPN)',
  'Medical Director',
  'Nursing Home Administrator',
  'Registered Nurse (RN)',
  'Rehabilitation Therapist (OT/PT/SLP)',
  'Social Worker'
],
    is_scored = true
WHERE id = '07e82062-ff7c-43d6-83b0-2f03ddc2ae8f';

UPDATE compliance_criteria
SET is_scored = false,
    description = COALESCE(description, '') || ' [Superseded by Annual TB Screening / Health Assessment personnel rule.]'
WHERE id = '6fe17d22-36ca-4cf7-ad31-fce6c8cbfad4';

UPDATE compliance_criteria
SET applicable_roles = ARRAY[
  'Board Certified Behavior Analyst (BCBA)',
  'Center Director',
  'Child Care Staff / Teacher',
  'Driver / Transportation Staff',
  'Early Childhood Special Education Teacher (ECSE)',
  'Food Service / Kitchen Staff',
  'Infant/Toddler Caregiver',
  'Licensed Practical Nurse (LPN) - Childcare',
  'Lifeguard / Water Safety',
  'Occupational Therapist (OT)',
  'Physical Therapist (PT)',
  'Registered Nurse (RN) - Childcare',
  'Sick Care Director',
  'Speech-Language Pathologist (SLP)',
  'Support Staff (Janitorial/Admin)',
  'Volunteer (Counted in Ratios)'
]
WHERE id IN (
  '4f946256-99ee-46ae-878b-76ee80a2bbe6',
  '742245a5-7bf6-4512-afdc-f5424c7c7d2f',
  '24cce013-c1fc-42b8-ab11-2da95f387c4e'
);

UPDATE compliance_criteria
SET applicable_roles = ARRAY['Sick Care Director'],
    sub_classification = 'sick_care'
WHERE id = '5c27b712-8879-4a83-b111-da46d7ddd183';

UPDATE compliance_criteria
SET applicable_roles = ARRAY[
  'Center Director',
  'Child Care Staff / Teacher',
  'Early Childhood Special Education Teacher (ECSE)',
  'Infant/Toddler Caregiver',
  'Sick Care Director'
],
    sub_classification = 'infant_toddler'
WHERE id = 'c04e45b3-941f-4a9f-a313-3c3ec362fea8';

UPDATE compliance_criteria
SET applicable_roles = NULL
WHERE id IN (
  '283b8dc8-1a6a-40dc-aaa9-dc068e463be5',
  '2bdd04fc-a4c4-4472-bc94-9d837d8248a3',
  '90a08df3-d7c8-4cd6-a44e-e41b0db72d2f'
);

UPDATE compliance_criteria
SET score_category = 'facility',
    applicable_roles = NULL
WHERE id = '75a3656b-eb73-49d4-9ec6-587409ac37cd';

UPDATE compliance_criteria
SET is_scored = false,
    score_category = 'facility',
    applicable_roles = NULL,
    description = COALESCE(description, '') || ' [Tracked per-staff via 15-Hour Annual ECE Training personnel rule.]'
WHERE id IN (
  '491c57bc-68b8-4ad4-a5d0-b6a8fae3242a',
  '1ab4063f-0392-4e20-baa2-f9ea54259ede'
);

UPDATE compliance_criteria
SET score_category = 'facility',
    applicable_roles = NULL,
    sub_classification = NULL
WHERE id = 'ca3bbd4e-5cec-45ed-89c9-668761a8e3a2';

-- ---------------------------------------------------------------------------
-- 4. ADD missing criteria (idempotent)
-- ---------------------------------------------------------------------------

INSERT INTO compliance_criteria (
  facility_type, requirement_name, required_document_type,
  severity, frequency, description, sub_classification,
  is_scored, score_category, applicable_roles
)
SELECT
  'childcare_center',
  'New Director Orientation (QRIS)',
  'training_certificate',
  'critical',
  'one-time',
  'New Directors shall attend Division-sponsored New Directors Orientation, PAS, and ERS (or equivalent) within six months of employment per §302.5.',
  NULL,
  true,
  'personnel',
  ARRAY['Center Director']
WHERE NOT EXISTS (
  SELECT 1 FROM compliance_criteria
  WHERE facility_type = 'childcare_center'
    AND requirement_name = 'New Director Orientation (QRIS)'
);

INSERT INTO compliance_criteria (
  facility_type, requirement_name, required_document_type,
  severity, frequency, description, sub_classification,
  is_scored, score_category, applicable_roles
)
SELECT
  'childcare_center',
  'DCCECE Professional Development Registry',
  'registration_confirmation',
  'standard',
  'one-time',
  'Directors and direct-care staff shall register with the DCCECE Professional Development Registry within 30 days of hire per §306.1.',
  'all_staff',
  true,
  'personnel',
  ARRAY[
    'Board Certified Behavior Analyst (BCBA)',
    'Center Director',
    'Child Care Staff / Teacher',
    'Driver / Transportation Staff',
    'Early Childhood Special Education Teacher (ECSE)',
    'Food Service / Kitchen Staff',
    'Infant/Toddler Caregiver',
    'Licensed Practical Nurse (LPN) - Childcare',
    'Lifeguard / Water Safety',
    'Occupational Therapist (OT)',
    'Physical Therapist (PT)',
    'Registered Nurse (RN) - Childcare',
    'Sick Care Director',
    'Speech-Language Pathologist (SLP)',
    'Support Staff (Janitorial/Admin)',
    'Volunteer (Counted in Ratios)'
  ]
WHERE NOT EXISTS (
  SELECT 1 FROM compliance_criteria
  WHERE facility_type = 'childcare_center'
    AND requirement_name = 'DCCECE Professional Development Registry'
);

INSERT INTO compliance_criteria (
  facility_type, requirement_name, required_document_type,
  severity, frequency, description, sub_classification,
  is_scored, score_category, applicable_roles
)
SELECT
  'nursing_home',
  'Personnel File & Job Description',
  'personnel_file_checklist',
  'standard',
  'one-time',
  'Administrator shall maintain a personnel file and written job description for each employee classification per §303.1 and §303.6.',
  NULL,
  true,
  'facility',
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM compliance_criteria
  WHERE facility_type = 'nursing_home'
    AND requirement_name = 'Personnel File & Job Description'
);

INSERT INTO compliance_criteria (
  facility_type, requirement_name, required_document_type,
  severity, frequency, description, sub_classification,
  is_scored, score_category, applicable_roles
)
SELECT
  'nursing_home',
  'Weekly Posted Staff Schedule',
  'schedule',
  'standard',
  'weekly',
  'A weekly time schedule with employee name, classification, and tour of duty shall be prepared and posted per §303.11.',
  NULL,
  true,
  'facility',
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM compliance_criteria
  WHERE facility_type = 'nursing_home'
    AND requirement_name = 'Weekly Posted Staff Schedule'
);

-- ---------------------------------------------------------------------------
-- POST-RUN VERIFICATION (run separately; should return 0 rows)
-- ---------------------------------------------------------------------------
/*
WITH role_names AS (
  SELECT role_name, facility_type FROM regulatory_roles
),
criteria AS (
  SELECT id, requirement_name, facility_type,
         unnest(COALESCE(applicable_roles, ARRAY[]::text[])) AS ref_role
  FROM compliance_criteria
  WHERE applicable_roles IS NOT NULL AND cardinality(applicable_roles) > 0
)
SELECT c.id, c.requirement_name, c.facility_type, c.ref_role
FROM criteria c
LEFT JOIN role_names r
  ON r.role_name = c.ref_role AND r.facility_type = c.facility_type
WHERE r.role_name IS NULL;
*/
