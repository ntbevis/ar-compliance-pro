'use server';

import { createClient } from 'src/app/utils/supabase/server';
import { createAdminClient } from 'src/app/utils/supabase/admin';
import type { FacilityScopeToggles, FacilityType, LicenseType } from '@/lib/types';
import { FACILITY_TOGGLE_KEYS } from '@/lib/types';

export interface FacilityPayload {
  /** Client-side queue id, used to map self-compliance titles to the saved facility. */
  queueId?: string;
  name: string;
  type: FacilityType;
  licenseType: LicenseType;
  licenseNumber: string;
  capacity: number;
  toggles: Partial<FacilityScopeToggles>;
}

/**
 * The titles the logged-in user holds for themselves (self-compliance). These
 * become profile_roles (layer 1: UX/self-identification) AND a linked personnel
 * record + personnel_roles (layer 2: the rows the twin-score engine evaluates).
 */
export interface SelfCompliancePayload {
  roleNames: string[];
  /** Onboarding queue id of the facility where these titles apply (or null). */
  facilityRef: string | null;
}

/**
 * Persists the onboarding facilities into the user's *existing* organization.
 *
 * The organization and profile are created by the admin approval action
 * (admin.ts → approveRegistrationRequest). This action must NOT create a new
 * org — it simply links the facilities to the one already attached to the user's profile.
 *
 * It also updates the org name from whatever the user entered in Step 1.
 *
 * Idempotency guard: if the org already has facilities, returns a success signal
 * so the UI redirects to the dashboard rather than blocking the user.
 */
/**
 * Lightweight check used by the onboarding page on mount.
 * Returns true if the current user's org already has facilities (onboarding is complete).
 */
export async function isOnboardingComplete(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return false;

    const supabaseAdmin = createAdminClient();
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('org_id')
      .eq('id', session.user.id)
      .single();
    if (!profile?.org_id) return false;

    const { count } = await supabaseAdmin
      .from('facilities')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', profile.org_id)
      .eq('is_active', true);

    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function saveOnboardingData(
  orgName: string,
  facilities: FacilityPayload[],
  selfCompliance?: SelfCompliancePayload
) {
  const supabase = await createClient();
  const supabaseAdmin = createAdminClient();

  // 1. Verify active session
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) {
    return { success: false as const, error: 'No active session. Please sign in again.' };
  }
  const userId = session.user.id;

  // 2. Retrieve the existing org_id + name from the user's profile
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('org_id, full_name')
    .eq('id', userId)
    .single();

  if (profileError || !profile?.org_id) {
    console.error('❌ Profile lookup failed during onboarding:', profileError);
    return { success: false as const, error: 'Your account profile is not yet configured. Please contact support.' };
  }

  const orgId = profile.org_id;

  // 3. Idempotency guard — if facilities already exist for this org, skip insertion.
  //    Still mark onboarding_completed in case this user predates the column.
  const { count: existingCount } = await supabaseAdmin
    .from('facilities')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId);

  if (existingCount && existingCount > 0) {
    await supabaseAdmin
      .from('profiles')
      .update({ onboarding_completed: true })
      .eq('id', userId);
    return { success: true as const, orgId };
  }

  // 4. Optionally update the org name from what the user entered
  if (orgName.trim()) {
    await supabaseAdmin
      .from('organizations')
      .update({ name: orgName.trim() })
      .eq('id', orgId);
  }

  // 5. Insert facilities bound to the existing org. We keep input order so we
  //    can map each saved row back to its onboarding queue id for self-compliance.
  const facilitiesToInsert = facilities.map((f) => {
    const togglePayload: Record<string, boolean> = {};
    for (const key of FACILITY_TOGGLE_KEYS) {
      togglePayload[key] = Boolean(f.toggles[key]);
    }
    return {
      org_id: orgId,
      name: f.name,
      facility_type: f.type,
      license_type: f.licenseType,
      license_number: f.licenseNumber,
      capacity: f.capacity,
      compliance_score: 0,
      ...togglePayload,
    };
  });

  const { data: insertedFacilities, error: facError } = await supabaseAdmin
    .from('facilities')
    .insert(facilitiesToInsert)
    .select('id');

  if (facError || !insertedFacilities) {
    console.error('❌ Bulk facility insertion failed:', facError);
    return {
      success: false as const,
      error: 'Facilities could not be saved. Please try again or contact support.',
    };
  }

  // Map onboarding queue id → saved facility id (insert order is preserved).
  const facilityIdByQueueId = new Map<string, string>();
  facilities.forEach((f, idx) => {
    const saved = insertedFacilities[idx] as { id: string } | undefined;
    if (f.queueId && saved?.id) facilityIdByQueueId.set(f.queueId, saved.id);
  });

  // 6. Self-compliance: record the user's own titles (profile_roles) and a
  //    linked personnel record (+ personnel_roles) the twin-score engine scores.
  if (selfCompliance && selfCompliance.roleNames.length > 0) {
    try {
      await persistSelfCompliance({
        supabaseAdmin,
        userId,
        fullName: (profile.full_name as string | null) ?? 'Account Owner',
        roleNames: selfCompliance.roleNames,
        // Default to the first saved facility when no explicit ref was provided.
        facilityId:
          (selfCompliance.facilityRef
            ? facilityIdByQueueId.get(selfCompliance.facilityRef)
            : undefined) ??
          ((insertedFacilities[0] as { id: string } | undefined)?.id ?? null),
      });
    } catch (selfErr) {
      // Non-fatal: facilities are saved; surface a soft warning in logs only so
      // the user is not blocked from reaching the dashboard.
      console.error('⚠️ Self-compliance persistence failed (non-fatal):', selfErr);
    }
  }

  // Mark onboarding as complete now that all facilities are committed.
  await supabaseAdmin
    .from('profiles')
    .update({ onboarding_completed: true })
    .eq('id', userId);

  return { success: true as const, orgId };
}

