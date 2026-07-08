-- =============================================================================
-- AUTHOR: Memory-care elopement / wandering-prevention criteria
-- =============================================================================
-- Expands the `memory_care` (Alzheimer's Special Care Unit) rule set. Elopement
-- and wandering are the leading safety, liability, and survey risks for a secured
-- dementia unit, yet the prior seed only covered unit certification + dementia
-- training. These rows light up only when a facility's memory_care scope toggle
-- is ON (sub_classification = 'memory_care'), matching ruleAppliesToFacility.
--
-- Scope mirrors the existing memory-care rows: nursing_facility + ALF I/II, the
-- LTC license types that can operate an Alzheimer's Special Care Unit (ASCU).
--
-- SME NOTE: grounded in DHS OLTC ASCU expectations and standard dementia-care
-- practice at authoring time; validate against the live rulebook before go-live.
-- Every INSERT is guarded with WHERE NOT EXISTS (idempotent by requirement_name).
-- =============================================================================

INSERT INTO public.compliance_criteria
  (facility_type, requirement_name, required_document_type, severity, frequency, description,
   sub_classification, is_scored, score_category, applicable_roles, task_kind, attestation_allowed,
   regulatory_body, applicable_license_types)
SELECT * FROM (VALUES
  ('nursing_home','Elopement & Wandering Prevention Policy','facility_plan','critical','annual',
   'Written elopement/wandering-prevention policy for the secured dementia unit: individualized resident elopement risk assessment, egress-control approach (delayed-egress / secured perimeter), and the staff response protocol for a missing resident. Reviewed at least annually.',
   'memory_care',true,'facility',NULL::text[],'document',false,'AR_DHS_DPSQA_OLTC',
   ARRAY['nursing_facility','assisted_living_i','assisted_living_ii']),

  ('nursing_home','Wandering / Elopement Risk Assessment','functional_assessment','standard','quarterly',
   'Per-resident elopement and wandering risk assessment completed on admission and reviewed at least quarterly (and after any incident), driving each resident''s individualized safety plan on the memory-care unit.',
   'memory_care',true,'facility',NULL::text[],'document',false,'AR_DHS_DPSQA_OLTC',
   ARRAY['nursing_facility','assisted_living_i','assisted_living_ii']),

  ('nursing_home','Elopement / Missing-Resident Drill','safety_log','critical','quarterly',
   'Documented practice drill for a missing or eloped resident, run at least quarterly, capturing response time, staff roles, headcount procedure, and corrective actions.',
   'memory_care',true,'facility',NULL::text[],'recurring_log',false,'AR_DHS_DPSQA_OLTC',
   ARRAY['nursing_facility','assisted_living_i','assisted_living_ii']),

  ('nursing_home','Secured Egress / Wander-Management System Check','safety_log','critical','monthly',
   'Monthly functional test of the secured-unit perimeter: door alarms, delayed-egress locks, and wander-management devices (e.g., WanderGuard tags/receivers), with any failures logged and remediated.',
   'memory_care',true,'facility',NULL::text[],'recurring_log',false,'AR_DHS_DPSQA_OLTC',
   ARRAY['nursing_facility','assisted_living_i','assisted_living_ii']),

  ('nursing_home','Elopement Response Staff Training','training_log','critical','annual',
   'Annual training for memory-care staff on preventing, recognizing, and responding to resident elopement — including risk cues, unit-securing procedure, and the missing-resident response protocol.',
   'memory_care',true,'personnel',
   ARRAY['Activities Director','Alzheimer''s Special Care Staff','Certified Nursing Assistant (CNA)','Director of Nursing (DON)','Licensed Practical Nurse (LPN)','Registered Nurse (RN)','Social Worker'],
   'document',false,'AR_DHS_DPSQA_OLTC',
   ARRAY['nursing_facility','assisted_living_i','assisted_living_ii'])
) AS t(facility_type,requirement_name,required_document_type,severity,frequency,description,sub_classification,is_scored,score_category,applicable_roles,task_kind,attestation_allowed,regulatory_body,applicable_license_types)
WHERE NOT EXISTS (SELECT 1 FROM public.compliance_criteria c WHERE c.requirement_name = t.requirement_name);
