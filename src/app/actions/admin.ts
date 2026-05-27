// src/app/actions/admin.ts
'use server';

import { createAdminClient } from 'src/app/utils/supabase/admin';
import { createClient } from 'src/app/utils/supabase/server';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';

// Mirror the same priority chain used in registration.ts so the invite link
// always points at the real production domain even when NEXT_PUBLIC_SITE_URL
// is absent from the environment.
const siteUrl =
  process.env.SITE_URL ??
  (process.env.NODE_ENV === 'production'
    ? 'https://app.complianceguardpro.io'
    : 'http://localhost:3000');

const inviteRedirectTo = `${siteUrl}/auth/callback?next=/auth/reset-password`;

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
 * Approves a pending registration request and performs the full onboarding cycle:
 * 1. Fetches the request details.
 * 2. Creates the Organization record.
 * 3. Creates an initial Facility record linked to the organization.
 * 4. Sends the Supabase Auth invite email (redirectTo → /auth/reset-password).
 * 5. Creates the owner Profile linked to the new org.
 * 6. Marks the request as 'approved'.
 *
 * SECURITY: Only accessible by users with 'admin' role.
 */
export async function approveRegistrationRequest(requestId: string) {
  try {
    const { role } = await getAuthenticatedUserContext();

    if (role !== 'admin') {
      throw new Error('Forbidden: Admin access required');
    }

    const supabase = createAdminClient();

    // ── 1. Fetch the pending request ─────────────────────────────────────────
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

    // ── 2. Create organization ────────────────────────────────────────────────
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert([{ name: request.business_name }])
      .select('id')
      .single();

    if (orgError || !org) {
      console.error('❌ Error creating organization:', orgError);
      throw new Error('Failed to create organization');
    }

    console.log('✅ Organization created:', org.id);

    // ── 3. Create initial facility ────────────────────────────────────────────
    const { error: facilityError } = await supabase
      .from('facilities')
      .insert([{
        org_id: org.id,
        name: request.business_name,
      }]);

    if (facilityError) {
      console.error('❌ Error creating initial facility:', facilityError);
      throw new Error('Failed to create initial facility');
    }

    console.log('✅ Initial facility created for org:', org.id);

    // ── 4. Send auth invitation email ─────────────────────────────────────────
    const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
      request.email,
      {
        data: {
          business_name: request.business_name,
          contact_name: request.contact_name,
          org_id: org.id,
        },
        redirectTo: inviteRedirectTo,
      }
    );

    if (inviteError || !inviteData.user) {
      console.error('❌ Error sending invitation:', inviteError);
      throw new Error('Failed to send invitation email');
    }

    const newUserId = inviteData.user.id;
    console.log('✅ Invitation sent to:', request.email, '| User ID:', newUserId);

    // ── 5. Create owner profile linked to org ─────────────────────────────────
    const { error: profileError } = await supabase.from('profiles').insert([{
      id: newUserId,
      org_id: org.id,
      role: 'owner',
      account_status: 'active',
      email: request.email,
      full_name: request.contact_name,
    }]);

    if (profileError) {
      console.error('❌ Error creating user profile:', profileError);
      throw new Error('Failed to create user profile');
    }

    console.log('✅ Owner profile created for:', newUserId);

    // ── 6. Mark request as approved ───────────────────────────────────────────
    const { error: updateError } = await supabase
      .from('registration_requests')
      .update({ status: 'approved' })
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
      userId: newUserId,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('❌ Exception in approveRegistrationRequest:', error);
    return { success: false, error: message };
  }
}

/**
 * Rejects a pending registration request.
 * Marks it as 'rejected' in the database — no invite is sent.
 *
 * SECURITY: Only accessible by users with 'admin' role.
 */
