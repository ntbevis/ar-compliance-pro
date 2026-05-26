// src/app/actions/registration.ts
'use server';

import { createAdminClient } from 'src/app/utils/supabase/admin';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
const inviteRedirectTo = `${siteUrl}/auth/callback?next=${encodeURIComponent('/auth/reset-password?next=/onboarding')}`;

/**
 * Self-service owner registration.
 *
 * Single action that:
 *   1. Checks whether this email is already in the system (idempotent resend path).
 *   2. Logs the request in `registration_requests` for admin visibility.
 *   3. Creates the `organizations` record for the new company.
 *   4. Sends a Supabase Auth invite email so the owner can set their password.
 *   5. Creates the `profiles` row with role = 'owner', linked to the new org.
 *   6. Marks the request as 'approved' (no manual review step needed).
 *
 * On success the owner receives an email → clicks the link → lands on
 * /auth/reset-password → sets password → redirects to /onboarding.
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
    console.log('📝 Processing owner registration for:', formData.business_name);

    // ── 0. Idempotency check — detect existing registrations ─────────────────
    // If this email already has a profile, a previous registration completed.
    // Rather than creating duplicate orgs and failing at the invite step, we
    // re-send the invite only. inviteUserByEmail is safe to call again for
    // unconfirmed users — Supabase will issue a fresh invite link.
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingProfile) {
      console.log('🔄 Existing profile found — resending invite to:', email);
      const { data: resendData, error: resendError } = await supabase.auth.admin.inviteUserByEmail(
        email,
        { redirectTo: inviteRedirectTo }
      );

      if (resendError) {
        console.error('❌ Resend invite error:', resendError.message);
        const msg = resendError.message.toLowerCase();
        if (msg.includes('confirmed') || msg.includes('registered') || msg.includes('already')) {
          return {
            success: false,
            error: 'This email address already has an active account. Please sign in instead.',
          };
        }
        return {
          success: false,
          error: 'Failed to resend your invitation email. Please contact support.',
        };
      }

      console.log('✅ Invite resent to:', email, '| User ID:', resendData?.user?.id);
      return { success: true as const };
    }

    // ── 1. Log registration request ──────────────────────────────────────────
    const { data: request, error: requestError } = await supabase
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
      })
      .select('id')
      .single();

    if (requestError || !request) {
      console.error('❌ Error recording registration request:', requestError);
      return { success: false, error: requestError?.message ?? 'Failed to record your request.' };
    }

    // ── 2. Create organization ────────────────────────────────────────────────
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert([{ name: formData.business_name }])
      .select('id')
      .single();

    if (orgError || !org) {
      console.error('❌ Error creating organization:', orgError);
      return { success: false, error: 'Failed to provision your account. Please try again.' };
    }

    console.log('✅ Organization created:', org.id);

    // ── 3. Send auth invite email ─────────────────────────────────────────────
    const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
      email,
      {
        data: { business_name: formData.business_name, contact_name: fullName, org_id: org.id },
        redirectTo: inviteRedirectTo,
      }
    );

    if (inviteError || !inviteData?.user) {
      console.error('❌ Error sending invitation:', inviteError?.message);
      const msg = (inviteError?.message ?? '').toLowerCase();
      return {
        success: false,
        error:
          msg.includes('already') || msg.includes('registered') || msg.includes('confirmed')
            ? 'This email address is already registered. Please sign in instead.'
            : 'Failed to send your invitation email. Please try again.',
      };
    }

    const newUserId = inviteData.user.id;
    console.log('✅ Invitation sent to:', email, '| New user ID:', newUserId);

    // ── 4. Create owner profile linked to new org ─────────────────────────────
    const { error: profileError } = await supabase.from('profiles').insert([
      {
        id: newUserId,
        org_id: org.id,
        role: 'owner',
        account_status: 'active',
        email,
        full_name: fullName,
      },
    ]);

    if (profileError) {
      console.error('❌ Error creating owner profile:', profileError);
      return {
        success: false,
        error: 'Your account was created but profile setup failed. Please contact support.',
      };
    }

    console.log('✅ Owner profile created for:', newUserId);

    // ── 5. Mark request as auto-approved ─────────────────────────────────────
    await supabase
      .from('registration_requests')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', request.id);

    return { success: true as const };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    console.error('❌ Exception in submitRegistrationRequest:', error);
    return { success: false, error: message };
  }
}
