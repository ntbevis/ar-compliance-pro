-- Audit follow-up: tighten role-specific personnel requirements.
-- Safe to re-run (idempotent UPDATEs). Run after 20260528000000_refine_regulatory_roles_and_criteria.sql.

-- Nurse license scoping (§513.1)
UPDATE compliance_criteria
SET applicable_roles = ARRAY['Licensed Practical Nurse (LPN)']
WHERE id = '5c5c2c00-6adb-43b5-92bd-c0b0d839d3c7';

UPDATE compliance_criteria
SET applicable_roles = ARRAY['Registered Nurse (RN)', 'Director of Nursing (DON)']
WHERE id = 'c7214827-b17b-49ec-91e7-e63030d6b6f9';

UPDATE compliance_criteria
SET applicable_roles = ARRAY['Licensed Practical Nurse (LPN) - Childcare']
WHERE id = 'a66745c4-e670-48a3-a2f3-bf2dc9dc9561';

UPDATE compliance_criteria
SET applicable_roles = ARRAY['Registered Nurse (RN) - Childcare']
WHERE id = 'e71e0ad7-9e3e-460b-b424-3b7cb0a3a93e';

-- Therapy Board: SLP, OT, PT, BCBA only (not nurses)
UPDATE compliance_criteria
SET applicable_roles = ARRAY[
  'Speech-Language Pathologist (SLP)',
  'Physical Therapist (PT)',
  'Occupational Therapist (OT)',
  'Board Certified Behavior Analyst (BCBA)'
]
WHERE id = '25d3861a-ec24-4685-a70e-55171bcdf381';

-- Professional Board: licensed clinicians + ECSE (not LPN/RN unless in name)
UPDATE compliance_criteria
SET applicable_roles = ARRAY[
  'Speech-Language Pathologist (SLP)',
  'Physical Therapist (PT)',
  'Occupational Therapist (OT)',
  'Board Certified Behavior Analyst (BCBA)',
  'Early Childhood Special Education Teacher (ECSE)'
]
WHERE id = 'b310b7b5-d670-40e2-89ce-f3bb72ae4db9';

-- Driver CPR: staff who may be the certified adult on a transport vehicle (§transportation)
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

-- Duplicate / broken Gemini row: deactivate and fix orphan role names
UPDATE compliance_criteria
SET applicable_roles = ARRAY[
  'Center Director',
  'Child Care Staff / Teacher',
  'Infant/Toddler Caregiver',
  'Early Childhood Special Education Teacher (ECSE)',
  'Sick Care Director'
],
    score_category = 'personnel',
    sub_classification = 'all_staff',
    is_scored = false
WHERE id = '82bf66f4-7075-4773-a60e-4ae0723da80a';

-- NH food permit is facility-level (not dietitian personal credential)
UPDATE compliance_criteria
SET score_category = 'facility',
    applicable_roles = NULL,
    sub_classification = NULL
WHERE id = '75a3656b-eb73-49d4-9ec6-587409ac37cd';

-- Ensure consultant / executive agreements stay single-role
UPDATE compliance_criteria
SET applicable_roles = ARRAY['Medical Director']
WHERE id IN ('2b2a6173-e450-4b49-9d6e-d66f8213a6a1', '9f0a7323-a1b0-4203-bb3c-b1ad677718d9');

UPDATE compliance_criteria
SET applicable_roles = ARRAY['Consulting Pharmacist']
WHERE id IN ('3a0e798c-1fb1-4de6-92b7-5d98ee6a317e', 'e0efefc4-60bf-4059-b397-5c2431c1b579');

UPDATE compliance_criteria
SET applicable_roles = ARRAY['Consulting Dietitian']
WHERE id IN ('5eb37c9a-ee05-491c-86b3-0095961f4e70', 'acfa8af8-295c-4fd8-939c-1be749f1b5a4');

UPDATE compliance_criteria
SET applicable_roles = ARRAY['Nursing Home Administrator']
WHERE id IN ('773c0ea3-b095-4923-b840-b7aabf287145', 'ec79eff1-771a-46d6-9ea8-b41a230e2be2');

UPDATE compliance_criteria
SET applicable_roles = ARRAY['Director of Nursing (DON)']
WHERE id IN ('958e07b6-46b2-40a7-8b8c-ce4ae4959583', '8e506feb-cbc7-47eb-882a-f5dd7748b92e');

UPDATE compliance_criteria
SET applicable_roles = ARRAY['Certified Nursing Assistant (CNA)']
WHERE id IN ('74e2a2a6-2660-426f-bf2c-b55dd5ace674', '10cd57cc-6dc0-4cc0-8dad-1cf1b628c2a3');

UPDATE compliance_criteria
SET applicable_roles = ARRAY['Rehabilitation Therapist (OT/PT/SLP)']
WHERE facility_type = 'nursing_home'
  AND requirement_name = 'Rehabilitation Therapist Licensure';
