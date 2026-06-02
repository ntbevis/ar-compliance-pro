// src/lib/reg-monitor.ts
import { createAdminClient } from 'src/app/utils/supabase/admin';
import type {
  ComplianceRule,
  ComplianceFrequency,
  DocumentComplianceStatus,
  Facility,
  FacilityToggleKey,
  IdentifiedGap,
  RegulatoryStatus,
  ScoreCategory,
} from './types';
import { FACILITY_TOGGLE_KEYS } from './types';
import { computeStaffingAdequacy } from './staffing';
import { recurringStatus } from './recurrence';

const EMPTY_KEYS: Set<string> = new Set();

/**
 * String normalization helper for resilient fuzzy matching against uploaded documents.
 */
function normalizeDocumentKey(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .toLowerCase()
    .trim()
    .replace(/[\s\-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

/**
 * Fuzzy token matching helper. Returns true if a rule's slug overlaps with an uploaded
 * document's classified document_type.
 */
export function tokensMatch(ruleKey: string, docKey: string): boolean {
  const normalizedRule = normalizeDocumentKey(ruleKey);
  const normalizedDoc = normalizeDocumentKey(docKey);

  if (!normalizedRule || !normalizedDoc) return false;
  if (normalizedRule === normalizedDoc) return true;
  if (normalizedRule.includes(normalizedDoc) || normalizedDoc.includes(normalizedRule)) {
    return true;
  }

  const ruleTokens = normalizedRule.split('_').filter((t) => t.length > 2);
  const docTokens = normalizedDoc.split('_').filter((t) => t.length > 2);
  const sharedTokens = ruleTokens.filter((token) => docTokens.includes(token));
  return sharedTokens.length >= 2;
}

/**
 * Returns the list of toggle keys that are TRUE on a given facility.
 * These represent the activated scope flags that a rule's sub_classification can match.
 */
function activeToggleKeys(facility: Pick<Facility, FacilityToggleKey>): Set<string> {
  const activated = new Set<string>();
  for (const key of FACILITY_TOGGLE_KEYS) {
    if (facility[key]) activated.add(key);
  }
  return activated;
}

/**
 * THE SMART FILTER.
 *
 * A rule applies to a facility IF:
 *   - rule.facility_type === facility.facility_type, AND
 *   - rule.sub_classification IS NULL / undefined / 'null' (universal rule), OR
 *   - rule.sub_classification is a universal baseline tag that always applies
 *     regardless of optional scope toggles ('all_staff', 'facility_management', 'education'), OR
 *   - rule.sub_classification matches a toggle currently set to TRUE on the facility profile.
 */
/** Scope tags that apply without a matching facility toggle (see ruleAppliesToFacility). */
export const UNIVERSAL_BASELINE_TAGS = new Set(['all_staff', 'facility_management', 'education']);

export function ruleAppliesToFacility(
  rule: Pick<ComplianceRule, 'facility_type' | 'sub_classification'>,
  facility: Pick<Facility, 'facility_type' | FacilityToggleKey>
): boolean {
  if (rule.facility_type !== facility.facility_type) return false;
  const sub = rule.sub_classification as string | null | undefined;
  if (sub === null || sub === undefined || sub === 'null' || UNIVERSAL_BASELINE_TAGS.has(sub)) {
    return true;
  }
  const activated = activeToggleKeys(facility);
  return activated.has(rule.sub_classification as string);
}

// =============================================================================
// PERSONNEL ROLE MATCHING (shared by the Personnel Vault and the twin-score)
// =============================================================================

/** Normalize applicable_roles from Supabase (text[] or legacy string forms). */
export function normalizeApplicableRoles(raw: unknown): string[] | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    const roles = raw.filter((r): r is string => typeof r === 'string' && r.trim().length > 0);
    return roles.length > 0 ? roles : null;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === '{}' || trimmed === '[]') return null;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        const roles = parsed.filter((r): r is string => typeof r === 'string' && r.trim().length > 0);
        return roles.length > 0 ? roles : null;
      }
    } catch {
      // PostgreSQL text[] literal: {Role A,Role B}
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        const inner = trimmed.slice(1, -1);
        if (!inner) return null;
        const roles = inner.split(',').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
        return roles.length > 0 ? roles : null;
      }
    }
  }
  return null;
}