export async function denyRegistrationRequest(requestId: string) {
  try {
    const { role } = await getAuthenticatedUserContext();
    if (role !== 'admin') throw new Error('Forbidden: Admin access required');

    const supabase = createAdminClient();

    const { data: request, error: fetchError } = await supabase
      .from('registration_requests')
      .select('business_name, status')
      .eq('id', requestId)
      .single();

    if (fetchError || !request) throw new Error('Registration request not found');
    if (request.status !== 'pending') throw new Error(`Request is already ${request.status}`);

    const { error: updateError } = await supabase
      .from('registration_requests')
      .update({ status: 'rejected' })
      .eq('id', requestId);

    if (updateError) throw new Error(updateError.message);

    console.log('✅ Registration request rejected:', requestId);

    return {
      success: true,
      message: `Registration request from ${request.business_name} has been rejected.`,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('❌ Exception in denyRegistrationRequest:', error);
    return { success: false, error: message };
  }
}

// =============================================================================
// ADMIN DOCUMENT REVIEW QUEUE
// =============================================================================

export interface PendingDocument {
  id: string;
  name: string;
  document_type: string;
  status: string;
  created_at: string;
  file_url: string | null;
  metadata: Record<string, unknown> | null;
  facility_id: string;
  facility_name: string;
  org_name: string;
}

/**
 * Returns all facility_documents with status = 'pending', joined with
 * the facility name and organization name.
 * SECURITY: Admin only.
 */
export async function getPendingDocuments(): Promise<
  { success: true; documents: PendingDocument[] } | { success: false; error: string }
> {
  try {
    const { role } = await getAuthenticatedUserContext();
    if (role !== 'admin') throw new Error('Forbidden: Admin access required');

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('facility_documents')
      .select(`
        id,
        name,
        document_type,
        status,
        created_at,
        file_url,
        metadata,
        facility_id,
        facilities (
          name,
          organizations (
            name
          )
        )
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('❌ Error fetching pending documents:', error);
      throw new Error('Failed to fetch pending documents');
    }

    const documents: PendingDocument[] = (data ?? []).map((row) => {
      // Pull the joined value out as unknown to avoid strict-mode nested cast rejections.
      // Supabase can return the one-to-one join as an object or a single-element array
      // depending on the schema relationship; handle both shapes safely.
      const rawFacility: unknown = row.facilities;
      const facilityObj: Record<string, unknown> | null =
        rawFacility !== null && typeof rawFacility === 'object' && !Array.isArray(rawFacility)
          ? (rawFacility as Record<string, unknown>)
          : Array.isArray(rawFacility) && rawFacility.length > 0 &&
            typeof rawFacility[0] === 'object' && rawFacility[0] !== null
          ? (rawFacility[0] as Record<string, unknown>)
          : null;

      const facilityName =
        typeof facilityObj?.name === 'string' ? facilityObj.name : 'Unknown Facility';

      const rawOrg: unknown = facilityObj?.organizations;
      const orgObj: Record<string, unknown> | null =
        rawOrg !== null && typeof rawOrg === 'object' && !Array.isArray(rawOrg)
          ? (rawOrg as Record<string, unknown>)
          : Array.isArray(rawOrg) && rawOrg.length > 0 &&
            typeof rawOrg[0] === 'object' && rawOrg[0] !== null
          ? (rawOrg[0] as Record<string, unknown>)
          : null;

      const orgName =
        typeof orgObj?.name === 'string' ? orgObj.name : 'Unknown Organization';

      return {
        id: row.id as string,
        name: (row.name as string | null) ?? 'Unnamed Document',
        document_type: (row.document_type as string | null) ?? '',
        status: (row.status as string | null) ?? 'pending',
        created_at: (row.created_at as string | null) ?? '',
        file_url: (row.file_url as string | null) ?? null,
        metadata: (row.metadata as Record<string, unknown> | null) ?? null,
        facility_id: row.facility_id as string,
        facility_name: facilityName,
        org_name: orgName,
      };
    });

    return { success: true, documents };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('❌ Exception in getPendingDocuments:', error);
    return { success: false, error: message };
  }
}

/**
 * Returns a short-lived signed URL for a document without org scoping,
 * for use by platform admins in the review queue.
 * SECURITY: Admin only.
 */
export async function getAdminDocumentUrl(
  documentId: string,
  facilityId: string
): Promise<
  | { success: true; url: string | null; metadata: Record<string, unknown> | null }
  | { success: false; error: string }
> {
  try {
    const { role } = await getAuthenticatedUserContext();
    if (role !== 'admin') throw new Error('Forbidden: Admin access required');

    const supabase = createAdminClient();

    const { data: doc, error: docError } = await supabase
      .from('facility_documents')
      .select('id, file_url, metadata')
      .eq('id', documentId)
      .eq('facility_id', facilityId)
      .single();

    if (docError || !doc) {
      return { success: false, error: 'Document not found' };
    }

    const fileUrl = typeof doc.file_url === 'string' ? doc.file_url : null;
    const metadata = (doc.metadata as Record<string, unknown> | null) ?? null;

    if (!fileUrl) {
      return { success: true, url: null, metadata };
    }

    const { data: signedData, error: signedError } = await supabase.storage
      .from('facility-documents')
      .createSignedUrl(fileUrl, 300);

    if (signedError || !signedData?.signedUrl) {
      console.error('❌ Storage signed URL generation failed:', signedError);
      return { success: false, error: 'Failed to generate secure document URL' };
    }

    return { success: true, url: signedData.signedUrl, metadata };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('❌ Exception in getAdminDocumentUrl:', error);
    return { success: false, error: message };
  }
}

/**
 * Approves a pending document: updates status to 'approved' and writes
 * an audit log entry. The facility's compliance score will be recalculated
 * on the next dashboard load.
 * SECURITY: Admin only.
 */
export async function approveDocument(
  documentId: string,
  facilityId: string
): Promise<{ success: true; message: string } | { success: false; error: string }> {
  try {
    const { userId, role } = await getAuthenticatedUserContext();
    if (role !== 'admin') throw new Error('Forbidden: Admin access required');

    const supabase = createAdminClient();

    const { data: doc, error: fetchError } = await supabase
      .from('facility_documents')
      .select('id, name, document_type, status')
      .eq('id', documentId)
      .eq('facility_id', facilityId)
      .single();

    if (fetchError || !doc) throw new Error('Document not found');
    if (doc.status !== 'pending') throw new Error(`Document is already ${doc.status}`);

    const { error: updateError } = await supabase
      .from('facility_documents')
      .update({ status: 'approved' })
      .eq('id', documentId);

    if (updateError) throw new Error(updateError.message);

    await writeAdminAuditLog({
      supabase,
      facilityId,
      userId,
      actionType: 'document_approved',
      metadata: {
        document_id: documentId,
        document_name: doc.name,
        document_type: doc.document_type,
      },
    });

    revalidatePath('/dashboard');
    revalidatePath('/admin/review-queue');

    return { success: true, message: `Document "${doc.name}" has been approved.` };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('❌ Exception in approveDocument:', error);
    return { success: false, error: message };
  }
}

/**
 * Rejects a pending document: updates status to 'rejected', stores the
 * rejection reason in metadata, and writes an audit log entry.
 * SECURITY: Admin only.
 */
export async function rejectDocument(
  documentId: string,
  facilityId: string,
  rejectionReason: string
): Promise<{ success: true; message: string } | { success: false; error: string }> {
  try {
    const { userId, role } = await getAuthenticatedUserContext();
    if (role !== 'admin') throw new Error('Forbidden: Admin access required');

    if (!rejectionReason.trim()) throw new Error('A rejection reason is required');

    const supabase = createAdminClient();

    const { data: doc, error: fetchError } = await supabase
      .from('facility_documents')
      .select('id, name, document_type, status, metadata')
      .eq('id', documentId)
      .eq('facility_id', facilityId)
      .single();

    if (fetchError || !doc) throw new Error('Document not found');
    if (doc.status !== 'pending') throw new Error(`Document is already ${doc.status}`);

    const existingMetadata = (doc.metadata as Record<string, unknown> | null) ?? {};
    const updatedMetadata = {
      ...existingMetadata,
      rejection_reason: rejectionReason.trim(),
      rejected_at: new Date().toISOString(),
      rejected_by: userId,
    };

    const { error: updateError } = await supabase
      .from('facility_documents')
      .update({ status: 'rejected', metadata: updatedMetadata })
      .eq('id', documentId);

    if (updateError) throw new Error(updateError.message);

    await writeAdminAuditLog({
      supabase,
      facilityId,
      userId,
      actionType: 'document_rejected',
      metadata: {
        document_id: documentId,
        document_name: doc.name,
        document_type: doc.document_type,
        rejection_reason: rejectionReason.trim(),
      },
    });

    revalidatePath('/dashboard');
    revalidatePath('/admin/review-queue');

    return { success: true, message: `Document "${doc.name}" has been rejected.` };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('❌ Exception in rejectDocument:', error);
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type AdminAuditActionType = 'document_approved' | 'document_rejected';

async function writeAdminAuditLog(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  facilityId: string;
  userId: string;
  actionType: AdminAuditActionType;
  metadata: Record<string, unknown>;
}) {
  const headersList = await headers();
  const ipAddress =
    headersList.get('x-forwarded-for') ?? headersList.get('x-real-ip') ?? 'unknown';

  const { data: profile } = await params.supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', params.userId)
    .single();

  const { error } = await params.supabase.from('audit_logs').insert({
    facility_id: params.facilityId,
    user_id: params.userId,
    action_type: params.actionType,
    ip_address: ipAddress,
    metadata: {
      ...params.metadata,
      user_name: profile?.full_name ?? 'Admin',
      user_role: profile?.role ?? 'admin',
    },
  });

  if (error) {
    console.error(`❌ Failed to create admin audit log (${params.actionType}):`, error);
  }
}