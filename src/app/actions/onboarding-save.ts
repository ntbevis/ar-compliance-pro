'use server';

import { createClient } from 'src/app/utils/supabase/server';
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
 * Persists the corporate hub + queued facilities, including their boolean scope toggles.
 * We deliberately do NOT depend on the legacy `sub_classification` text column anymore.
 */
export async function saveOnboardingData(orgName: string, facilities: FacilityPayload[]) {
  const supabase = await createClient();

  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert([{ name: orgName }])
    .select()
    .single();

  if (orgError || !org) {
    console.error('❌ Org Creation Error:', orgError);
    return { success: false as const, error: 'Failed to establish corporate hub.' };
  }

  const facilitiesToInsert = facilities.map((f) => {
    const togglePayload: Record<string, boolean> = {};
    for (const key of FACILITY_TOGGLE_KEYS) {
      togglePayload[key] = Boolean(f.toggles[key]);
    }
    return {
      org_id: org.id,
      name: f.name,
      facility_type: f.type,
      license_number: f.licenseNumber,
      capacity: f.capacity,
      compliance_score: 0,
      ...togglePayload,
    };
  });

  const { error: facError } = await supabase.from('facilities').insert(facilitiesToInsert);

  if (facError) {
    console.error('❌ Bulk Facility Insertion Failure:', facError);
    return {
      success: false as const,
      error: 'Corporate hub established, but location registries failed to bind.',
    };
  }

  return { success: true as const, orgId: org.id };
}
