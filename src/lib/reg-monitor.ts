// src/lib/reg-monitor.ts
import { createAdminClient } from 'src/app/utils/supabase/admin';
import type {
  ComplianceRule,
  Facility,
  FacilityToggleKey,
  IdentifiedGap,
  RegulatoryStatus,
  ScoreCategory,
} from './types';
import { FACILITY_TOGGLE_KEYS } from './types';

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
function tokensMatch(ruleKey: string, docKey: string): boolean {
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
 *   - rule.sub_classification IS NULL, OR
 *   - rule.sub_classification matches a toggle currently set to TRUE on the facility profile.
 */
export function ruleAppliesToFacility(
  rule: Pick<ComplianceRule, 'facility_type' | 'sub_classification'>,
  facility: Pick<Facility, 'facility_type' | FacilityToggleKey>
): boolean {
  if (rule.facility_type !== facility.facility_type) return false;
  if (
    rule.sub_classification === null ||
    rule.sub_classification === undefined ||
    rule.sub_classification === 'null'
  ) {
    return true;
  }
  const activated = activeToggleKeys(facility);
  return activated.has(rule.sub_classification);
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
    }));

  console.log(
    `📋 Compliance Engine: ${allRules?.length ?? 0} total rules → ${applicableRules.length} applicable for ${facilityProfile.facility_type}.`
  );

  // 4. Fetch approved facility documents to compute satisfied requirements.
  const { data: uploadedDocs } = await supabase
    .from('facility_documents')
    .select('document_type, status')
    .eq('facility_id', facilityId)
    .eq('status', 'approved');

  const uploadedDocTypes = (uploadedDocs || [])
    .map((d: { document_type: string | null }) => d.document_type)
    .filter((t): t is string => Boolean(t));

  const satisfiedRuleIds = new Set<string>();
  for (const rule of applicableRules) {
    const isMatched = uploadedDocTypes.some((docType) =>
      tokensMatch(rule.required_document_type, docType)
    );
    if (isMatched) {
      satisfiedRuleIds.add(rule.id);
    }
  }

  // 5. THE TWIN-SCORE MATH: separate buckets for facility vs. personnel rules.
  const facilityScoredRules = applicableRules.filter(
    (r) => r.is_scored && r.score_category === 'facility'
  );
  const personnelScoredRules = applicableRules.filter(
    (r) => r.is_scored && r.score_category === 'personnel'
  );

  const facilityVerified = facilityScoredRules.filter((r) => satisfiedRuleIds.has(r.id)).length;
  const personnelVerified = personnelScoredRules.filter((r) => satisfiedRuleIds.has(r.id)).length;

  const facilityReadinessScore =
    facilityScoredRules.length > 0
      ? Math.round((facilityVerified / facilityScoredRules.length) * 100)
      : 100;

  const personnelReadinessScore =
    personnelScoredRules.length > 0
      ? Math.round((personnelVerified / personnelScoredRules.length) * 100)
      : 100;

  console.log(
    `📊 Twin-Score → Facility: ${facilityVerified}/${facilityScoredRules.length} = ${facilityReadinessScore}% | Personnel: ${personnelVerified}/${personnelScoredRules.length} = ${personnelReadinessScore}%`
  );

  // 6. Build the dynamic gap list for the UI. We include ALL applicable rules (whether scored or not)
  //    so the UI can decide where to render them (checklist vs blueprint).
  const identifiedGaps: IdentifiedGap[] = applicableRules
    .filter((rule) => !satisfiedRuleIds.has(rule.id))
    .map((rule) => ({
      id: rule.id,
      name: rule.requirement_name,
      typeKey: rule.required_document_type,
      severity: rule.severity,
      frequency: rule.frequency,
      is_scored: rule.is_scored,
      score_category: rule.score_category,
    }));

  // 7. Active staff count for the personnel headcount widget.
  const { count: personnelCount } = await supabase
    .from('personnel')
    .select('*', { count: 'exact', head: true })
    .eq('facility_id', facilityId)
    .eq('status', 'active');

  return {
    facilityReadinessScore,
    personnelReadinessScore,
    identifiedGaps,
    staffCount: personnelCount ?? 0,
    capacity: facilityProfile.capacity ?? null,
    activeEnrollment: facilityProfile.active_enrollment ?? null,
    enrollmentUpdatedAt: facilityProfile.enrollment_updated_at ?? null,
  };
}
