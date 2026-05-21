// src/app/actions/admin.ts
'use server';

import { createAdminClient } from 'src/app/utils/supabase/admin';
import { createClient } from 'src/app/utils/supabase/server';

/**
 * Multi-Tenant Security Helper
 * Verifies authenticated user session and retrieves their organization context.
 * Enforces account status and throws authorization error if session is invalid or account is deactivated.
 */
async function getAuthenticatedUserContext() {
  const supabase = await createClient();
  
  // 1. Verify active session exists
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  
  if (sessionError || !session) {
    throw new Error('Unauthorized: No valid authentication session found');
  }
  
  const userId = session.user.id;
  
  // 2. Query profiles table to get user's verified org_id, role, and account_status
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('org_id, role, account_status')
    .eq('id', userId)
    .single();
  
  if (profileError || !profile) {
    throw new Error('Unauthorized: User profile not found or incomplete');
  }
  
  // MODIFIED GATE: Global platform administrators bypass local tenant organization checks
  if (profile.role !== 'admin' && !profile.org_id) {
    throw new Error('Unauthorized: User is not associated with any organization');
  }
  
  // 3. Enforce account status gate - block deactivated accounts
  if (profile.account_status === 'deactivated') {
    throw new Error('Access Denied: This account has been deactivated by your organization administrator.');
  }
  
  return {
    userId,
    orgId: profile.org_id || null, // Gracefully handle null for system admins
    role: profile.role,
    accountStatus: profile.account_status
  };
}

/**
 * Fetches all pending registration requests from the database.
 * SECURITY: Only accessible by users with 'admin' role.
 */
export async function getPendingRequests() {
  try {
    // 1. Authenticate and verify admin role
    const { role } = await getAuthenticatedUserContext();
    
    if (role !== 'admin') {
      throw new Error('Forbidden: Admin access required');
    }
    
    // 2. Query pending registration requests
    const supabase = createAdminClient();
    const { data: requests, error } = await supabase
      .from('registration_requests')
      .select('*')
      .eq('status', 'pending')
      .order('submitted_at', { ascending: true });
    
    if (error) {
      console.error('❌ Error fetching pending requests:', error);
      throw new Error('Failed to fetch pending registration requests');
    }
    
    return {
      success: true,
      requests: requests || []
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('❌ Exception in getPendingRequests:', error);
    return {
      success: false,
      error: message,
      requests: []
    };
  }
}

/**
 * Approves a registration request and performs full onboarding cycle:
 * 1. Creates organization
 * 2. Sends auth invitation email
 * 3. Creates user profile with owner role
 * 4. Updates request status to approved
 * * SECURITY: Only accessible by users with 'admin' role.
 */
export async function approveRegistrationRequest(requestId: string) {
  try {
    // 1. Authenticate and verify admin role
    const { role } = await getAuthenticatedUserContext();
    
    if (role !== 'admin') {
      throw new Error('Forbidden: Admin access required');
    }
    
    const supabase = createAdminClient();
    
    // 2. Fetch the specific registration request
    const { data: request, error: fetchError } = await supabase
      .from('registration_requests')
      .select('*')
      .eq('id', requestId)
      .single();
    
    if (fetchError || !request) {
      console.error('❌ Error fetching registration request:', fetchError);
      throw new Error('Registration request not found');
    }
    
    if (request.status !== 'pending') {
      throw new Error(`Request has already been ${request.status}`);
    }
    
    console.log('📝 Processing approval for:', request.business_name);
    
    // 3. Create organization
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert([{ name: request.business_name }])
      .select()
      .single();
    
    if (orgError || !org) {
      console.error('❌ Error creating organization:', orgError);
      throw new Error('Failed to create organization');
    }
    
    console.log('✅ Organization created:', org.id);
    
    // 4. Send auth invitation email using Supabase Admin API
    const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
      request.email,
      {
        data: {
          business_name: request.business_name,
          contact_name: request.contact_name,
          org_id: org.id
        },
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/onboarding`
      }
    );
    
    if (inviteError || !inviteData.user) {
      console.error('❌ Error sending invitation:', inviteError);
      throw new Error('Failed to send invitation email');
    }
    
    const newUserId = inviteData.user.id;
    console.log('✅ Invitation sent to:', request.email, '| User ID:', newUserId);
    
    // 5. Create user profile with owner role
    const { error: profileError } = await supabase
      .from('profiles')
      .insert([{
        id: newUserId,
        org_id: org.id,
        role: 'owner',
        account_status: 'active',
        email: request.email,
        full_name: request.contact_name
      }]);
    
    if (profileError) {
      console.error('❌ Error creating user profile:', profileError);
      throw new Error('Failed to create user profile');
    }
    
    console.log('✅ User profile created for:', newUserId);
    
    // 6. Update registration request status to approved
    const { error: updateError } = await supabase
      .from('registration_requests')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString()
      })
      .eq('id', requestId);
    
    if (updateError) {
      console.error('❌ Error updating request status:', updateError);
      throw new Error('Failed to update request status');
    }
    
    console.log('✅ Registration request approved:', requestId);
    
    return {
      success: true,
      message: `Successfully approved ${request.business_name} and sent invitation to ${request.email}`,
      orgId: org.id,
      userId: newUserId
    };
    
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('❌ Exception in approveRegistrationRequest:', error);
    return {
      success: false,
      error: message
    };
  }
}