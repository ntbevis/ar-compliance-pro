// src/lib/types.ts
// Central strict-typed schema definitions. The source of truth for our pristine taxonomy.

/**
 * Top-level regulatory authority domain (broad sector).
 * Aligns with the `facility_type` column in the `facilities` and `compliance_criteria` tables.
 * Kept intentionally at two values; the exact Arkansas license lives in `LicenseType`.
 */
export type FacilityType = 'childcare_center' | 'nursing_home';

/**
 * The governing regulatory authority for a compliance criterion.
 * Aligns with the `regulatory_body` column on `compliance_criteria`.
 *  - ADE_OEC            Arkansas Dept. of Education, Office of Early Childhood (childcare)
 *  - AR_DHS_DPSQA_OLTC  DHS Division of Provider Services & QA, Office of Long Term Care
 *  - ADH                Arkansas Department of Health (e.g. hospice, sanitation)
 *  - CMS                Federal Medicare/Medicaid certification overlay
 */
export type RegulatoryBody = 'ADE_OEC' | 'AR_DHS_DPSQA_OLTC' | 'ADH' | 'CMS';

export const REGULATORY_BODY_LABELS: Record<RegulatoryBody, string> = {
  ADE_OEC: 'ADE Office of Early Childhood',
  AR_DHS_DPSQA_OLTC: 'DHS Office of Long Term Care (DPSQA)',
  ADH: 'Arkansas Department of Health',
  CMS: 'CMS (Federal Certification)',
};

/**
 * Childcare license tiers administered by the ADE Office of Early Childhood.
 */
export type ChildcareLicenseType =
  | 'childcare_center'
  | 'childcare_family_home'
  | 'registered_family_home'
  | 'ost';

/**
 * Long-term care license types licensed by the DHS Office of Long Term Care.
 * Note: "SNF" is a CMS certification overlay on a nursing facility, not a
 * separate Arkansas license; hospice is licensed by ADH, not OLTC.
 */
export type LongTermCareLicenseType =
  | 'nursing_facility'
  | 'assisted_living_i'
  | 'assisted_living_ii'
  | 'residential_care'
  | 'icf_iid'
  | 'prtf'
  | 'adult_day_care'
  | 'post_acute_head_injury';

/**
 * The exact license a facility holds. Aligns with `facilities.license_type` and
 * the membership values used in `compliance_criteria.applicable_license_types`.
 */
export type LicenseType = ChildcareLicenseType | LongTermCareLicenseType;

/**
 * Which exact license types belong to which broad sector. Drives the onboarding
 * license picker and any sector-scoped filtering.
 */
export const LICENSE_TYPES_BY_FACILITY_TYPE: Record<FacilityType, ReadonlyArray<LicenseType>> = {
  childcare_center: ['childcare_center', 'childcare_family_home', 'registered_family_home', 'ost'],
  nursing_home: [
    'nursing_facility',
    'assisted_living_i',
    'assisted_living_ii',
    'residential_care',
    'icf_iid',
    'prtf',
    'adult_day_care',
    'post_acute_head_injury',
  ],
};

export const LICENSE_TYPE_LABELS: Record<LicenseType, string> = {
  // ADE Office of Early Childhood
  childcare_center: 'Licensed Child Care Center',
  childcare_family_home: 'Licensed Child Care Family Home',
  registered_family_home: 'Registered Child Care Family Home',
  ost: 'Out-of-School-Time Facility',
  // DHS Office of Long Term Care
  nursing_facility: 'Nursing Facility',
  assisted_living_i: 'Assisted Living Facility (Level I)',
  assisted_living_ii: 'Assisted Living Facility (Level II)',
  residential_care: 'Residential Care Facility',
  icf_iid: 'Intermediate Care Facility (ICF/IID)',
  prtf: 'Psychiatric Residential Treatment Facility (PRTF)',
  adult_day_care: 'Adult Day Care / Adult Day Health Care',
  post_acute_head_injury: 'Post-Acute Head Injury Facility',
};

/**
 * One-line descriptions surfaced under each license option in onboarding.
 */
export const LICENSE_TYPE_DESCRIPTIONS: Record<LicenseType, string> = {
  childcare_center: '6+ children from more than one family',
  childcare_family_home: '6 to 16 children in a residence',
  registered_family_home: 'Fewer than 6 children (voluntary)',
  ost: 'Center-based, school-age only',
  nursing_facility: 'Skilled/long-term nursing care (SNF/NF)',
  assisted_living_i: 'Supportive care, no nursing services',
  assisted_living_ii: 'Nursing-home level of care eligible',
  residential_care: 'Non-nursing supportive residential care',
  icf_iid: 'Intellectual/developmental disability care',
  prtf: 'Inpatient psychiatric care, under age 21',
  adult_day_care: 'Daytime adult supportive/health services',
  post_acute_head_injury: 'Specialized head-injury rehabilitation',
};