/**
 * Resolves role names to regulatory_roles ids and writes the two self-compliance
 * layers. Service-role client is required (bypasses RLS).
 */
async function persistSelfCompliance(args: {
  supabaseAdmin: ReturnType<typeof createAdminClient>;
  userId: string;
  fullName: string;
  roleNames: string[];
  facilityId: string | null;
}) {
  const { supabaseAdmin, userId, fullName, roleNames, facilityId } = args;
  if (!facilityId) return;

  const distinctRoles = Array.from(
    new Set(roleNames.map((r) => r.trim()).filter((r) => r.length > 0))
  );
  if (distinctRoles.length === 0) return;

  // Resolve the facility's sector so profile_roles carries facility_type.
  const { data: facilityRow } = await supabaseAdmin
    .from('facilities')
    .select('facility_type')
    .eq('id', facilityId)
    .single();
  const facilityType = (facilityRow?.facility_type as string) ?? null;

  // Resolve canonical regulatory_role ids for the selected titles (prefer the
  // unscoped row when a name maps to several sub_classifications).
  const { data: roleRows } = await supabaseAdmin
    .from('regulatory_roles')
    .select('id, role_name, facility_type, sub_classification')
    .in('role_name', distinctRoles);

  const roleIdByName = new Map<string, string>();
  for (const row of (roleRows ?? []) as Array<{
    id: string;
    role_name: string;
    facility_type: string;
    sub_classification: string | null;
  }>) {
    if (facilityType && row.facility_type !== facilityType) continue;
    const existing = roleIdByName.get(row.role_name);
    // Prefer an unscoped (sub_classification IS NULL) mapping.
    if (!existing || row.sub_classification === null) {
      roleIdByName.set(row.role_name, row.id);
    }
  }

  // Layer 1 — profile_roles (UX/self-identification).
  const profileRoleRows = distinctRoles.map((roleName) => ({
    profile_id: userId,
    regulatory_role_id: roleIdByName.get(roleName) ?? null,
    facility_id: facilityId,
    role_name: roleName,
    facility_type: facilityType ?? 'nursing_home',
  }));
  await supabaseAdmin
    .from('profile_roles')
    .upsert(profileRoleRows, { onConflict: 'profile_id,role_name,facility_id' });

  // Layer 2 — one self personnel record carrying every title.
  const { data: existingSelf } = await supabaseAdmin
    .from('personnel')
    .select('id')
    .eq('profile_id', userId)
    .eq('facility_id', facilityId)
    .eq('is_self_record', true)
    .maybeSingle();

  let personnelId = (existingSelf as { id: number } | null)?.id ?? null;

  if (!personnelId) {
    const { data: newPersonnel, error: personnelError } = await supabaseAdmin
      .from('personnel')
      .insert({
        facility_id: facilityId,
        profile_id: userId,
        is_self_record: true,
        name: fullName,
        role: distinctRoles[0],
        status: 'active',
        clearance_status: 'pending',
        hire_date: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (personnelError) throw personnelError;
    personnelId = (newPersonnel as { id: number }).id;
  }

  // personnel_roles — the authoritative multi-title set.
  const personnelRoleRows = distinctRoles.map((roleName) => ({
    personnel_id: personnelId,
    role_name: roleName,
    regulatory_role_id: roleIdByName.get(roleName) ?? null,
  }));
  await supabaseAdmin
    .from('personnel_roles')
    .upsert(personnelRoleRows, { onConflict: 'personnel_id,role_name' });
}
