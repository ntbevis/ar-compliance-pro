'use server';

import { createClient } from 'src/app/utils/supabase/server';

interface FacilityPayload {
  name: string;
  type: 'childcare' | 'nursing_home';
  licenseNumber: string;
  subClassification: string;
  capacity: number;
}

export async function saveOnboardingData(orgName: string, facilities: FacilityPayload[]) {
  const supabase = await createClient();

  // 1. Create the Corporate Hub Organization
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert([{ name: orgName }])
    .select()
    .single();

  if (orgError) {
    console.error('❌ Org Creation Error:', orgError);
    return { success: false, error: 'Failed to establish corporate hub.' };
  }

  // 2. Map payload into the strict database columns
  const facilitiesToInsert = facilities.map(f => ({
    org_id: org.id,
    name: f.name,
    facility_type: f.type,
    sub_classification: f.subClassification, // e.g. "Licensed Child Care Center" vs "Skilled Nursing"
    license_number: f.licenseNumber,         // Validated tracking alphanumeric code
    capacity: f.capacity,                     // Numeric ceiling used for automated staffing ratios
    compliance_score: 0                       // Starts at zero baseline until audited
  }));

  // 3. Multi-row insertion execution block
  const { error: facError } = await supabase
    .from('facilities')
    .insert(facilitiesToInsert);

  if (facError) {
    console.error('❌ Bulk Facility Insertion Failure:', facError);
    return { success: false, error: 'Corporate hub established, but location registries failed to bind.' };
  }

  return { success: true, orgId: org.id };
}