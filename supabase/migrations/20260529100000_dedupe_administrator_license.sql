-- =============================================================================
-- Dedupe nursing-home administrator licensing rule (Opus 4.8 roster-aware audit)
--   Two functionally identical rules existed (both license / annual / applies to
--   Nursing Home Administrator), double-counting the same requirement in the
--   personnel-score denominator. Keep the more specifically-titled row,
--   "Nursing Home Administrator License" (773c0ea3…), and drop the generic
--   "Administrator Licensure" (ec79eff1…).
-- Applied to project scwijekgmmodoadbnheu via Supabase MCP.
-- =============================================================================

DELETE FROM compliance_criteria
WHERE id = 'ec79eff1-771a-46d6-9ea8-b41a230e2be2'
  AND requirement_name = 'Administrator Licensure';
