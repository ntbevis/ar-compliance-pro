'use server';

import { createClient } from 'src/app/utils/supabase/server';
import { createAdminClient } from 'src/app/utils/supabase/admin';
import type { FacilityType, LicenseType } from '@/lib/types';
import {
  normalizeApplicableLicenseTypes,
  normalizeApplicableRoles,
  UNIVERSAL_BASELINE_TAGS,
} from '@/lib/reg-monitor';

/**
 * Whether a rule's sub_classification passes for a given set of activated scope
 * toggles. Mirrors ruleAppliesToFacility's sub_classification gate so the
 * onboarding preview matches exactly what the dashboard will later score:
 *   - NULL / 'null' (universal), OR
 *   - a universal baseline tag (all_staff / facility_management / education), OR
 *   - a toggle currently switched on for the facility.
 */
function subClassificationApplies(
  sub: unknown,
  activeToggles: ReadonlySet<string>
): boolean {
  if (sub === null || sub === undefined || sub === 'null') return true;
  const tag = String(sub);
  if (UNIVERSAL_BASELINE_TAGS.has(tag)) return true;
  return activeToggles.has(tag);
}

/**
 * Returns the headline compliance criteria for a facility type, optionally
 * narrowed to an exact license type AND the facility's activated scope toggles.
 * Used in the onboarding preview so prospective customers see exactly what the
 * dashboard will track. When `activeToggles` is provided we apply the full
 * facility gate (sector + exact license + sub_classification); when omitted we
 * fall back to the broad sector + license gate only (legacy behavior).
 */
export async function getFacilityRequirements(
  facilityType: FacilityType,
  licenseType?: LicenseType | null,
  activeToggles?: readonly string[]
) {
  const supabase = await createClient();

  const { data: requirements, error } = await supabase
    .from('compliance_criteria')
    .select(
      'id, requirement_name, required_document_type, severity, frequency, score_category, sub_classification, applicable_license_types, regulatory_body'
    )
    .eq('facility_type', facilityType)
    .order('severity', { ascending: false });

  if (error) {
    console.error('Error fetching requirements:', error);
    return [];
  }

  const rows = requirements ?? [];
  const toggleSet = activeToggles ? new Set(activeToggles) : null;

  return rows.filter((r) => {
    // Exact-license gate: keep rules that are unrestricted OR explicitly include
    // this license type.
    if (licenseType) {
      const allowed = normalizeApplicableLicenseTypes(
        (r as { applicable_license_types?: unknown }).applicable_license_types
      );
      if (allowed !== null && !allowed.includes(licenseType)) return false;
    }
    // Scope-toggle gate: only applied when the caller passes the facility's
    // activated toggles, so the preview reflects the exact scored rule set.
    if (toggleSet) {
      return subClassificationApplies(
        (r as { sub_classification?: unknown }).sub_classification,
        toggleSet
      );
    }
    return true;
  });
}

/**
 * Returns the regulatory titles a user can pick for THEMSELVES during
 * onboarding, scoped to the broad sectors (and exact license types) they are
 * setting up. We do not yet have facility rows, so we filter on facility_type
 * and (when provided) the role's optional license_type scope.
 */
export async function getOnboardingRoleOptions(
  selections: Array<{ facilityType: FacilityType; licenseType?: LicenseType | null }>
): Promise<{ success: boolean; rolesByFacilityType: Record<string, string[]>; error?: string }> {
  try {
    if (!selections || selections.length === 0) {
      return { success: true, rolesByFacilityType: {} };
    }
    const supabase = createAdminClient();
    const facilityTypes = Array.from(new Set(selections.map((s) => s.facilityType)));
    const licenseTypesByFacility = new Map<FacilityType, Set<string>>();
    for (const s of selections) {
      if (!s.licenseType) continue;
      const set = licenseTypesByFacility.get(s.facilityType) ?? new Set<string>();
      set.add(s.licenseType);
      licenseTypesByFacility.set(s.facilityType, set);
    }

    const { data: roles, error } = await supabase
      .from('regulatory_roles')
      .select('role_name, facility_type, license_type')
      .in('facility_type', facilityTypes);

    if (error) {
      return { success: false, rolesByFacilityType: {}, error: error.message };
    }

    const rolesByFacilityType: Record<string, Set<string>> = {};
    for (const row of (roles ?? []) as Array<{ role_name: string; facility_type: string; license_type: string | null }>) {
      const roleLicense = row.license_type ?? null;
      // If the role is pinned to a license type, only surface it when the user
      // is onboarding that exact license (or hasn't picked one yet).
      if (roleLicense) {
        const picked = licenseTypesByFacility.get(row.facility_type as FacilityType);
        if (picked && picked.size > 0 && !picked.has(roleLicense)) continue;
      }
      (rolesByFacilityType[row.facility_type] ??= new Set<string>()).add(row.role_name);
    }

    const result: Record<string, string[]> = {};
    for (const [ft, set] of Object.entries(rolesByFacilityType)) {
      result[ft] = Array.from(set).sort();
    }
    return { success: true, rolesByFacilityType: result };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, rolesByFacilityType: {}, error: message };
  }
}

