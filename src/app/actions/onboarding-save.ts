'use server';

import { createClient } from 'src/app/utils/supabase/server';
import { createAdminClient } from 'src/app/utils/supabase/admin';
import type { FacilityScopeToggles, FacilityType } from '@/lib/types';
import { FACILITY_TOGGLE_KEYS } from '@/lib/types';

export interface FacilityPayload {
  name: string;
  type: FacilityType;
  licenseNumber: string;
  capacity: number;
  toggles: Partial<FacilityScopeToggles>;
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
      .eq('org_id', profile.org_id);

    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function saveOnboardingData(orgName: string, facilities: FacilityPayload[]) {
  const supabase = await createClient();
  const supabaseAdmin = createAdminClient();

  // 1. Verify active session
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) {
    return { success: false as const, error: 'No active session. Please sign in again.' };
  }

  // 2. Retrieve the existing org_id from the user's profile
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('org_id')
    .eq('id', session.user.id)
    .single();

  if (profileError || !profile?.org_id) {
    console.error('❌ Profile lookup failed during onboarding:', profileError);
    return { success: false as const, error: 'Your account profile is not yet configured. Please contact support.' };
  }

  const orgId = profile.org_id;

  // 3. Idempotency guard — if facilities already exist for this org, skip insertion
  const { count: existingCount } = await supabaseAdmin
    .from('facilities')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId);

  if (existingCount && existingCount > 0) {
    return { success: true as const, orgId };
  }

  // 4. Optionally update the org name from what the user entered
  if (orgName.trim()) {
    await supabaseAdmin
      .from('organizations')
      .update({ name: orgName.trim() })
      .eq('id', orgId);
  }

  // 5. Insert facilities bound to the existing org
  const facilitiesToInsert = facilities.map((f) => {
    const togglePayload: Record<string, boolean> = {};
    for (const key of FACILITY_TOGGLE_KEYS) {
      togglePayload[key] = Boolean(f.toggles[key]);
    }
    return {
      org_id: orgId,
      name: f.name,
      facility_type: f.type,
      license_number: f.licenseNumber,
      capacity: f.capacity,
      compliance_score: 0,
      ...togglePayload,
    };
  });

  const { error: facError } = await supabaseAdmin.from('facilities').insert(facilitiesToInsert);

  if (facError) {
    console.error('❌ Bulk facility insertion failed:', facError);
    return {
      success: false as const,
      error: 'Facilities could not be saved. Please try again or contact support.',
    };
  }

  return { success: true as const, orgId };
}