/** The governing authority for a given license type (for UI hints). */
export const REGULATORY_BODY_BY_LICENSE_TYPE: Record<LicenseType, RegulatoryBody> = {
  childcare_center: 'ADE_OEC',
  childcare_family_home: 'ADE_OEC',
  registered_family_home: 'ADE_OEC',
  ost: 'ADE_OEC',
  nursing_facility: 'AR_DHS_DPSQA_OLTC',
  assisted_living_i: 'AR_DHS_DPSQA_OLTC',
  assisted_living_ii: 'AR_DHS_DPSQA_OLTC',
  residential_care: 'AR_DHS_DPSQA_OLTC',
  icf_iid: 'AR_DHS_DPSQA_OLTC',
  prtf: 'AR_DHS_DPSQA_OLTC',
  adult_day_care: 'AR_DHS_DPSQA_OLTC',
  post_acute_head_injury: 'AR_DHS_DPSQA_OLTC',
};

/**
 * A regulatory title the user selects for themselves during onboarding (or in
 * settings). `facilityRef` optionally pins the title to a specific facility
 * (by the onboarding queue id, then resolved to a real facility id on save).
 */
export interface SelectedRole {
  roleName: string;
  facilityType: FacilityType;
  facilityRef?: string | null;
}

/**
 * Sub-classification toggles persisted as boolean columns on the `facilities` table.
 * These are the "scope tags" that activate/deactivate specific rules and roles.
 */
export interface FacilityScopeToggles {
  // --- Childcare Center toggles ---
  infant_toddler: boolean;
  transportation: boolean;
  food_service: boolean;
  water_activities: boolean;
  pets: boolean;
  special_needs: boolean;
  sick_care: boolean;
  school_age: boolean;
  night_care: boolean;
  clinical: boolean;

  // --- Nursing Home toggles ---
  private_water: boolean;
  memory_care: boolean;
  rehabilitation: boolean;
}

export const FACILITY_TOGGLE_KEYS: ReadonlyArray<keyof FacilityScopeToggles> = [
  'infant_toddler',
  'transportation',
  'food_service',
  'water_activities',
  'pets',
  'special_needs',
  'sick_care',
  'school_age',
  'night_care',
  'clinical',
  'private_water',
  'memory_care',
  'rehabilitation',
] as const;

export type FacilityToggleKey = keyof FacilityScopeToggles;

/**
 * Display labels for the boolean toggles surfaced in onboarding/settings UI.
 */
export const FACILITY_TOGGLE_LABELS: Record<FacilityToggleKey, string> = {
  infant_toddler: 'Infants / Toddlers',
  transportation: 'Transportation',
  food_service: 'Food Service',
  water_activities: 'Water Activities',
  pets: 'Pets On-Site',
  special_needs: 'Special Needs Care',
  sick_care: 'Sick Care',
  school_age: 'School Age Program',
  night_care: 'Night Care',
  clinical: 'EIDT / Clinical Services',
  private_water: 'Private Water Source',
  memory_care: "Alzheimer's / Memory Care Unit",
  rehabilitation: 'Rehabilitation / Therapy Services',
};

/**
 * Which toggles apply to which facility type. Used to filter the UI.
 */
export const TOGGLES_BY_FACILITY_TYPE: Record<FacilityType, ReadonlyArray<FacilityToggleKey>> = {
  childcare_center: [
    'infant_toddler',
    'transportation',
    'food_service',
    'water_activities',
    'pets',
    'special_needs',
    'sick_care',
    'school_age',
    'night_care',
    'clinical',
  ],
  nursing_home: ['private_water', 'memory_care', 'rehabilitation'],
};

/**
 * Full Facility model as stored in the `facilities` table.
 * The three optional fields below are computed at the server-action layer
 * (getAllFacilitiesOverview) and are never persisted to the database.
 */
export interface Facility extends FacilityScopeToggles {
  id: string;
  org_id: string;
  name: string;
  facility_type: FacilityType;
  /** The exact Arkansas license this facility holds (additive to facility_type). */
  license_type: LicenseType | null;
  license_number: string | null;
  capacity: number | null;
  active_enrollment: number | null;
  enrollment_updated_at: string | null;
  director_id: string | null;
  created_at?: string;
  // --- Computed operational metrics ---
  active_staff_count?: number;
  capacity_utilization?: number;
  gross_ratio?: string;
}

/**
 * A "score category" classifies which of the twin dials a rule contributes to.
 * - 'facility' rolls into the 🏢 Facility Operations Score
 * - 'personnel' rolls into the 👥 Personnel & Licensing Upkeep score
 * - null means the rule is informational/operational and does not factor into either dial
 */
