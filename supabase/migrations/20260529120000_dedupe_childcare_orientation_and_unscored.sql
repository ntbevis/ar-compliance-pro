-- =============================================================================
-- Childcare criteria cleanup, round 2 (Opus 4.8 roster-aware audit)
--   1. "New Staff Orientation" (generic, one-time) overlaps the more specific
--      "New Hire Orientation Log" (7-day) + "8-Hour Basic Orientation" (3-month,
--      Shaken Baby / safe sleep). Remove the generic duplicate.
--   2. Remove three already-unscored training rules that are fully superseded by
--      the scored "15-Hour Annual ECE Training" personnel rule. These had no score
--      impact (is_scored=false) and only cluttered the Blueprints reference manual.
--
-- Each delete is guarded on id + requirement_name so it can only hit the intended row.
-- Applied to project scwijekgmmodoadbnheu via Supabase MCP.
-- =============================================================================

DELETE FROM compliance_criteria
WHERE id = '7fb7cbd0-a44b-4e58-aaeb-995858c36e1f'
  AND requirement_name = 'New Staff Orientation';

DELETE FROM compliance_criteria
WHERE id = '1ab4063f-0392-4e20-baa2-f9ea54259ede'
  AND requirement_name = 'Annual In-Service Training (15 Hours)';

DELETE FROM compliance_criteria
WHERE id = '491c57bc-68b8-4ad4-a5d0-b6a8fae3242a'
  AND requirement_name = 'Annual Staff Training';

DELETE FROM compliance_criteria
WHERE id = '82bf66f4-7075-4773-a60e-4ae0723da80a'
  AND requirement_name = 'Annual Professional Development Training';