/**
 * Computes a preview of the PERSONAL (self-compliance) requirements the user
 * will own based on the titles they selected, across the sectors/license types
 * they are onboarding. This mirrors the personnel-rule gate (facility_type +
 * exact license + applicable_roles) without needing a facility row yet.
 */
export async function getPersonalRequirementsPreview(
  roleNames: string[],
  selections: Array<{
    facilityType: FacilityType;
    licenseType?: LicenseType | null;
    toggles?: readonly string[];
  }>
): Promise<
  Array<{
    id: string;
    requirement_name: string;
    required_document_type: string;
    severity: 'critical' | 'standard';
    frequency: string;
    facility_type: FacilityType;
  }>
> {
  if (!roleNames || roleNames.length === 0 || !selections || selections.length === 0) return [];
  const supabase = createAdminClient();

  const facilityTypes = Array.from(new Set(selections.map((s) => s.facilityType)));
  const licenseTypesByFacility = new Map<FacilityType, Set<string>>();
  const togglesByFacility = new Map<FacilityType, Set<string>>();
  for (const s of selections) {
    if (s.licenseType) {
      const set = licenseTypesByFacility.get(s.facilityType) ?? new Set<string>();
      set.add(s.licenseType);
      licenseTypesByFacility.set(s.facilityType, set);
    }
    if (s.toggles && s.toggles.length > 0) {
      const set = togglesByFacility.get(s.facilityType) ?? new Set<string>();
      for (const t of s.toggles) set.add(t);
      togglesByFacility.set(s.facilityType, set);
    }
  }

  const { data: rules, error } = await supabase
    .from('compliance_criteria')
    .select(
      'id, facility_type, requirement_name, required_document_type, severity, frequency, score_category, sub_classification, applicable_roles, applicable_license_types'
    )
    .in('facility_type', facilityTypes);

  if (error) {
    console.error('Error fetching personal requirements preview:', error);
    return [];
  }

  const wanted = new Set(roleNames.map((r) => r.trim().toLowerCase()));

  const matches = (rules ?? []).filter((r: Record<string, unknown>) => {
    if (r.score_category !== 'personnel') return false;

    // Exact-license gate against any license picked for this facility type.
    const allowedLicenses = normalizeApplicableLicenseTypes(r.applicable_license_types);
    if (allowedLicenses !== null) {
      const picked = licenseTypesByFacility.get(r.facility_type as FacilityType);
      const intersects =
        !picked || picked.size === 0 || allowedLicenses.some((lt) => picked.has(lt));
      if (!intersects) return false;
    }

    // Scope-toggle gate: a personnel rule pinned to a toggle (e.g. memory_care
    // dementia training) only applies when that toggle is active for the sector.
    const activeToggles = togglesByFacility.get(r.facility_type as FacilityType) ?? new Set<string>();
    if (!subClassificationApplies(r.sub_classification, activeToggles)) return false;

    // Role gate: a rule with no applicable_roles applies to all staff; otherwise
    // one of the user's selected titles must be listed.
    const applicableRoles = normalizeApplicableRoles(r.applicable_roles);
    if (applicableRoles === null) return true;
    return applicableRoles.some((role) => wanted.has(role.trim().toLowerCase()));
  });

  return matches.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    requirement_name: (r.requirement_name as string) ?? '',
    required_document_type: (r.required_document_type as string) ?? '',
    severity: ((r.severity as 'critical' | 'standard') ?? 'standard'),
    frequency: (r.frequency as string) ?? 'annual',
    facility_type: r.facility_type as FacilityType,
  }));
}
