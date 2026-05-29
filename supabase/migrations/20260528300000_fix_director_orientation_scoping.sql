-- Fix: bulk migration matched requirement_name ILIKE '%Orientation%' and incorrectly
-- assigned "New Director Orientation (QRIS)" to all childcare staff roles.
-- §302.5 applies to Directors / Assistant Directors / Site Supervisors only.

-- Center Director only (§302.5)
UPDATE compliance_criteria
SET applicable_roles = ARRAY['Center Director'],
    score_category = 'personnel',
    sub_classification = NULL
WHERE facility_type = 'childcare_center'
  AND requirement_name = 'New Director Orientation (QRIS)';

-- All staff: 8-hour basic orientation (§306.4) — not director QRIS
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
],
    score_category = 'personnel',
    sub_classification = 'all_staff'
WHERE id = 'b689fa92-9874-44bb-88da-7f907cddef76';

-- New hire orientation log (§306.3) — personnel, all direct-care staff
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
],
    score_category = 'personnel',
    sub_classification = 'all_staff'
WHERE id = '742245a5-7bf6-4512-afdc-f5424c7c7d2f';

-- New staff orientation (§306.3) — same all-staff scope
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
],
    score_category = 'personnel',
    sub_classification = 'all_staff'
WHERE id = '7fb7cbd0-a44b-4e58-aaeb-995858c36e1f';

-- Director educational proof is a facility credential for the center, not per-teacher
UPDATE compliance_criteria
SET score_category = 'facility',
    applicable_roles = NULL,
    sub_classification = NULL
WHERE id = 'ca3bbd4e-5cec-45ed-89c9-668761a8e3a2';

-- Sick care director training — sick care program director only
UPDATE compliance_criteria
SET applicable_roles = ARRAY['Sick Care Director'],
    score_category = 'personnel',
    sub_classification = 'sick_care',
    is_scored = true
WHERE id = '5c27b712-8879-4a83-b111-da46d7ddd183';
