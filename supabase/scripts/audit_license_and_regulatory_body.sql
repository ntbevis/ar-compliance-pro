-- =============================================================================
-- AUDIT: license_type + regulatory_body realignment
-- Run in the Supabase SQL Editor after the 20260603* migrations. Section 1 is
-- informational (counts). Sections 2+ should return ZERO rows; any rows are
-- data-quality issues that need review.
-- =============================================================================

-- 1) INFORMATIONAL — catalog distribution by sector / license scope / authority
SELECT 'COUNT_BY_FACILITY_TYPE' AS report, facility_type AS bucket, count(*) AS n
FROM compliance_criteria GROUP BY facility_type
UNION ALL
SELECT 'COUNT_BY_REGULATORY_BODY', COALESCE(regulatory_body, '(null)'), count(*)
FROM compliance_criteria GROUP BY regulatory_body
UNION ALL
SELECT 'COUNT_LICENSE_SCOPED', CASE WHEN applicable_license_types IS NULL THEN 'sector_wide' ELSE 'license_scoped' END, count(*)
FROM compliance_criteria GROUP BY (applicable_license_types IS NULL)
UNION ALL
SELECT 'FACILITIES_BY_LICENSE_TYPE', COALESCE(license_type, '(null)'), count(*)
FROM facilities GROUP BY license_type
ORDER BY report, bucket;

-- 2) Criteria still missing a regulatory_body (every row should be tagged)
SELECT 'MISSING_REGULATORY_BODY' AS issue_type, id, facility_type, requirement_name
FROM compliance_criteria
WHERE regulatory_body IS NULL;

-- 3) Childcare rows NOT attributed to ADE_OEC (childcare is an ADE function)
SELECT 'CHILDCARE_NOT_ADE' AS issue_type, id, requirement_name, regulatory_body
FROM compliance_criteria
WHERE facility_type = 'childcare_center'
  AND regulatory_body IS DISTINCT FROM 'ADE_OEC';

-- 4) Lingering DHS / DCCECE references in childcare prose (should be scrubbed)
SELECT 'CHILDCARE_STALE_AUTHORITY' AS issue_type, id, requirement_name
FROM compliance_criteria
WHERE facility_type = 'childcare_center'
  AND (description ILIKE '%DCCECE%'
       OR description ILIKE '%Department of Human Services%'
       OR requirement_name ILIKE '%DCCECE%');

-- 5) Hospice rows that are NOT attributed to ADH (hospice is licensed by ADH)
SELECT 'HOSPICE_NOT_ADH' AS issue_type, id, requirement_name, regulatory_body
FROM compliance_criteria
WHERE (requirement_name ILIKE '%hospice%' OR description ILIKE '%hospice%')
  AND regulatory_body IS DISTINCT FROM 'ADH';

-- 6) applicable_license_types referencing an unknown / misspelled license type
WITH known_license_types(license_type) AS (
  VALUES
    ('childcare_center'), ('childcare_family_home'), ('registered_family_home'), ('ost'),
    ('nursing_facility'), ('assisted_living_i'), ('assisted_living_ii'),
    ('residential_care'), ('icf_iid'), ('prtf'), ('adult_day_care'),
    ('post_acute_head_injury')
),
expanded AS (
  SELECT c.id, c.facility_type, c.requirement_name, unnest(c.applicable_license_types) AS lt
  FROM compliance_criteria c
  WHERE c.applicable_license_types IS NOT NULL
    AND cardinality(c.applicable_license_types) > 0
)
SELECT 'UNKNOWN_LICENSE_TYPE' AS issue_type, e.id, e.requirement_name, e.facility_type, e.lt
FROM expanded e
LEFT JOIN known_license_types k ON k.license_type = e.lt
WHERE k.license_type IS NULL;

-- 7) Criteria scoped to a license type that does not belong to its facility_type
--    (e.g. a childcare rule pointing at 'nursing_facility')
WITH license_sector(license_type, facility_type) AS (
  VALUES
    ('childcare_center', 'childcare_center'),
    ('childcare_family_home', 'childcare_center'),
    ('registered_family_home', 'childcare_center'),
    ('ost', 'childcare_center'),
    ('nursing_facility', 'nursing_home'),
    ('assisted_living_i', 'nursing_home'),
    ('assisted_living_ii', 'nursing_home'),
    ('residential_care', 'nursing_home'),
    ('icf_iid', 'nursing_home'),
    ('prtf', 'nursing_home'),
    ('adult_day_care', 'nursing_home'),
    ('post_acute_head_injury', 'nursing_home')
),
expanded AS (
  SELECT c.id, c.facility_type, c.requirement_name, unnest(c.applicable_license_types) AS lt
  FROM compliance_criteria c
  WHERE c.applicable_license_types IS NOT NULL
)
SELECT 'LICENSE_SECTOR_MISMATCH' AS issue_type, e.id, e.requirement_name, e.facility_type, e.lt
FROM expanded e
JOIN license_sector ls ON ls.license_type = e.lt
WHERE ls.facility_type <> e.facility_type;

-- 8) Facilities left without an exact license type after backfill
SELECT 'FACILITY_MISSING_LICENSE_TYPE' AS issue_type, id, name, facility_type
FROM facilities
WHERE license_type IS NULL;

-- 9) Personnel rules referencing a role that is not in regulatory_roles
--    (re-run of the orphan-role check, now license-type aware)
WITH role_names AS (SELECT role_name, facility_type FROM regulatory_roles),
expanded AS (
  SELECT c.id, c.facility_type, c.requirement_name, unnest(c.applicable_roles) AS ref_role
  FROM compliance_criteria c
  WHERE c.score_category = 'personnel'
    AND c.applicable_roles IS NOT NULL
    AND cardinality(c.applicable_roles) > 0
)
SELECT 'ORPHAN_ROLE' AS issue_type, e.id, e.requirement_name, e.facility_type, e.ref_role
FROM expanded e
LEFT JOIN role_names r ON r.role_name = e.ref_role AND r.facility_type = e.facility_type
WHERE r.role_name IS NULL;

-- 10) Self-compliance integrity — self personnel rows with no titles
SELECT 'SELF_RECORD_NO_ROLES' AS issue_type, p.id, p.name, p.facility_id
FROM personnel p
WHERE p.is_self_record = true
  AND NOT EXISTS (SELECT 1 FROM personnel_roles pr WHERE pr.personnel_id = p.id);