/**
 * Title-based role exclusivity (backstop when applicable_roles in DB is too broad).
 * Returns allowed role_name values, or null if the title is not exclusive.
 */
export function exclusiveRolesForRequirement(
  requirementName: string,
  facilityType: ComplianceRule['facility_type']
): string[] | null {
  const name = requirementName.toLowerCase();

  if (facilityType === 'childcare_center') {
    if (name.includes('new director orientation') || name.includes('director educational')) {
      return ['Center Director'];
    }
    if (name.includes('sick care director') && name.includes('training')) {
      return ['Sick Care Director'];
    }
    if (name.includes('lifeguard')) {
      return ['Lifeguard / Water Safety'];
    }
    if (
      name.includes('driver') &&
      (name.includes('license') || name.includes('safety') || name.includes('cpr'))
    ) {
      return ['Driver / Transportation Staff'];
    }
    if (name.includes('licensed practical nurse') || (name.includes('lpn') && name.includes('board'))) {
      return ['Licensed Practical Nurse (LPN) - Childcare'];
    }
    if (name.includes('registered nurse') && name.includes('board')) {
      return ['Registered Nurse (RN) - Childcare'];
    }
  }

  if (facilityType === 'nursing_home') {
    if (name.includes('medical director')) {
      return ['Medical Director'];
    }
    if (name.includes('pharmacist') || name.includes('pharmacy')) {
      return ['Consulting Pharmacist'];
    }
    if (name.includes('dietitian') && !name.includes('consultation')) {
      return ['Consulting Dietitian'];
    }
    if (name.includes('administrator license') || name.includes('administrator licensure')) {
      return ['Nursing Home Administrator'];
    }
    if (name.includes('director of nursing') && name.includes('agreement')) {
      return ['Director of Nursing (DON)'];
    }
    if (name.includes('licensed practical nurse') || (name.includes('lpn') && name.includes('board'))) {
      return ['Licensed Practical Nurse (LPN)'];
    }
    if (name.includes('registered nurse') && name.includes('board')) {
      return ['Registered Nurse (RN)', 'Director of Nursing (DON)'];
    }
    if (name.includes('cna')) {
      return ['Certified Nursing Assistant (CNA)'];
    }
    if (name.includes('rehabilitation therapist')) {
      return ['Rehabilitation Therapist (OT/PT/SLP)'];
    }
  }

  return null;
}

/**
 * The ROLE dimension of personnel applicability. Does a personnel rule apply to a
 * specific role title? (Facility toggle/scope gating is handled separately by
 * ruleAppliesToFacility — callers must combine both for full correctness.)
 */
export function personnelRuleMatchesRole(
  rule: { requirement_name?: unknown; applicable_roles?: unknown; applies_to_role?: unknown },
  roleName: string,
  facilityType: ComplianceRule['facility_type']
): boolean {
  const normalizedRoleName = roleName.trim().toLowerCase();
  if (!normalizedRoleName) return false;

  const requirementName = String(rule.requirement_name ?? '');
  const exclusiveRoles = exclusiveRolesForRequirement(requirementName, facilityType);
  if (exclusiveRoles !== null) {
    return exclusiveRoles.some((r) => r.toLowerCase() === normalizedRoleName);
  }

  const applicableRoles = normalizeApplicableRoles(rule.applicable_roles);
  if (applicableRoles !== null) {
    return applicableRoles.some((r) => r.toLowerCase() === normalizedRoleName);
  }

  const ruleRole = (rule.applies_to_role as string | null | undefined) ?? null;
  if (ruleRole === null) return true;
  return ruleRole.toLowerCase() === normalizedRoleName;
}

/**
 * Resolve the score category for a rule, gracefully handling legacy `is_personnel_requirement`
 * rows that have not yet been backfilled with `score_category`.
 */
function resolveScoreCategory(rule: Record<string, unknown>): ScoreCategory {
  const raw = rule.score_category;
  if (raw === 'facility' || raw === 'personnel') return raw;
  if (rule.is_personnel_requirement === true) return 'personnel';
  if (rule.is_personnel_requirement === false) return 'facility';
  return null;
}

/**
 * Resolve whether a rule should be included in the twin-score math, with safe defaults
 * for rows missing `is_scored` (treat them as scored).
 */
