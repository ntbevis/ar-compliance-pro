-- =============================================================================
-- SCOPE EXISTING NURSING-HOME RULES TO EXACT LICENSE TYPES
-- =============================================================================
-- The original 52 `nursing_home` criteria were authored for a full-service
-- Skilled/Nursing Facility. Left unscoped, every one of them would now ALSO
-- apply to Assisted Living, ICF/IID, PRTF, Adult Day Care, etc. once those
-- license types exist. This migration pins each existing rule to the license
-- types it actually governs, so the twin-score engine stops over-applying
-- SNF-only requirements to other settings.
--
-- Scoping reflects Arkansas OLTC + federal frameworks:
--   * Universal life-safety / personnel-integrity items apply to ALL LTC.
--   * Building/environmental items apply to all RESIDENTIAL LTC (not day care).
--   * Nursing-clinical items apply only where licensed nursing care is provided
--     (nursing_facility, ALF II, ICF/IID, PRTF).
--   * SNF-governance items (state NH license, QAPI, resident council, DON,
--     daily staffing posting) are nursing_facility-only.
--
-- Idempotent: only touches rows whose applicable_license_types is still NULL,
-- so it never overrides the anchor rules already pinned in 20260603040000.
-- =============================================================================

-- ALL LTC settings (incl. Adult Day Care): universal safety + personnel integrity
UPDATE public.compliance_criteria
SET applicable_license_types = ARRAY[
  'nursing_facility','assisted_living_i','assisted_living_ii','residential_care',
  'icf_iid','prtf','adult_day_care','post_acute_head_injury']
WHERE facility_type = 'nursing_home' AND applicable_license_types IS NULL
  AND requirement_name = ANY (ARRAY[
    'Abuse & Incident Reporting Logs','Annual Fire Marshal Clearance','Dietary Menu Postings',
    'Emergency Disaster Plan','Fire Extinguisher Annual Inspection','Food Service Health Permit',
    'Infection Control Program Log','Monthly Fire Extinguisher Check','Personnel File & Job Description',
    'Quarterly Evacuation Drills','Abuse & Neglect Policy Acknowledgement',
    'Adult Maltreatment Central Registry Check','Annual Abuse/Neglect In-Service',
    'Annual TB Screening / Health Assessment','Criminal Background Clearance',
    'Employee Tuberculosis (TB) Testing','Quarterly Fire/Evacuation Training']);

-- ALL RESIDENTIAL LTC (excludes Adult Day Care): building/environmental + resident items
UPDATE public.compliance_criteria
SET applicable_license_types = ARRAY[
  'nursing_facility','assisted_living_i','assisted_living_ii','residential_care',
  'icf_iid','prtf','post_acute_head_injury']
WHERE facility_type = 'nursing_home' AND applicable_license_types IS NULL
  AND requirement_name = ANY (ARRAY[
    'Emergency Generator Testing Log','HVAC System Maintenance Log','Pest Control Service Record',
    'Private Water Bacteriological Test','Resident Influenza & Pneumococcal Vaccination',
    'Resident Rights & Admission Agreement','Water & Sewage System Clearance',
    'Water Temperature Safety Log']);

-- NURSING FACILITY ONLY: SNF licensure + governance
UPDATE public.compliance_criteria
SET applicable_license_types = ARRAY['nursing_facility']
WHERE facility_type = 'nursing_home' AND applicable_license_types IS NULL
  AND requirement_name = ANY (ARRAY[
    'Daily Staffing Posting','Quality Assurance (QAPI) Committee Minutes',
    'Resident Council Meeting Minutes','State Nursing Home License',
    'Director of Nursing (DON) Agreement']);

-- LICENSED-NURSING SETTINGS (NF + ALF II + ICF/IID + PRTF): medication + nurse licensure
UPDATE public.compliance_criteria
SET applicable_license_types = ARRAY['nursing_facility','assisted_living_ii','icf_iid','prtf']
WHERE facility_type = 'nursing_home' AND applicable_license_types IS NULL
  AND requirement_name = ANY (ARRAY[
    'Controlled Substance Log','Medication Error Reporting',
    'Licensed Practical Nurse (LPN) Board Verification','Registered Nurse (RN) Board Verification']);

-- CLINICAL SETTINGS (NF + ICF/IID + PRTF): care planning, physician/pharmacy/dietitian, restraints
UPDATE public.compliance_criteria
SET applicable_license_types = ARRAY['nursing_facility','icf_iid','prtf']
WHERE facility_type = 'nursing_home' AND applicable_license_types IS NULL
  AND requirement_name = ANY (ARRAY[
    'Comprehensive Care Plan','Dietitian Consultation Records','Medical Board Licensure & Agreement',
    'Quarterly Pharmacist Audit','Registered Dietitian Credentialing','State Board of Pharmacy Licensure',
    'Restraint Medical Orders & Logs','Licensed Nurse 24/7 Coverage Schedule']);

-- MEMORY-CARE-CAPABLE SETTINGS (NF + ALF): Alzheimer special-care unit rules
-- (still gated by the `memory_care` sub_classification toggle on top of this).
UPDATE public.compliance_criteria
SET applicable_license_types = ARRAY['nursing_facility','assisted_living_i','assisted_living_ii']
WHERE facility_type = 'nursing_home' AND applicable_license_types IS NULL
  AND requirement_name = ANY (ARRAY[
    'Alzheimer Special Unit Certification','Alzheimer Unit Staff Training','ASCU Dementia Training']);

-- RESIDENT-FUNDS SETTINGS (NF + ALF + Residential Care)
UPDATE public.compliance_criteria
SET applicable_license_types = ARRAY['nursing_facility','assisted_living_i','assisted_living_ii','residential_care']
WHERE facility_type = 'nursing_home' AND applicable_license_types IS NULL
  AND requirement_name = ANY (ARRAY['Resident Trust Fund Surety Bond']);

-- STAFF-SCHEDULE POSTING (NF + ALF)
UPDATE public.compliance_criteria
SET applicable_license_types = ARRAY['nursing_facility','assisted_living_i','assisted_living_ii']
WHERE facility_type = 'nursing_home' AND applicable_license_types IS NULL
  AND requirement_name = ANY (ARRAY['Weekly Posted Staff Schedule']);

-- CNA SETTINGS (NF + ALF II, which must staff a CNA per shift)
UPDATE public.compliance_criteria
SET applicable_license_types = ARRAY['nursing_facility','assisted_living_ii']
WHERE facility_type = 'nursing_home' AND applicable_license_types IS NULL
  AND requirement_name = ANY (ARRAY['CNA Certification','CNA Registry Background Check']);

-- MEDICAL DIRECTOR (NF + PRTF, which is physician-directed)
UPDATE public.compliance_criteria
SET applicable_license_types = ARRAY['nursing_facility','prtf']
WHERE facility_type = 'nursing_home' AND applicable_license_types IS NULL
  AND requirement_name = ANY (ARRAY['Medical Director Agreement']);

-- REHABILITATION THERAPY (NF + Post-Acute Head Injury) — still gated by the
-- `rehabilitation` toggle on top of this license scope.
UPDATE public.compliance_criteria
SET applicable_license_types = ARRAY['nursing_facility','post_acute_head_injury']
WHERE facility_type = 'nursing_home' AND applicable_license_types IS NULL
  AND requirement_name = ANY (ARRAY['Rehabilitation Therapist Licensure']);
