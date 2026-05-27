// src/app/actions/registration.ts
'use server';

import { createAdminClient } from 'src/app/utils/supabase/admin';

/**
 * Public 'Request Access' form submission.
 *
 * Inserts a new row into `registration_requests` with status = 'pending'
 * and returns a confirmation message. No organization, profile, or invite
 * is created at this stage — that happens only after an admin approves the
 * request via approveRegistrationRequest() in admin.ts.
 */
export async function submitRegistrationRequest(formData: {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  business_name: string;
  number_of_locations: number;
}) {
  const supabase = createAdminClient();
  const fullName = `${formData.first_name} ${formData.last_name}`.trim();
  const email = formData.email.toLowerCase();

  try {
    console.log('📝 Received access request for:', formData.business_name);

    // Guard against duplicate pending submissions for the same email.
    const { data: existingRequest } = await supabase
      .from('registration_requests')
      .select('id, status')
      .eq('email', email)
      .in('status', ['pending', 'approved'])
      .maybeSingle();

    if (existingRequest) {
      if (existingRequest.status === 'approved') {
        return {
          success: false,
          error: 'This email address already has an active account. Please sign in instead.',
        };
      }
      return {
        success: true as const,
        message: 'Your request is already under review. We will be in touch shortly.',
      };
    }

    const { error: requestError } = await supabase
      .from('registration_requests')
      .insert({
        first_name: formData.first_name,
        last_name: formData.last_name,
        contact_name: fullName,
        email,
        phone: formData.phone,
        business_name: formData.business_name,
        number_of_locations: formData.number_of_locations,
        status: 'pending',
        submitted_at: new Date().toISOString(),
      });

    if (requestError) {
      console.error('❌ Error recording registration request:', requestError);
      return { success: false, error: requestError.message ?? 'Failed to record your request.' };
    }

    console.log('✅ Access request recorded for:', email);

    return {
      success: true as const,
      message:
        'Thank you! Your request has been received and is under review. ' +
        'We will send you an invitation email once your account has been approved.',
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    console.error('❌ Exception in submitRegistrationRequest:', error);
    return { success: false, error: message };
  }
}
