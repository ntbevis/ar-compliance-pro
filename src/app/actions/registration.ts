// src/app/actions/registration.ts
'use server';

import { createAdminClient } from 'src/app/utils/supabase/admin';

/**
 * Submits a new registration request to the database.
 * Inserts into registration_requests table with pending status.
 */
export async function submitRegistrationRequest(formData: {
  business_name: string;
  contact_name: string;
  email: string;
  phone: string;
  facility_type: 'childcare' | 'nursing_home';
  sub_classification: string;
  license_number: string;
  estimated_capacity: number;
}) {
  const supabase = createAdminClient();

  try {
    console.log('📝 Processing registration request for:', formData.business_name);

    // Insert registration request with pending status
    const { data, error } = await supabase
      .from('registration_requests')
      .insert({
        business_name: formData.business_name,
        contact_name: formData.contact_name,
        email: formData.email,
        phone: formData.phone,
        facility_type: formData.facility_type,
        sub_classification: formData.sub_classification,
        license_number: formData.license_number,
        estimated_capacity: formData.estimated_capacity,
        status: 'pending',
        submitted_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Error submitting registration request:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to submit registration request' 
      };
    }

    console.log('✅ Registration request submitted successfully:', data.id);
    return { 
      success: true, 
      message: 'Registration request submitted successfully',
      requestId: data.id
    };

  } catch (error: any) {
    console.error('❌ Exception in submitRegistrationRequest:', error);
    return { 
      success: false, 
      error: error.message || 'An unexpected error occurred' 
    };
  }
}
