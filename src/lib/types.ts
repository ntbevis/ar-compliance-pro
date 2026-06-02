// src/lib/types.ts
// Central strict-typed schema definitions. The source of truth for our pristine taxonomy.

/**
 * Top-level regulatory authority domain.
 * Aligns with the `facility_type` column in the `facilities` and `compliance_criteria` tables.
 */
export type FacilityType = 'childcare_center' | 'nursing_home';

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
