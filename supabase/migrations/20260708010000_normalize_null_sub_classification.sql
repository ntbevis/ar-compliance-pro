-- =============================================================================
-- HYGIENE: normalize literal 'null' sub_classification to real SQL NULL
-- =============================================================================
-- Some seeded rows stored the *string* 'null' in sub_classification instead of
-- an actual NULL. The rule engine already treats both identically
-- (ruleAppliesToFacility checks `sub === 'null'`), so this is purely a data
-- hygiene cleanup to keep the column consistent and queries predictable.
-- Idempotent: re-running is a no-op once all rows are real NULL.
-- =============================================================================

UPDATE public.compliance_criteria
SET sub_classification = NULL
WHERE sub_classification = 'null';

UPDATE public.regulatory_roles
SET sub_classification = NULL
WHERE sub_classification = 'null';
