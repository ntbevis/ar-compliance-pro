-- =============================================================================
-- CORRECTIVE ACTION PLANS (Plan of Correction workflow)
-- =============================================================================
-- Tracks remediation items a facility opens to close a compliance gap. Nursing
-- homes are required to file Plans of Correction after a survey; childcare
-- centers use the same workflow informally to track fixes before re-inspection.
--
-- Consistent with the rest of the schema: writes happen via the service-role
-- (admin) client in server actions, which enforce org ownership in code. RLS is
-- enabled as defense-in-depth with an own-org SELECT policy (mirrors personnel /
-- facility_documents). The org scope helper was created in the RLS hardening
-- migration (public.current_org_facility_ids()).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.corrective_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  -- The requirement / gap this plan addresses (free text so it survives rule edits).
  related_requirement text,
  severity text NOT NULL DEFAULT 'standard' CHECK (severity IN ('critical', 'standard')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  -- Owner of the remediation. Free text (name) to keep it simple and resilient.
  assigned_to text,
  due_date date,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolution_note text
);

-- Covering index for the FK + the common "open items for a facility" query.
CREATE INDEX IF NOT EXISTS idx_corrective_actions_facility_id
  ON public.corrective_actions (facility_id);
CREATE INDEX IF NOT EXISTS idx_corrective_actions_facility_status
  ON public.corrective_actions (facility_id, status);
-- Covering index for the created_by FK (keeps the performance advisor clean).
CREATE INDEX IF NOT EXISTS idx_corrective_actions_created_by
  ON public.corrective_actions (created_by);

ALTER TABLE public.corrective_actions ENABLE ROW LEVEL SECURITY;

-- Own-org read (defense in depth). Writes are performed server-side via the
-- service-role client, which bypasses RLS and checks org ownership in code.
DROP POLICY IF EXISTS "corrective_actions_select_own_org" ON public.corrective_actions;
CREATE POLICY "corrective_actions_select_own_org"
  ON public.corrective_actions FOR SELECT TO authenticated
  USING (facility_id IN (SELECT public.current_org_facility_ids()));