function resolveIsScored(rule: Record<string, unknown>): boolean {
  if (typeof rule.is_scored === 'boolean') return rule.is_scored;
  return true;
}

/**
 * Safely parses a date string to a Date object.
 * Returns null if the string is missing, empty, or does not produce a valid Date.
 */
function safeParseDate(value: string | null | undefined): Date | null {
  if (!value || typeof value !== 'string') return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Calculates the expiration date for a document.
 *
 * Priority:
 *   1. `aiExpirationDate` — the printed expiration extracted by the AI (YYYY-MM-DD).
 *   2. Fall back to `createdAt + frequency` calculation if no AI date is available.
 *
 * Returns null for frequencies with no defined expiration (e.g. 'ongoing', 'one-time').
 */
export function calcExpirationDate(
  createdAt: string,
  frequency: ComplianceFrequency,
  aiExpirationDate?: string | null
): Date | null {
  // Priority 1: AI-extracted printed expiration date
  const aiDate = safeParseDate(aiExpirationDate);
  if (aiDate) return aiDate;

  // Priority 2: calculate from upload date + renewal frequency
  const created = safeParseDate(createdAt);
  if (!created) return null;

  const d = new Date(created);
  switch (frequency) {
    case 'daily':      d.setDate(d.getDate() + 1); break;
    case 'weekly':     d.setDate(d.getDate() + 7); break;
    case 'monthly':    d.setMonth(d.getMonth() + 1); break;
    case 'quarterly':  d.setMonth(d.getMonth() + 3); break;
    case 'biannual':   d.setMonth(d.getMonth() + 6); break;
    case 'annual':     d.setFullYear(d.getFullYear() + 1); break;
    case '2_years':    d.setFullYear(d.getFullYear() + 2); break;
    case '3_years':    d.setFullYear(d.getFullYear() + 3); break;
    case '5_years':    d.setFullYear(d.getFullYear() + 5); break;
    case '10_years':   d.setFullYear(d.getFullYear() + 10); break;
    // one-time, ongoing, and unknown frequencies do not expire
    default:           return null;
  }
  return d;
}

/**
 * Determines the compliance status of a satisfied requirement based on:
 *   1. The AI-extracted expiration date stored in `metadata.ai_extracted_expiration` (preferred), OR
 *   2. The rule's renewal frequency applied to the document's upload date (fallback).
 */
function calcComplianceStatus(
  createdAt: string,
  frequency: ComplianceFrequency,
  docMetadata?: Record<string, unknown> | null
): DocumentComplianceStatus {
  const aiExpirationDate =
    typeof docMetadata?.ai_extracted_expiration === 'string'
      ? docMetadata.ai_extracted_expiration
      : null;

  const expiration = calcExpirationDate(createdAt, frequency, aiExpirationDate);
  if (!expiration) return 'satisfied'; // ongoing / one-time — never expires

  const daysUntilExpiry = (expiration.getTime() - Date.now()) / (1000 * 60 * 60 * 24);

  if (daysUntilExpiry < 0) return 'expired';
  if (daysUntilExpiry <= 30) return 'expiring_soon';
  return 'satisfied';
}

/**
 * Reads from our database to calculate twin-score metrics for the dashboard.
 *
 * Returns:
 *   - facilityReadinessScore:    (uploaded documents / total scored rules where score_category === 'facility') * 100
 *   - personnelReadinessScore:   (uploaded documents / total scored rules where score_category === 'personnel') * 100
 *   - identifiedGaps:            dynamically filtered list of outstanding rules
 *   - staffCount, capacity, activeEnrollment, enrollmentUpdatedAt
 *
 * The "dumb fetch + smart filter" pattern keeps the UI alive even if Supabase has issues.
 */
export async function getRegulatoryStatus(facilityId: string): Promise<RegulatoryStatus> {
  const supabase = createAdminClient();

  // 1. Fetch the facility profile with capacity, active_enrollment, and ALL scope toggle columns
  const { data: facility, error: facilityError } = await supabase
    .from('facilities')
    .select(
      [
        'id',
        'facility_type',
        'capacity',
        'active_enrollment',
        'enrollment_updated_at',
        ...FACILITY_TOGGLE_KEYS,
      ].join(', ')
    )
    .eq('id', facilityId)
    .single();

  if (facilityError || !facility) {
    console.error('❌ Failed to load facility profile for compliance scoring:', facilityError);
    return {
      facilityReadinessScore: 0,
      personnelReadinessScore: 0,
      identifiedGaps: [],
      staffCount: 0,
      capacity: null,
      activeEnrollment: null,
      enrollmentUpdatedAt: null,
      staffing: computeStaffingAdequacy({
        facilityType: 'childcare_center',
        enrollment: null,
        actualStaff: 0,
        toggles: {},
      }),
    };
  }

  const facilityProfile = facility as unknown as Facility;

  // 2. THE DUMB FETCH: pull every rule. We will filter in TypeScript.
  const { data: allRules, error: rulesError } = await supabase
    .from('compliance_criteria')
    .select('*');

  if (rulesError) {
    console.error('❌ Supabase fetch error on compliance_criteria:', rulesError);
    // Fail gracefully so dependent UI (staffing math, blueprints) still renders.
  }

  // 3. THE SMART FILTER: keep rules that match the facility type AND scope toggles.
  const applicableRules: ComplianceRule[] = (allRules || [])
    .filter((rule: Record<string, unknown>) =>
      ruleAppliesToFacility(rule as unknown as ComplianceRule, facilityProfile)
    )
    .map((rule: Record<string, unknown>) => ({
      id: rule.id as string,
      facility_type: rule.facility_type as ComplianceRule['facility_type'],
      sub_classification: (rule.sub_classification ?? null) as ComplianceRule['sub_classification'],
      requirement_name: (rule.requirement_name as string) ?? '',
      required_document_type: (rule.required_document_type as string) ?? '',
      severity: ((rule.severity as ComplianceRule['severity']) ?? 'standard'),
      frequency: (rule.frequency as ComplianceRule['frequency']) ?? 'annual',
      is_scored: resolveIsScored(rule),
      score_category: resolveScoreCategory(rule),
      task_kind: rule.task_kind === 'recurring_log' ? 'recurring_log' : 'document',
      attestation_allowed: rule.attestation_allowed === true,
    }));

  console.log(
    `📋 Compliance Engine: ${allRules?.length ?? 0} total rules → ${applicableRules.length} applicable for ${facilityProfile.facility_type}.`
  );

  // 4. Fetch approved AND pending facility documents to compute satisfied requirements.
  //    Pending documents surface as 'pending_review' and do not count toward the score.
  const { data: uploadedDocs } = await supabase
    .from('facility_documents')
    .select('id, document_type, status, created_at, metadata')
    .eq('facility_id', facilityId)
    .in('status', ['approved', 'pending'])
    .order('created_at', { ascending: false }); // newest first so we pick the freshest match

  type UploadedDoc = {
    id: string;
    document_type: string | null;
    status: string;
    created_at: string;
    metadata: Record<string, unknown> | null;
  };
  const docs: UploadedDoc[] = (uploadedDocs || []) as UploadedDoc[];

  // Map from rule id → the best matching document (most recent)
  const satisfiedRuleMap = new Map<string, { docId: string; createdAt: string; status: DocumentComplianceStatus }>();

  for (const rule of applicableRules) {
    const matchingDoc = docs.find(
      (d) => d.document_type && tokensMatch(rule.required_document_type, d.document_type)
    );
    if (matchingDoc) {
      // Pending documents are awaiting human review — surface as 'pending_review' without scoring.
      const status: DocumentComplianceStatus = matchingDoc.status === 'pending'
        ? 'pending_review'
        : calcComplianceStatus(matchingDoc.created_at, rule.frequency, matchingDoc.metadata);
      satisfiedRuleMap.set(rule.id, {
        docId: matchingDoc.id,
        createdAt: matchingDoc.created_at,
        status,
      });
    }
  }

  // A rule is "satisfied enough" for score purposes if the doc exists (even if expired/expiring)
  const satisfiedRuleIds = new Set(satisfiedRuleMap.keys());

  // 4b. Recurring operational tasks are satisfied by a per-period completion, not a
  //     document. Pull recent completions for the applicable recurring rules so the
  //     score/gap engine can evaluate their done/due/overdue status. 130 days covers
  //     the current + last-closed period even for quarterly cadences.
  const recurringRuleIds = applicableRules
    .filter((r) => r.task_kind === 'recurring_log')
    .map((r) => r.id);
  const completionsByRule = new Map<string, Set<string>>();
  if (recurringRuleIds.length > 0) {
    const since = new Date(Date.now() - 130 * 24 * 60 * 60 * 1000).toISOString();
    const { data: completions } = await supabase
      .from('operational_task_completions')
      .select('criteria_id, period_key')
      .eq('facility_id', facilityId)
      .in('criteria_id', recurringRuleIds)
      .gte('completed_at', since);
    for (const c of (completions ?? []) as Array<{ criteria_id: string; period_key: string }>) {
      const set = completionsByRule.get(c.criteria_id) ?? new Set<string>();
      set.add(c.period_key);
      completionsByRule.set(c.criteria_id, set);
    }
  }

  /** Recurring task satisfied for scoring when it isn't overdue (done or in-grace due). */
  const recurringSatisfied = (rule: ComplianceRule): boolean =>
    recurringStatus(rule.frequency, completionsByRule.get(rule.id) ?? EMPTY_KEYS) !== 'overdue';

  // 5. THE FACILITY SCORE: facility-category scored rules, satisfied by any facility doc.
  //    Daily-frequency rules are operational expectations, not verifiable upload events —
  //    they are intentionally excluded from the score buckets.
  const facilityScoredRules = applicableRules.filter(
    (r) => r.is_scored && r.score_category === 'facility' && r.frequency !== 'daily'
  );
  const facilityVerified = facilityScoredRules.filter((r) =>
    r.task_kind === 'recurring_log'
      ? recurringSatisfied(r)
      : satisfiedRuleIds.has(r.id) && satisfiedRuleMap.get(r.id)?.status !== 'pending_review'
  ).length;
  const facilityReadinessScore =
    facilityScoredRules.length > 0
      ? Math.round((facilityVerified / facilityScoredRules.length) * 100)
      : 100;

  // 6. THE PERSONNEL SCORE — roster-aware.
  //    Load the active roster. A personnel rule is only "in scope" if at least one
  //    active employee holds a role it applies to (so a facility is never dinged for
  //    a pharmacist/dietitian it does not employ). The rule is satisfied only when
  //    EVERY applicable employee has a current document for it, matched by personnel_id.
  const { data: rosterRows } = await supabase
    .from('personnel')
    .select('id, role')
    .eq('facility_id', facilityId)
    .eq('status', 'active');
  const activeStaff = (rosterRows ?? []) as Array<{ id: string; role: string }>;
  const personnelCount = activeStaff.length;

  // Personnel candidate rules straight from the raw rows (so applicable_roles is available),
  // gated by facility scope + scored + non-daily.
  const personnelCandidateRules = (allRules || []).filter((rule: Record<string, unknown>) => {
    if (!ruleAppliesToFacility(rule as unknown as ComplianceRule, facilityProfile)) return false;
    if (resolveScoreCategory(rule) !== 'personnel') return false;
    if (!resolveIsScored(rule)) return false;
    return String(rule.frequency ?? '') !== 'daily';
  });

  /** Resolve a single employee's document status for a personnel rule (null === missing). */
  const personnelDocStatus = (
    requiredDocType: string,
    frequency: ComplianceFrequency,
    employeeId: string
  ): DocumentComplianceStatus | null => {
    const doc = docs.find((d) => {
      const meta = d.metadata as Record<string, unknown> | null;
      return (
        meta &&
        meta.personnel_id === employeeId &&
        d.document_type &&
        tokensMatch(requiredDocType, d.document_type)
      );
    });
    if (!doc) return null;
    if (doc.status === 'pending') return 'pending_review';
    return calcComplianceStatus(doc.created_at, frequency, doc.metadata);
  };

  const STATUS_PRIORITY: Record<DocumentComplianceStatus, number> = {
    missing: 4,
    expired: 3,
    expiring_soon: 2,
    pending_review: 1,
    satisfied: 0,
  };

  const personnelGaps: IdentifiedGap[] = [];
  let personnelInScope = 0;
  let personnelSatisfied = 0;

  for (const rule of personnelCandidateRules) {
    const facilityType = facilityProfile.facility_type;
    const requirementName = (rule.requirement_name as string) ?? '';
    const requiredDocType = (rule.required_document_type as string) ?? '';
    const frequency = (rule.frequency as ComplianceFrequency) ?? 'annual';

    const applicableStaff = activeStaff.filter((emp) =>
      personnelRuleMatchesRole(rule, emp.role, facilityType)
    );
    // Roster-aware: a rule with no employee in a matching role is simply not in scope.
    if (applicableStaff.length === 0) continue;

    personnelInScope += 1;

    let coveredCount = 0;
    let worst: DocumentComplianceStatus = 'satisfied';
    for (const emp of applicableStaff) {
      const status = personnelDocStatus(requiredDocType, frequency, emp.id) ?? 'missing';
      // Counts toward satisfaction if a non-pending document exists (expired still counts,
      // mirroring the facility-score convention so an expired doc never silently zeroes out).
      if (status !== 'missing' && status !== 'pending_review') coveredCount += 1;
      if (STATUS_PRIORITY[status] > STATUS_PRIORITY[worst]) worst = status;
    }

    const fullyCovered = coveredCount === applicableStaff.length;
    if (fullyCovered) personnelSatisfied += 1;

    personnelGaps.push({
      id: rule.id as string,
      name: requirementName,
      typeKey: requiredDocType,
      severity: ((rule.severity as IdentifiedGap['severity']) ?? 'standard'),
      frequency,
      is_scored: true,
      score_category: 'personnel',
      compliance_status: worst,
      coverage: { covered: coveredCount, total: applicableStaff.length },
      attestation_allowed: (rule.attestation_allowed as boolean) === true,
    });
  }

  const personnelReadinessScore =
    personnelInScope > 0 ? Math.round((personnelSatisfied / personnelInScope) * 100) : 100;

  console.log(
    `📊 Twin-Score → Facility: ${facilityVerified}/${facilityScoredRules.length} = ${facilityReadinessScore}% | Personnel: ${personnelSatisfied}/${personnelInScope} (roster of ${personnelCount}) = ${personnelReadinessScore}%`
  );

  // 7. Build the gap list for the UI.
  //    Facility + informational gaps keep the existing facility-document matching.
  //    Personnel gaps are the roster-aware entries computed above.
  //    Daily-frequency rules are surfaced only in the Operational Blueprints manual.
  const facilityAndInfoGaps: IdentifiedGap[] = applicableRules
    .filter((rule) => rule.frequency !== 'daily' && rule.score_category !== 'personnel')
    .map((rule) => {
      // Recurring tasks are satisfied by per-period completion, not a document.
      if (rule.task_kind === 'recurring_log') {
        const status = recurringStatus(rule.frequency, completionsByRule.get(rule.id) ?? EMPTY_KEYS);
        return {
          id: rule.id,
          name: rule.requirement_name,
          typeKey: rule.required_document_type,
          severity: rule.severity,
          frequency: rule.frequency,
          is_scored: rule.is_scored,
          score_category: rule.score_category,
          compliance_status: status === 'overdue' ? 'expired' : 'satisfied',
        };
      }
      const satisfaction = satisfiedRuleMap.get(rule.id);
      return {
        id: rule.id,
        name: rule.requirement_name,
        typeKey: rule.required_document_type,
        severity: rule.severity,
        frequency: rule.frequency,
        is_scored: rule.is_scored,
        score_category: rule.score_category,
        compliance_status: satisfaction ? satisfaction.status : 'missing',
        document_id: satisfaction?.docId,
        document_created_at: satisfaction?.createdAt,
        attestation_allowed: rule.attestation_allowed === true,
      };
    });

  const identifiedGaps: IdentifiedGap[] = [...facilityAndInfoGaps, ...personnelGaps];

  const staffing = computeStaffingAdequacy({
    facilityType: facilityProfile.facility_type,
    enrollment: facilityProfile.active_enrollment ?? null,
    actualStaff: personnelCount,
    toggles: facilityProfile,
  });

  return {
    facilityReadinessScore,
    personnelReadinessScore,
    identifiedGaps,
    staffCount: personnelCount,
    capacity: facilityProfile.capacity ?? null,
    activeEnrollment: facilityProfile.active_enrollment ?? null,
    enrollmentUpdatedAt: facilityProfile.enrollment_updated_at ?? null,
    staffing,
  };
}