export type ScoreCategory = 'facility' | 'personnel' | null;

/**
 * A compliance rule as stored in `compliance_criteria`.
 * Note the deliberate removal of `is_personnel_requirement` in favor of `score_category`.
 */
export interface ComplianceRule {
  id: string;
  facility_type: FacilityType;
  sub_classification: FacilityToggleKey | null;
  requirement_name: string;
  required_document_type: string;
  severity: 'critical' | 'standard';
  frequency: ComplianceFrequency;
  is_scored: boolean;
  score_category: ScoreCategory;
  /**
   * How the requirement is satisfied:
   *  - 'document'      → an uploaded/attested facility_documents row (default)
   *  - 'recurring_log' → a per-period completion in operational_task_completions
   */
  task_kind?: 'document' | 'recurring_log';
  /**
   * When true, this requirement may be satisfied by a file-less digital
   * attestation (reserved for items with no uploadable artifact). Defaults to
   * false — everything else must be satisfied by Upload (with human-review
   * fallback) or Mark N/A.
   */
  attestation_allowed?: boolean;
  /** Role-specific override. When non-empty, only staff whose role is listed here are subject to this rule. */
  applicable_roles?: string[] | null;
  /**
   * Exact license-type scope. When non-empty, the rule only applies to
   * facilities whose `license_type` is in this list. NULL/empty = applies to
   * every license type within `facility_type` (the common, sector-wide case).
   */
  applicable_license_types?: string[] | null;
  /** Governing regulatory authority for this criterion. */
  regulatory_body?: RegulatoryBody | null;
}

/**
 * Frequencies we treat as first-class strings throughout the engine.
 * Any string is accepted at runtime, but these are the canonical values.
 */
export type ComplianceFrequency =
  | 'one-time'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'biannual'
  | 'annual'
  | '2_years'
  | '3_years'
  | '5_years'
  | '10_years'
  | 'ongoing'
  | string;

/**
 * The compliance status of a single requirement for the UI.
 * - 'missing'        → no matching document exists
 * - 'satisfied'      → document exists and is not near expiration
 * - 'expiring_soon'  → document exists but expires within 30 days
 * - 'expired'        → document exists but its expiration date has passed
 * - 'pending_review' → document was uploaded but AI rejected it; awaiting human review
 */
export type DocumentComplianceStatus = 'missing' | 'satisfied' | 'expiring_soon' | 'expired' | 'pending_review';

/**
 * The shape returned by the Twin-Score Engine for an individual outstanding rule.
 */
export interface IdentifiedGap {
  id: string;
  name: string;
  typeKey: string;
  severity: 'critical' | 'standard';
  frequency: ComplianceFrequency;
  is_scored: boolean;
  score_category: ScoreCategory;
  compliance_status: DocumentComplianceStatus;
  document_id?: string;
  document_created_at?: string;
  completed?: boolean;
  completionType?: 'document' | 'attestation' | 'n/a';
  /** When true, a file-less digital attestation is permitted for this requirement. */
  attestation_allowed?: boolean;
  /**
   * For roster-aware personnel rules: how many of the active employees the rule
   * applies to currently hold a satisfying document. Absent for facility rules.
   */
  coverage?: { covered: number; total: number };
}

/**
 * Baseline staffing-adequacy assessment.
 * Derived entirely from the facility's *baseline* enrollment/census and active
 * personnel count — never from daily attendance — so directors never have to
 * update a number every day. Treated as a planning guideline, not a hard score.
 */
export type StaffingStatus = 'adequate' | 'tight' | 'understaffed' | 'unknown';

export interface StaffingAdequacy {
  status: StaffingStatus;
  /** Baseline enrollment (childcare) or resident census (nursing home). */
  enrollment: number | null;
  /** Active personnel currently on record for the facility. */
  actualStaff: number;
  /** Minimum staff implied by the regulatory ratio; null when enrollment unknown. */
  requiredStaff: number | null;
  /** max(0, requiredStaff - actualStaff). */
  shortfall: number;
  /** The "N per staff" threshold used for the estimate. */
  perStaffThreshold: number;
  /** 'children' for childcare, 'residents' for nursing homes. */
  unitLabel: 'children' | 'residents';
  /** Human-readable description of the ratio basis. */
  basisLabel: string;
  /** Honest caveat shown beneath the panel. */
  note: string;
}

/**
 * Aggregated payload returned to the dashboard.
 */
export interface RegulatoryStatus {
  facilityReadinessScore: number;
  personnelReadinessScore: number;
  identifiedGaps: IdentifiedGap[];
  staffCount: number;
  capacity: number | null;
  activeEnrollment: number | null;
  enrollmentUpdatedAt: string | null;
  staffing: StaffingAdequacy;
}
