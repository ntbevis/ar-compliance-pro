-- =============================================================================
-- NURSYS LICENSE VERIFICATION — tracking table
-- =============================================================================
-- Tracks the asynchronous Nursys e-Notify verification lifecycle for a nurse:
--   enroll (ManageNurseList) -> lookup (NurseLookup) -> finalized result.
--
-- PII NOTE: per product decision, sensitive enrollment inputs (last-4 SSN,
-- birth year, home/employment address) are PASSED THROUGH to Nursys and NEVER
-- stored here. This table only persists non-sensitive identifiers and the
-- authoritative result Nursys returns (NCSBN ID, license status, expiration).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.nursys_verifications (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id           uuid NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  personnel_id          bigint REFERENCES public.personnel(id) ON DELETE SET NULL,
  requirement_id        uuid,
  -- Lifecycle: enroll_submitted -> lookup_submitted -> (verified | expired |
  -- action_required | not_found | failed)
  status                text NOT NULL DEFAULT 'enroll_submitted'
                          CHECK (status IN (
                            'enroll_submitted', 'lookup_submitted',
                            'verified', 'expired', 'action_required',
                            'not_found', 'failed'
                          )),
  enroll_transaction_id text,
  lookup_transaction_id text,
  -- Non-sensitive license identifiers (NOT PII).
  jurisdiction          text,
  license_type          text,
  license_number        text,
  -- Authoritative results returned by Nursys.
  ncsbn_id              text,
  license_status        text,
  license_expiration    date,
  document_id           uuid,            -- facility_documents row created on success
  error_message         text,
  result                jsonb,           -- raw (PII-free) license snapshot for audit
  created_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nursys_verifications_facility_id
  ON public.nursys_verifications (facility_id);
CREATE INDEX IF NOT EXISTS idx_nursys_verifications_personnel_id
  ON public.nursys_verifications (personnel_id);

ALTER TABLE public.nursys_verifications ENABLE ROW LEVEL SECURITY;

-- Reads are org-scoped (consistent with the tenant-isolation hardening migration).
-- All writes happen server-side via the service-role client, which bypasses RLS.
DROP POLICY IF EXISTS "nursys_verifications_select_own_org" ON public.nursys_verifications;
CREATE POLICY "nursys_verifications_select_own_org"
  ON public.nursys_verifications FOR SELECT TO authenticated
  USING (facility_id IN (SELECT public.current_org_facility_ids()));
