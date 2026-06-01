-- =============================================================================
-- RENEWAL ALERT LOG (idempotency for the renewal-alerts Edge Function)
-- =============================================================================
-- Records each (document, urgency bucket, expiration) the scheduled job has
-- already emailed about, so a daily schedule escalates an item exactly once as
-- it enters each bucket (30 days out, 7 days out, on/after expiry) instead of
-- re-sending the same digest every day. Including `expiration` in the unique
-- key means a renewed document (new expiration date) resets and can alert again.
--
-- Written only by the service-role (Edge Function). RLS is enabled with no
-- policy so it is inaccessible to anon/authenticated clients — it holds no
-- end-user-facing data.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.renewal_alerts_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.facility_documents(id) ON DELETE CASCADE,
  facility_id uuid NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  bucket text NOT NULL CHECK (bucket IN ('d30', 'd7', 'expired')),
  expiration date NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, bucket, expiration)
);

-- The UNIQUE(document_id, ...) index already covers the document_id FK lookup.
-- Add a covering index for the facility_id FK (keeps the performance advisor clean).
CREATE INDEX IF NOT EXISTS idx_renewal_alerts_log_facility_id
  ON public.renewal_alerts_log (facility_id);

ALTER TABLE public.renewal_alerts_log ENABLE ROW LEVEL SECURITY;
