'use server';

import { createClient } from 'src/app/utils/supabase/server';
import type { FacilityType } from '@/lib/types';

/**
 * Returns the headline compliance criteria for a facility type. Used in the onboarding
 * preview to show prospective customers what will be tracked. No sub-classification
 * filtering is applied — that happens later in the dashboard once toggles are set.
 */
export async function getFacilityRequirements(facilityType: FacilityType) {
  const supabase = await createClient();

  const { data: requirements, error } = await supabase
    .from('compliance_criteria')
    .select('id, requirement_name, required_document_type, severity, frequency, score_category')
    .eq('facility_type', facilityType)
    .order('severity', { ascending: false });

  if (error) {
    console.error('Error fetching requirements:', error);
    return [];
  }
  return requirements ?? [];
}
