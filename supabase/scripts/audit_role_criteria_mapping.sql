-- =============================================================================
-- AUDIT: role ↔ personnel requirement mapping
-- Run in Supabase SQL Editor after migrations. Any rows returned need review.
-- =============================================================================

-- 1) Orphan role names (applicable_roles not in regulatory_roles)
WITH role_names AS (
  SELECT role_name, facility_type FROM regulatory_roles
),
expanded AS (
  SELECT
    c.id,
    c.facility_type,
    c.requirement_name,
    c.score_category,
    unnest(c.applicable_roles) AS ref_role
  FROM compliance_criteria c
  WHERE c.applicable_roles IS NOT NULL
    AND cardinality(c.applicable_roles) > 0
)
SELECT 'ORPHAN_ROLE' AS issue_type, e.id, e.requirement_name, e.facility_type, e.ref_role
FROM expanded e
LEFT JOIN role_names r
  ON r.role_name = e.ref_role AND r.facility_type = e.facility_type
WHERE r.role_name IS NULL
  AND e.score_category = 'personnel';

-- 2) LPN-titled rules assigned to non-LPN roles
SELECT 'LPN_ON_NON_LPN' AS issue_type,
       c.id,
       c.requirement_name,
       c.facility_type,
       r AS wrong_role
FROM compliance_criteria c,
     unnest(c.applicable_roles) AS r
WHERE c.score_category = 'personnel'
  AND (c.requirement_name ILIKE '%Licensed Practical Nurse%' OR c.requirement_name ILIKE '%(LPN)%')
  AND r NOT ILIKE '%LPN%' AND r NOT ILIKE '%Licensed Practical Nurse%';

-- 3) RN-titled rules assigned to non-RN roles (DON allowed)
SELECT 'RN_ON_NON_RN' AS issue_type,
       c.id,
       c.requirement_name,
       c.facility_type,
       r AS wrong_role
FROM compliance_criteria c,
     unnest(c.applicable_roles) AS r
WHERE c.score_category = 'personnel'
  AND (c.requirement_name ILIKE '%Registered Nurse%' OR c.requirement_name ILIKE '%(RN)%')
  AND (c.requirement_name ILIKE '%Board Verification%' OR c.requirement_name ILIKE '%Licensure%')
  AND r NOT ILIKE '%Registered Nurse%' AND r NOT ILIKE '%Director of Nursing%';

-- 4) CNA-titled rules on non-CNA roles
SELECT 'CNA_ON_NON_CNA' AS issue_type,
       c.id,
       c.requirement_name,
       c.facility_type,
       r AS wrong_role
FROM compliance_criteria c,
     unnest(c.applicable_roles) AS r
WHERE c.score_category = 'personnel'
  AND (c.requirement_name ILIKE '%CNA%' OR c.requirement_name ILIKE '%Certified Nursing Assistant%')
  AND r NOT ILIKE '%CNA%' AND r NOT ILIKE '%Certified Nursing Assistant%';

-- 5) Medical Director rules on non-MD roles
SELECT 'MD_ON_NON_MD' AS issue_type,
       c.id,
       c.requirement_name,
       c.facility_type,
       r AS wrong_role
FROM compliance_criteria c,
     unnest(c.applicable_roles) AS r
WHERE c.score_category = 'personnel'
  AND c.requirement_name ILIKE '%Medical Director%'
  AND r NOT ILIKE '%Medical Director%';

-- 6) Pharmacist rules on non-pharmacist roles
SELECT 'PHARM_ON_NON_PHARM' AS issue_type,
       c.id,
       c.requirement_name,
       c.facility_type,
       r AS wrong_role
FROM compliance_criteria c,
     unnest(c.applicable_roles) AS r
WHERE c.score_category = 'personnel'
  AND (c.requirement_name ILIKE '%Pharmacist%' OR c.requirement_name ILIKE '%Pharmacy%')
  AND r NOT ILIKE '%Pharmacist%';

-- 7) Dietitian credential rules on non-dietitian roles
SELECT 'DIET_ON_NON_DIET' AS issue_type,
       c.id,
       c.requirement_name,
       c.facility_type,
       r AS wrong_role
