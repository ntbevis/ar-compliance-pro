-- =============================================================================
-- OPERATIONAL LOGS — recurring task tracking
-- =============================================================================
-- Turns recurring operational items (daily/weekly/monthly/quarterly logs &
-- drills) from static reference text into trackable, per-period tasks with a
-- completion history, captured readings, and an assignee.
--
-- Buckets are driven by two independent levers on compliance_criteria:
--   • task_kind = 'recurring_log'  -> trackable in the Operational Log UI
--   • is_scored                    -> whether it counts toward the facility score
-- We keep the monthly/quarterly safety drills SCORED (now via real per-period
-- completion) and leave high-frequency daily/weekly logs tracked-but-unscored so
-- the score stays achievable without being lax on the standards inspectors check.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Classify catalog rows. Default everything to 'document'; promote
--    facility-scope recurring activities to 'recurring_log'.
-- ---------------------------------------------------------------------------
ALTER TABLE public.compliance_criteria
  ADD COLUMN IF NOT EXISTS task_kind text NOT NULL DEFAULT 'document'
  CHECK (task_kind IN ('document', 'recurring_log'));

UPDATE public.compliance_criteria
SET task_kind = 'recurring_log'
WHERE frequency IN ('daily', 'weekly', 'monthly', 'quarterly')
  AND score_category IS DISTINCT FROM 'personnel';

-- Recurring items that produce a regulator-expected ARTIFACT (meeting minutes,
-- lab reports, formal schedules, clinical records) stay document-tracked: a bare
-- "mark done" checkbox would be both semantically wrong and too weak to satisfy
-- an inspector. They remain scored by document recency.
UPDATE public.compliance_criteria
SET task_kind = 'document'
WHERE facility_type = 'nursing_home'
  AND requirement_name IN (
    'Restraint Medical Orders & Logs',
    'Resident Council Meeting Minutes',
    'Quality Assurance (QAPI) Committee Minutes',
    'Private Water Bacteriological Test',
    'Licensed Nurse 24/7 Coverage Schedule',
    'Weekly Posted Staff Schedule'
  );

-- ---------------------------------------------------------------------------
-- 2. Completion log: one row per (task, period) the facility has logged.
--    period_key encodes the recurrence window (e.g. 2026-06-02 daily,
--    2026-W23 weekly, 2026-06 monthly, 2026-Q2 quarterly) so each task is
--    "done once per period" and history is queryable for inspector exports.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.operational_task_completions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id              uuid NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  criteria_id              uuid NOT NULL REFERENCES public.compliance_criteria(id) ON DELETE CASCADE,
  period_key               text NOT NULL,
  frequency                text,
  completed_at             timestamptz NOT NULL DEFAULT now(),
  completed_by             uuid,          -- account user (profile) who recorded it
  completed_by_name        text,          -- snapshot for the audit/export trail
  performed_by_personnel_id bigint REFERENCES public.personnel(id) ON DELETE SET NULL,
  performed_by_name        text,          -- staff who actually performed it (may have no account)
  reading                  jsonb,         -- e.g. {"value":"38","unit":"F"} or {"duration_min":3}
  note                     text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (facility_id, criteria_id, period_key)
);

CREATE INDEX IF NOT EXISTS idx_op_completions_facility_criteria
  ON public.operational_task_completions (facility_id, criteria_id);
CREATE INDEX IF NOT EXISTS idx_op_completions_facility_completed_at
  ON public.operational_task_completions (facility_id, completed_at DESC);

ALTER TABLE public.operational_task_completions ENABLE ROW LEVEL SECURITY;

-- Reads are org-scoped (same pattern as nursys_verifications); all writes go
-- through the service-role server actions, which bypass RLS.
DROP POLICY IF EXISTS "op_completions_select_own_org" ON public.operational_task_completions;
CREATE POLICY "op_completions_select_own_org"
  ON public.operational_task_completions FOR SELECT TO authenticated
  USING (facility_id IN (SELECT public.current_org_facility_ids()));

-- ---------------------------------------------------------------------------
-- 3. Standing assignment of a responsible person per recurring task.
--    References the personnel roster (staff who need no app account) with a
--    free-text fallback. One assignment per (facility, task).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.operational_task_assignments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id           uuid NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  criteria_id           uuid NOT NULL REFERENCES public.compliance_criteria(id) ON DELETE CASCADE,
  assigned_personnel_id bigint REFERENCES public.personnel(id) ON DELETE SET NULL,
  assigned_to_name      text,
  updated_by            uuid,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (facility_id, criteria_id)
);

CREATE INDEX IF NOT EXISTS idx_op_assignments_facility
  ON public.operational_task_assignments (facility_id);

ALTER TABLE public.operational_task_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "op_assignments_select_own_org" ON public.operational_task_assignments;
CREATE POLICY "op_assignments_select_own_org"
  ON public.operational_task_assignments FOR SELECT TO authenticated
  USING (facility_id IN (SELECT public.current_org_facility_ids()));
