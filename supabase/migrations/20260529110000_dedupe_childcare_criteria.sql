-- =============================================================================
-- Dedupe childcare compliance criteria (Opus 4.8 roster-aware audit)
--   Three functional duplicates were inflating/distorting the childcare facility
--   score. Each is removed in favor of the more specific / accurate sibling(s):
--
--   1. "Monthly Fire & Tornado Drill Logs" (combined, monthly) double-counted the
--      monthly fire drill and mislabeled tornado cadence. Keep the split pair
--      "Monthly Fire Drill Log" (monthly) + "Quarterly Tornado Drill Log".
--   2. "Written Emergency Procedures Plan" (generic, one-time) is superseded by
--      "Comprehensive Emergency Management Plan" (annual, AR CEMP). Floor Plan kept.
--   3. "Criminal Background Clearance" (generic, facility, one-time) merely restates
--      the specific per-staff "AR State Police", "FBI Criminal", and
--      "Child Maltreatment Registry" personnel checks.
--
-- Each delete is guarded on id + requirement_name so it can only hit the intended row.
-- Applied to project scwijekgmmodoadbnheu via Supabase MCP.
-- =============================================================================

DELETE FROM compliance_criteria
WHERE id = '2bdd04fc-a4c4-4472-bc94-9d837d8248a3'
  AND requirement_name = 'Monthly Fire & Tornado Drill Logs';

DELETE FROM compliance_criteria
WHERE id = '1872f6ec-b0c6-4910-9f71-4f0173af241f'
  AND requirement_name = 'Written Emergency Procedures Plan';

DELETE FROM compliance_criteria
WHERE id = '6fee8ada-97ce-4baa-9382-64175be97f43'
  AND requirement_name = 'Criminal Background Clearance';
