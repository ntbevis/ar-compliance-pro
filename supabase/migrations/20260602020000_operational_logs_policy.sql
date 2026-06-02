-- =============================================================================
-- OPERATIONAL LOG POLICY — upload-first, single resolution path
-- =============================================================================
-- Refines the 20260602010000 classification after review:
--
--   • recurring_log (the in-app checkbox log) is reserved for UNSCORED,
--     high-frequency daily/weekly operational logs that are impractical to
--     upload each occurrence (temperature checks, attendance, sanitation,
--     postings, menus). They are tracked for diligence + inspector export and
--     DO NOT affect the compliance score.
--
--   • Everything that produces an artifact — monthly/quarterly drills,
--     inspections, service receipts, lab reports, minutes, schedules, policies,
--     clinical records — is document-tracked: Upload → AI verify → human review.
--     Nothing scored can be satisfied by a mere checkbox.
--
-- This keeps the two views (Executive Overview + Operational Blueprints) in sync
-- via a single source of truth (task_kind) and prevents "click to comply".
-- =============================================================================

-- 1. Reset, then promote only the unscored daily/weekly operational logs.
UPDATE public.compliance_criteria SET task_kind = 'document';

UPDATE public.compliance_criteria
SET task_kind = 'recurring_log'
WHERE frequency IN ('daily', 'weekly')
  AND is_scored = false
  AND score_category IS DISTINCT FROM 'personnel';

-- 2. File-less digital attestation is OFF by default. Only requirements that
--    genuinely have no uploadable artifact may be attested; everything else must
--    be satisfied by Upload (with the human-review fallback) or Mark N/A.
--    The whitelist starts empty and is curated over time by flipping this flag.
ALTER TABLE public.compliance_criteria
  ADD COLUMN IF NOT EXISTS attestation_allowed boolean NOT NULL DEFAULT false;