FROM compliance_criteria c,
     unnest(c.applicable_roles) AS r
WHERE c.score_category = 'personnel'
  AND c.requirement_name ILIKE '%Dietitian%'
  AND c.requirement_name NOT ILIKE '%Consultation%'
  AND r NOT ILIKE '%Dietitian%';

-- 8) Administrator license on non-administrator roles
SELECT 'ADMIN_ON_NON_ADMIN' AS issue_type,
       c.id,
       c.requirement_name,
       c.facility_type,
       r AS wrong_role
FROM compliance_criteria c,
     unnest(c.applicable_roles) AS r
WHERE c.score_category = 'personnel'
  AND (c.requirement_name ILIKE '%Administrator License%' OR c.requirement_name ILIKE '%Administrator Licensure%')
  AND r NOT ILIKE '%Administrator%';

-- 9) Lifeguard cert on non-lifeguard roles
SELECT 'LIFEGUARD_ON_NON_LG' AS issue_type,
       c.id,
       c.requirement_name,
       c.facility_type,
       r AS wrong_role
FROM compliance_criteria c,
     unnest(c.applicable_roles) AS r
WHERE c.score_category = 'personnel'
  AND c.requirement_name ILIKE '%Lifeguard%'
  AND r NOT ILIKE '%Lifeguard%';

-- 10) Driver-specific rules on roles that are not driver/transport
SELECT 'DRIVER_ON_NON_DRIVER' AS issue_type,
       c.id,
       c.requirement_name,
       c.facility_type,
       r AS wrong_role
FROM compliance_criteria c,
     unnest(c.applicable_roles) AS r
WHERE c.score_category = 'personnel'
  AND c.requirement_name ILIKE '%Driver%'
  AND (c.requirement_name ILIKE '%License%' OR c.requirement_name ILIKE '%Safety%')
  AND r NOT ILIKE '%Driver%' AND r NOT ILIKE '%Transportation%';

-- 11) Therapy board license on nurses (common leak)
SELECT 'THERAPY_ON_NURSE' AS issue_type,
       c.id,
       c.requirement_name,
       c.facility_type,
       r AS wrong_role
FROM compliance_criteria c,
     unnest(c.applicable_roles) AS r
WHERE c.score_category = 'personnel'
  AND c.requirement_name ILIKE '%Therapy Board%'
  AND (r ILIKE '%Nurse%' OR r ILIKE '%LPN%' OR r ILIKE '%(RN)%');

-- 12) Director-only requirements on non-director roles (e.g. New Director Orientation)
SELECT 'DIRECTOR_ONLY_LEAK' AS issue_type,
       c.id,
       c.requirement_name,
       c.facility_type,
       r AS wrong_role
FROM compliance_criteria c,
     unnest(c.applicable_roles) AS r
WHERE c.score_category = 'personnel'
  AND c.facility_type = 'childcare_center'
  AND (
    c.requirement_name ILIKE '%New Director Orientation%'
    OR c.requirement_name ILIKE '%Director Educational%'
  )
  AND r NOT ILIKE '%Center Director%';

-- 13) Sick care director training on non-sick-care roles
SELECT 'SICK_CARE_DIRECTOR_LEAK' AS issue_type,
       c.id,
       c.requirement_name,
       c.facility_type,
       r AS wrong_role
FROM compliance_criteria c,
     unnest(c.applicable_roles) AS r
WHERE c.score_category = 'personnel'
  AND c.requirement_name ILIKE '%Sick Care Director%'
  AND c.requirement_name ILIKE '%Training%'
  AND r NOT ILIKE '%Sick Care Director%';

-- 14) Personnel rules that should be facility-scored but still have roles
SELECT 'FACILITY_WITH_ROLES' AS issue_type,
       c.id,
       c.requirement_name,
       c.facility_type,
       c.applicable_roles::text
FROM compliance_criteria c
WHERE c.score_category = 'facility'
  AND c.applicable_roles IS NOT NULL
  AND cardinality(c.applicable_roles) > 0;
