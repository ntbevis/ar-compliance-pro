'use server';

import { createClient } from 'src/app/utils/supabase/server';

/**
 * Fetches the specific compliance checklist for a facility 
 * based on its type (childcare vs nursing_home).
 */
export async function getFacilityRequirements(facilityType: string) {
  const supabase = await createClient();

  const { data: requirements, error } = await supabase
    .from('compliance_criteria')
    .select('*')
    .eq('facility_type', facilityType)
    .order('severity', { ascending: false }); // Show 'critical' first

  if (error) {
    console.error('Error fetching requirements:', error);
    return [];
  }

  return requirements;
}