// src/lib/staffing.ts
// =============================================================================
// BASELINE STAFFING ADEQUACY ENGINE
// Turns the facility's *baseline* enrollment/census (a stable number the
// director sets occasionally — never daily) into a minimum-required-staff
// estimate and compares it against active personnel on record.
//
// Design intent: deliver real staffing-risk signal WITHOUT asking operators to
// log daily attendance. The regulatory ratio is auto-selected from the facility
// type and the scope toggles already captured during onboarding, so there is no
// new input to maintain. This is a planning guideline, not a substitute for
// shift-level scheduling.
// =============================================================================

import type { FacilityScopeToggles, FacilityType, StaffingAdequacy } from './types';

interface StaffingInput {
  facilityType: FacilityType;
  /** Baseline enrollment (childcare) or resident census (nursing home). */
  enrollment: number | null;
  /** Active personnel currently on record. */
  actualStaff: number;
  /** Scope toggles already stored on the facility (used to refine the ratio). */
  toggles: Partial<FacilityScopeToggles>;
}

/**
 * Selects a conservative "N per staff" threshold from the facility type and the
 * scope toggles we already store. Because we only hold a single baseline number
 * (not an age-band breakdown), these are intentionally cautious blended ratios.
 */
function resolveThreshold(
  facilityType: FacilityType,
  toggles: Partial<FacilityScopeToggles>
): { perStaffThreshold: number; basisLabel: string } {
  if (facilityType === 'nursing_home') {
    if (toggles.memory_care) {
      return {
        perStaffThreshold: 6,
        basisLabel: '1 direct-care staff : 6 residents (memory-care guideline)',
      };
    }
    return {
      perStaffThreshold: 10,
      basisLabel: '1 direct-care staff : 10 residents (day-shift guideline)',
    };
  }

  // Childcare: pick the band that drives the strictest realistic ratio.
  if (toggles.infant_toddler) {
    return {
      perStaffThreshold: 6,
      basisLabel: '1 staff : 6 children (infant / toddler ratio)',
    };
  }
  if (toggles.school_age) {
    return {
      perStaffThreshold: 15,
      basisLabel: '1 staff : 15 children (school-age ratio)',
    };
  }
  return {
    perStaffThreshold: 12,
    basisLabel: '1 staff : 12 children (preschool ratio)',
  };
}

export function computeStaffingAdequacy(input: StaffingInput): StaffingAdequacy {
  const { facilityType, enrollment, actualStaff, toggles } = input;
  const unitLabel: 'children' | 'residents' =
    facilityType === 'nursing_home' ? 'residents' : 'children';
  const censusWord = facilityType === 'nursing_home' ? 'resident census' : 'enrollment';
  const { perStaffThreshold, basisLabel } = resolveThreshold(facilityType, toggles);

  // No baseline set yet — prompt the director rather than guess.
  if (enrollment == null || enrollment <= 0) {
    return {
      status: 'unknown',
      enrollment: enrollment ?? null,
      actualStaff,
      requiredStaff: null,
      shortfall: 0,
      perStaffThreshold,
      unitLabel,
      basisLabel,
      note: `Set your baseline ${censusWord} above to estimate minimum required staffing.`,
    };
  }

  const requiredStaff = Math.ceil(enrollment / perStaffThreshold);
  const buffer = actualStaff - requiredStaff;
  const shortfall = buffer < 0 ? -buffer : 0;

  const status: StaffingAdequacy['status'] =
    buffer < 0 ? 'understaffed' : buffer === 0 ? 'tight' : 'adequate';

  const varianceReason =
    facilityType === 'nursing_home' ? 'shift and resident acuity' : 'classroom age mix';

  return {
    status,
    enrollment,
    actualStaff,
    requiredStaff,
    shortfall,
    perStaffThreshold,
    unitLabel,
    basisLabel,
    note: `Estimated from your baseline ${censusWord} and active personnel on record. Actual ratios vary by ${varianceReason} — use as a planning guideline, not a substitute for shift scheduling.`,
  };
}
