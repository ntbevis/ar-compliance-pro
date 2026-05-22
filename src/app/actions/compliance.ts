// src/app/actions/compliance.ts
'use server';

import { createAdminClient } from 'src/app/utils/supabase/admin';
import { createClient } from 'src/app/utils/supabase/server';
import { getRegulatoryStatus } from '@/lib/reg-monitor';
import { createHash } from 'crypto';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import type { FacilityScopeToggles, FacilityType, IdentifiedGap } from '@/lib/types';
import { FACILITY_TOGGLE_KEYS } from '@/lib/types';

// =============================================================================
// AUTH HELPERS
// =============================================================================

async function getAuthenticatedUserContext() {
  const supabase = await createClient();
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    throw new Error('Unauthorized: No valid authentication session found');
  }

  const userId = session.user.id;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('org_id, role, account_status')
    .eq('id', userId)
    .single();

  if (profileError || !profile) {
    throw new Error('Unauthorized: User profile not found or incomplete');
  }

  if (profile.role !== 'admin' && !profile.org_id) {
    throw new Error('Unauthorized: User is not associated with any organization');
  }

  if (profile.account_status === 'deactivated') {
    throw new Error('Access Denied: This account has been deactivated.');
  }

  return {
    userId,
    orgId: profile.org_id ?? null,
    role: profile.role as string | null,
    accountStatus: profile.account_status as string | null,
  };
}

type AuditActionType =
  | 'document_upload'
  | 'digital_attestation'
  | 'document_deletion'
  | 'enrollment_update'
  | 'bulk_attestation'
  | 'blueprints_attestation'
  | 'facility_settings_update'
  | 'facility_archived';

async function createAuditLog(params: {
  facilityId: string;
  userId: string;
  actionType: AuditActionType;
  fileHash?: string;
  metadata: Record<string, unknown>;
}) {
  const supabase = createAdminClient();
  const headersList = await headers();
  const ipAddress =
    headersList.get('x-forwarded-for') ?? headersList.get('x-real-ip') ?? 'unknown';

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', params.userId)
    .single();

  const userName = profile?.full_name ?? 'Unknown User';
  const userRole = profile?.role ?? 'unknown';

  const { error } = await supabase.from('audit_logs').insert({
    facility_id: params.facilityId,
    user_id: params.userId,
    action_type: params.actionType,
    ip_address: ipAddress,
    file_hash: params.fileHash ?? null,
    metadata: {
      ...params.metadata,
      user_name: userName,
      user_role: userRole,
    },
  });

  if (error) {
    console.error('❌ Failed to create audit log:', error);
  } else {
    console.log(
      `✅ Audit log: ${params.actionType} by ${userName} (${userRole}) for facility ${params.facilityId}`
    );
  }
}

// =============================================================================
// COMPLIANCE / DASHBOARD DATA
// =============================================================================

/**
 * Returns the twin-score payload for the Executive Overview.
 */
export async function getFacilityComplianceData(facilityId: string) {
  try {
    const { orgId } = await getAuthenticatedUserContext();
    const supabase = createAdminClient();

    const { data: facility, error: facilityError } = await supabase
      .from('facilities')
      .select('id, org_id')
      .eq('id', facilityId)
      .eq('org_id', orgId)
      .single();

    if (facilityError || !facility) {
      throw new Error('Unauthorized: Facility not found or does not belong to your organization');
    }

    const status = await getRegulatoryStatus(facilityId);

    return {
      facilityReadinessScore: status.facilityReadinessScore,
      personnelReadinessScore: status.personnelReadinessScore,
      gaps: status.identifiedGaps,
      totalPersonnel: status.staffCount,
      capacity: status.capacity,
      activeEnrollment: status.activeEnrollment,
      enrollmentUpdatedAt: status.enrollmentUpdatedAt,
    };
  } catch (error) {
    console.error('❌ Error in getFacilityComplianceData:', error);
    return {
      facilityReadinessScore: 0,
      personnelReadinessScore: 0,
      gaps: [] as IdentifiedGap[],
      totalPersonnel: 0,
      capacity: null,
      activeEnrollment: null,
      enrollmentUpdatedAt: null,
    };
  }
}

// =============================================================================
// DOCUMENT UPLOAD (no more AI ingestion — directly persist + log)
// =============================================================================

/**
 * Persists a manual document upload, records the audit log, and marks it as approved.
 * The user (operator) is the source of truth — no AI verification is performed.
 */
export async function recordDocumentUpload(params: {
  facilityId: string;
  documentId: string;
  documentType: string;
  fileName: string;
  fileSize: number;
  fileHash: string;
  userAttestation: boolean;
  personnelId?: string;
}) {
  try {
    const { userId, orgId } = await getAuthenticatedUserContext();
    const supabase = createAdminClient();

    const { data: facility, error: facilityError } = await supabase
      .from('facilities')
      .select('id, org_id')
      .eq('id', params.facilityId)
      .eq('org_id', orgId)
      .single();

    if (facilityError || !facility) {
      throw new Error('Unauthorized: Facility not found or does not belong to your organization');
    }

    const auditTimestamp = new Date().toISOString();
    const metadata: Record<string, unknown> = {
      auditedAt: auditTimestamp,
      uploaded_by: userId,
      user_attestation: params.userAttestation,
    };
    if (params.personnelId) {
      metadata.personnel_id = params.personnelId;
    }

    const { error: updateError } = await supabase
      .from('facility_documents')
      .update({
        status: 'approved',
        document_type: params.documentType,
        metadata,
      })
      .eq('id', params.documentId);

    if (updateError) throw updateError;

    const auditMetadata: Record<string, unknown> = {
      filename: params.fileName,
      document_id: params.documentId,
      document_type: params.documentType,
      file_size: params.fileSize,
      user_attestation: params.userAttestation,
    };
    if (params.personnelId) {
      auditMetadata.personnel_id = params.personnelId;
    }

    await createAuditLog({
      facilityId: params.facilityId,
      userId,
      actionType: 'document_upload',
      fileHash: params.fileHash,
      metadata: auditMetadata,
    });

    revalidatePath('/dashboard');
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ recordDocumentUpload failure:', message);
    return { success: false, error: message };
  }
}

/**
 * Compute a stable SHA-256 from raw file bytes — used by the upload flow.
 */
export async function hashFileBuffer(bufferBase64: string): Promise<string> {
  const buffer = Buffer.from(bufferBase64, 'base64');
  return createHash('sha256').update(buffer).digest('hex');
}

// =============================================================================
// DIGITAL ATTESTATIONS
// =============================================================================

export async function signAttestation(
  facilityId: string,
  requirementId: string,
  userAttestation: boolean = false,
  personnelId?: string
) {
  try {
    const { userId, orgId } = await getAuthenticatedUserContext();
    const supabase = createAdminClient();

    const { data: facility, error: facilityError } = await supabase
      .from('facilities')
      .select('id, org_id, name')
      .eq('id', facilityId)
      .eq('org_id', orgId)
      .single();
    if (facilityError || !facility) {
      throw new Error('Unauthorized: Facility not found or does not belong to your organization');
    }

    const { data: requirement, error: reqError } = await supabase
      .from('compliance_criteria')
      .select('requirement_name, required_document_type, frequency')
      .eq('id', requirementId)
      .single();
    if (reqError || !requirement) {
      throw new Error('Requirement not found');
    }

    const attestationDate = new Date().toISOString();
    const attestationMetadata: Record<string, unknown> = {
      attestation_type: 'digital_attestation',
      signed_at: attestationDate,
      requirement_id: requirementId,
      requirement_name: requirement.requirement_name,
      frequency: requirement.frequency,
    };
    if (personnelId) {
      attestationMetadata.personnel_id = personnelId;
    }

    const { data: attestation, error: insertError } = await supabase
      .from('facility_documents')
      .insert({
        facility_id: facilityId,
        name: `${requirement.requirement_name} - Digital Attestation`,
        document_type: requirement.required_document_type,
        status: 'approved',
        file_url: null,
        metadata: attestationMetadata,
      })
      .select()
      .single();

    if (insertError) {
      console.error('❌ Error creating attestation:', insertError);
      return { success: false, error: 'Failed to create digital attestation' };
    }

    const auditMeta: Record<string, unknown> = {
      requirement_id: requirementId,
      requirement_name: requirement.requirement_name,
      frequency: requirement.frequency,
      attestation_id: attestation.id,
      user_attestation: userAttestation,
    };
    if (personnelId) {
      auditMeta.personnel_id = personnelId;
    }

    await createAuditLog({
      facilityId,
      userId,
      actionType: 'digital_attestation',
      metadata: auditMeta,
    });

    revalidatePath('/dashboard');
    return {
      success: true,
      attestation,
      message: `Successfully signed attestation for ${requirement.requirement_name}`,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Error signing attestation:', message);
    return { success: false, error: message };
  }
}

export async function markNotApplicable(
  facilityId: string,
  requirementId: string,
  reason: string,
  userAttestation: boolean = false,
  personnelId?: string
) {
  try {
    const { userId, orgId } = await getAuthenticatedUserContext();
    const supabase = createAdminClient();

    const { data: facility, error: facilityError } = await supabase
      .from('facilities')
      .select('id, org_id')
      .eq('id', facilityId)
      .eq('org_id', orgId)
      .single();
    if (facilityError || !facility) {
      throw new Error('Unauthorized: Facility not found or does not belong to your organization');
    }

    const { data: requirement, error: reqError } = await supabase
      .from('compliance_criteria')
      .select('requirement_name, required_document_type')
      .eq('id', requirementId)
      .single();
    if (reqError || !requirement) {
      throw new Error('Requirement not found');
    }

    const naDate = new Date().toISOString();
    const naMetadata: Record<string, unknown> = {
      is_not_applicable: true,
      marked_at: naDate,
      requirement_id: requirementId,
      requirement_name: requirement.requirement_name,
      reason,
    };
    if (personnelId) {
      naMetadata.personnel_id = personnelId;
    }

    const { data: naRecord, error: insertError } = await supabase
      .from('facility_documents')
      .insert({
        facility_id: facilityId,
        name: `${requirement.requirement_name} - Marked N/A`,
        document_type: requirement.required_document_type,
        status: 'approved',
        file_url: null,
        metadata: naMetadata,
      })
      .select()
      .single();

    if (insertError) {
      console.error('❌ Error marking N/A:', insertError);
      return { success: false, error: 'Failed to mark requirement as N/A' };
    }

    const naAuditMeta: Record<string, unknown> = {
      requirement_id: requirementId,
      requirement_name: requirement.requirement_name,
      na_record_id: naRecord.id,
      is_not_applicable: true,
      reason,
      user_attestation: userAttestation,
    };
    if (personnelId) {
      naAuditMeta.personnel_id = personnelId;
    }

    await createAuditLog({
      facilityId,
      userId,
      actionType: 'digital_attestation',
      metadata: naAuditMeta,
    });

    revalidatePath('/dashboard');
    return {
      success: true,
      naRecord,
      message: `Successfully marked ${requirement.requirement_name} as Not Applicable`,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ markNotApplicable failure:', message);
    return { success: false, error: message };
  }
}

/**
 * Owner/Director clicks the "Attest Daily Guidelines Met" button on the Operational
 * Blueprints page. Logs a timestamped entry in `audit_logs`.
 */
export async function attestDailyBlueprints(facilityId: string, comment: string | null = null) {
  try {
    const { userId, orgId } = await getAuthenticatedUserContext();
    const supabase = createAdminClient();

    const { data: facility, error: facilityError } = await supabase
      .from('facilities')
      .select('id, org_id, name')
      .eq('id', facilityId)
      .eq('org_id', orgId)
      .single();
    if (facilityError || !facility) {
      throw new Error('Unauthorized: Facility not found or does not belong to your organization');
    }

    await createAuditLog({
      facilityId,
      userId,
      actionType: 'blueprints_attestation',
      metadata: {
        attested_at: new Date().toISOString(),
        comment: comment ?? null,
        attestation_text:
          'I certify that the operational blueprints and daily guidelines have been physically verified today.',
      },
    });

    revalidatePath('/dashboard');
    return { success: true, message: "Today's operational attestation logged." };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ attestDailyBlueprints failure:', message);
    return { success: false, error: message };
  }
}

// =============================================================================
// PERSONNEL VAULT
// =============================================================================

export async function getPersonnelData(facilityId: string) {
  try {
    const { orgId } = await getAuthenticatedUserContext();
    const supabase = createAdminClient();

    const { data: facility } = await supabase
      .from('facilities')
      .select('id, org_id')
      .eq('id', facilityId)
      .eq('org_id', orgId)
      .single();
    if (!facility) return [];

    const { data, error } = await supabase
      .from('personnel')
      .select('id, name, role, clearance_status, hire_date, created_at, status')
      .eq('facility_id', facilityId)
      .eq('status', 'active')
      .order('hire_date', { ascending: false });

    if (error) {
      console.error('❌ Error fetching personnel data:', error);
      return [];
    }
    return data ?? [];
  } catch (error) {
    console.error('❌ Exception in getPersonnelData:', error);
    return [];
  }
}

export async function getSeparatedPersonnelData(facilityId: string) {
  try {
    const { orgId } = await getAuthenticatedUserContext();
    const supabase = createAdminClient();

    const { data: facility } = await supabase
      .from('facilities')
      .select('id, org_id')
      .eq('id', facilityId)
      .eq('org_id', orgId)
      .single();
    if (!facility) return [];

    const { data, error } = await supabase
      .from('personnel')
      .select('id, name, role, clearance_status, hire_date, created_at, status, separation_date')
      .eq('facility_id', facilityId)
      .eq('status', 'separated')
      .order('separation_date', { ascending: false });

    if (error) {
      console.error('❌ Error fetching separated personnel data:', error);
      return [];
    }
    return data ?? [];
  } catch (error) {
    console.error('❌ Exception in getSeparatedPersonnelData:', error);
    return [];
  }
}

export async function markEmployeeSeparated(personnelId: string) {
  try {
    const { orgId } = await getAuthenticatedUserContext();
    const supabase = createAdminClient();

    const { data: personnel, error: personnelError } = await supabase
      .from('personnel')
      .select('id, facility_id, facilities!inner(org_id)')
      .eq('id', personnelId)
      .single();

    if (personnelError || !personnel) {
      return { success: false, error: 'Personnel record not found' };
    }

    // @ts-expect-error - Supabase join shape
    if (personnel.facilities?.org_id !== orgId) {
      return { success: false, error: 'Unauthorized: Personnel does not belong to your organization' };
    }

    const { error } = await supabase
      .from('personnel')
      .update({ status: 'separated', separation_date: new Date().toISOString() })
      .eq('id', personnelId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * Returns the personnel roles that are valid for this facility.
 *
 * Smart filter:
 *   - role.facility_type === facility.facility_type, AND
 *   - role.sub_classification IS NULL OR the facility has that toggle set to TRUE.
 */
export async function getAvailableRoles(facilityId: string) {
  try {
    const { orgId } = await getAuthenticatedUserContext();
    const supabase = createAdminClient();

    const { data: facility, error: facilityError } = await supabase
      .from('facilities')
      .select(
        [
          'id',
          'org_id',
          'facility_type',
          ...FACILITY_TOGGLE_KEYS,
        ].join(', ')
      )
      .eq('id', facilityId)
      .eq('org_id', orgId)
      .single();

    if (facilityError || !facility) {
      throw new Error('Unauthorized: Facility not found or does not belong to your organization');
    }

    const facilityRow = facility as unknown as Record<string, unknown>;
    const facilityType = facilityRow.facility_type as FacilityType;

    const { data: roles, error: rolesError } = await supabase
      .from('regulatory_roles')
      .select('id, role_name, sub_classification, facility_type');

    if (rolesError) {
      console.error('❌ Error querying regulatory_roles:', rolesError);
      return { success: false, error: 'Failed to fetch available roles', roles: [] as string[] };
    }

    const filteredRoles = (roles ?? []).filter((role: Record<string, unknown>) => {
      if (role.facility_type !== facilityType) return false;
      if (
        role.sub_classification === null ||
        role.sub_classification === undefined ||
        String(role.sub_classification) === 'null'
      ) {
        return true;
      }
      const subKey = role.sub_classification as string;
      return facilityRow[subKey] === true;
    });

    const uniqueNames = Array.from(
      new Set(filteredRoles.map((r) => r.role_name as string))
    ).sort();

    return { success: true, roles: uniqueNames };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Error fetching available roles:', message);
    return { success: false, error: message, roles: [] as string[] };
  }
}

/**
 * Returns the personnel-category compliance requirements that are mandated for an employee
 * with the given role at the given facility.
 */
export async function getRequirementsForRole(facilityId: string, roleName: string) {
  try {
    const { orgId } = await getAuthenticatedUserContext();
    const supabase = createAdminClient();

    const { data: facility, error: facilityError } = await supabase
      .from('facilities')
      .select(
        ['id', 'org_id', 'facility_type', ...FACILITY_TOGGLE_KEYS].join(', ')
      )
      .eq('id', facilityId)
      .eq('org_id', orgId)
      .single();
    if (facilityError || !facility) {
      throw new Error('Unauthorized: Facility not found or does not belong to your organization');
    }

    const facilityRow = facility as unknown as Record<string, unknown>;
    const facilityType = facilityRow.facility_type as FacilityType;

    const { data: rules } = await supabase.from('compliance_criteria').select('*');

    const applicable = (rules ?? []).filter((rule: Record<string, unknown>) => {
      if (rule.facility_type !== facilityType) return false;
      const subClass = rule.sub_classification;
      if (subClass !== null && subClass !== undefined && String(subClass) !== 'null') {
        if (facilityRow[subClass as string] !== true) return false;
      }
      const scoreCategory =
        rule.score_category ??
        (rule.is_personnel_requirement === true ? 'personnel' : 'facility');
      if (scoreCategory !== 'personnel') return false;
      const ruleRole = (rule.applies_to_role as string | null | undefined) ?? null;
      // If a rule explicitly targets a role, match it; otherwise treat it as universal-personnel.
      if (ruleRole === null) return true;
      return ruleRole.toLowerCase() === roleName.toLowerCase();
    });

    return {
      success: true,
      requirements: applicable.map((r) => ({
        id: r.id,
        name: r.requirement_name,
        typeKey: r.required_document_type,
        severity: r.severity,
        frequency: r.frequency,
      })),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message, requirements: [] as Array<{ id: string; name: string; typeKey: string; severity: string; frequency: string }> };
  }
}

export async function addPersonnel(
  facilityId: string,
  personnelData: {
    name: string;
    role: string;
    hire_date: string;
  }
) {
  try {
    const { orgId } = await getAuthenticatedUserContext();
    const supabase = createAdminClient();

    const { data: facility, error: facilityError } = await supabase
      .from('facilities')
      .select('id, org_id')
      .eq('id', facilityId)
      .eq('org_id', orgId)
      .single();
    if (facilityError || !facility) {
      throw new Error('Unauthorized: Facility not found or does not belong to your organization');
    }

    const { data: newPersonnel, error: insertError } = await supabase
      .from('personnel')
      .insert({
        facility_id: facilityId,
        name: personnelData.name,
        role: personnelData.role,
        hire_date: personnelData.hire_date,
        status: 'active',
        clearance_status: 'pending',
      })
      .select()
      .single();

    if (insertError) {
      console.error('❌ Error inserting personnel:', insertError);
      return { success: false, error: 'Failed to add personnel member' };
    }
    return { success: true, personnel: newPersonnel };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

// =============================================================================
// DOCUMENTS
// =============================================================================

/**
 * Fetches personnel-specific documents (where metadata contains personnel_id).
 */
export async function getPersonnelDocuments(facilityId: string) {
  try {
    const { orgId } = await getAuthenticatedUserContext();
    const supabase = createAdminClient();

    const { data: facility } = await supabase
      .from('facilities')
      .select('id, org_id')
      .eq('id', facilityId)
      .eq('org_id', orgId)
      .single();
    if (!facility) return [];

    const { data, error } = await supabase
      .from('facility_documents')
      .select('id, name, document_type, status, file_url, metadata, created_at')
      .eq('facility_id', facilityId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching personnel documents:', error);
      return [];
    }

    // Filter for documents with personnel_id in metadata
    return (data ?? []).filter((doc) => {
      const meta = doc.metadata as Record<string, unknown> | null;
      return meta && meta.personnel_id;
    });
  } catch (error) {
    console.error('❌ Exception in getPersonnelDocuments:', error);
    return [];
  }
}

export async function getDocumentsData(facilityId: string) {
  try {
    const { orgId } = await getAuthenticatedUserContext();
    const supabase = createAdminClient();

    const { data: facility } = await supabase
      .from('facilities')
      .select('id, org_id')
      .eq('id', facilityId)
      .eq('org_id', orgId)
      .single();
    if (!facility) return [];

    const { data, error } = await supabase
      .from('facility_documents')
      .select('id, name, document_type, status, file_url, metadata, created_at')
      .eq('facility_id', facilityId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching documents data:', error);
      return [];
    }
    return data ?? [];
  } catch (error) {
    console.error('❌ Exception in getDocumentsData:', error);
    return [];
  }
}

export async function deleteDocumentRecord(documentId: string) {
  try {
    const { userId, orgId } = await getAuthenticatedUserContext();
    const supabase = createAdminClient();

    const { data: document, error: docError } = await supabase
      .from('facility_documents')
      .select('id, facility_id, name, document_type')
      .eq('id', documentId)
      .single();
    if (docError || !document) {
      return { success: false, error: 'Document not found' };
    }

    const { data: facility } = await supabase
      .from('facilities')
      .select('org_id')
      .eq('id', document.facility_id)
      .single();
    if (!facility || facility.org_id !== orgId) {
      return { success: false, error: 'Unauthorized: Document does not belong to your organization' };
    }

    await createAuditLog({
      facilityId: document.facility_id,
      userId,
      actionType: 'document_deletion',
      metadata: {
        document_id: documentId,
        document_name: document.name,
        document_type: document.document_type,
      },
    });

    const { error: deleteError } = await supabase
      .from('facility_documents')
      .delete()
      .eq('id', documentId);
    if (deleteError) {
      return { success: false, error: 'Failed to delete document' };
    }

    revalidatePath('/dashboard');
    return { success: true, message: `Successfully deleted ${document.name}` };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

// =============================================================================
// FACILITIES OVERVIEW + SETTINGS
// =============================================================================

export async function getAllFacilitiesOverview() {
  try {
    const { userId, orgId, role } = await getAuthenticatedUserContext();
    const supabase = createAdminClient();

    let facilitiesQuery = supabase
      .from('facilities')
      .select(
        [
          'id',
          'name',
          'facility_type',
          'capacity',
          'active_enrollment',
          'enrollment_updated_at',
          'director_id',
          ...FACILITY_TOGGLE_KEYS,
        ].join(', ')
      )
      .eq('org_id', orgId)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (role === 'director') {
      facilitiesQuery = facilitiesQuery.eq('director_id', userId);
    }

    const { data: facilities, error } = await facilitiesQuery;
    if (error || !facilities || facilities.length === 0) return [];

    const facilityRows = facilities as unknown as Record<string, unknown>[];

    const facilitiesWithCompliance = await Promise.all(
      facilityRows.map(async (facility) => {
        try {
          const compliance = await getRegulatoryStatus(facility.id as string);
          return {
            ...facility,
            facilityReadinessScore: compliance.facilityReadinessScore,
            personnelReadinessScore: compliance.personnelReadinessScore,
            totalPersonnel: compliance.staffCount,
            gapsCount: compliance.identifiedGaps.length,
          };
        } catch (innerError) {
          console.error('❌ Error fetching compliance for facility', facility.id, innerError);
          return {
            ...facility,
            facilityReadinessScore: 0,
            personnelReadinessScore: 0,
            totalPersonnel: 0,
            gapsCount: 0,
          };
        }
      })
    );
    return facilitiesWithCompliance;
  } catch (error) {
    console.error('❌ Exception in getAllFacilitiesOverview:', error);
    return [];
  }
}

/**
 * Returns the full facility record (including all toggles) for the Settings page.
 */
export async function getFacilitySettings(facilityId: string) {
  try {
    const { orgId } = await getAuthenticatedUserContext();
    const supabase = createAdminClient();

    const { data: facility, error } = await supabase
      .from('facilities')
      .select(
        [
          'id',
          'org_id',
          'name',
          'facility_type',
          'license_number',
          'capacity',
          'active_enrollment',
          'enrollment_updated_at',
          'director_id',
          ...FACILITY_TOGGLE_KEYS,
        ].join(', ')
      )
      .eq('id', facilityId)
      .eq('org_id', orgId)
      .single();

    if (error || !facility) {
      return { success: false, error: 'Facility not found', facility: null };
    }
    return { success: true, facility };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message, facility: null };
  }
}

/**
 * Persists the boolean toggles for a facility (childcare or nursing-home scope flags).
 */
export async function updateFacilitySettings(
  facilityId: string,
  toggles: Partial<FacilityScopeToggles>
) {
  try {
    const { userId, orgId } = await getAuthenticatedUserContext();
    const supabase = createAdminClient();

    const { data: facility, error: facilityError } = await supabase
      .from('facilities')
      .select('id, org_id')
      .eq('id', facilityId)
      .eq('org_id', orgId)
      .single();
    if (facilityError || !facility) {
      throw new Error('Unauthorized: Facility not found or does not belong to your organization');
    }

    // Only persist known toggle keys.
    const sanitized: Partial<FacilityScopeToggles> = {};
    for (const key of FACILITY_TOGGLE_KEYS) {
      if (Object.prototype.hasOwnProperty.call(toggles, key)) {
        sanitized[key] = Boolean(toggles[key]);
      }
    }

    const { error: updateError } = await supabase
      .from('facilities')
      .update(sanitized)
      .eq('id', facilityId);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    await createAuditLog({
      facilityId,
      userId,
      actionType: 'facility_settings_update',
      metadata: { toggles: sanitized },
    });

    revalidatePath('/dashboard');
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

// =============================================================================
// ENROLLMENT
// =============================================================================

export async function updateEnrollment(facilityId: string, activeEnrollment: number) {
  try {
    const { userId, orgId } = await getAuthenticatedUserContext();
    const supabase = createAdminClient();

    const { data: facility, error: facilityError } = await supabase
      .from('facilities')
      .select('id, org_id, active_enrollment, capacity')
      .eq('id', facilityId)
      .eq('org_id', orgId)
      .single();
    if (facilityError || !facility) {
      throw new Error('Unauthorized: Facility not found or does not belong to your organization');
    }

    if (facility.capacity && activeEnrollment > facility.capacity) {
      return {
        success: false,
        error: `Enrollment cannot exceed licensed capacity of ${facility.capacity}`,
      };
    }

    const previousEnrollment = facility.active_enrollment;

    const { error: updateError } = await supabase
      .from('facilities')
      .update({
        active_enrollment: activeEnrollment,
        enrollment_updated_at: new Date().toISOString(),
      })
      .eq('id', facilityId);
    if (updateError) {
      return { success: false, error: updateError.message };
    }

    await createAuditLog({
      facilityId,
      userId,
      actionType: 'enrollment_update',
      metadata: {
        previous_enrollment: previousEnrollment,
        new_enrollment: activeEnrollment,
      },
    });

    revalidatePath('/dashboard');
    return { success: true, activeEnrollment };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

// =============================================================================
// ROLES / RBAC HELPERS
// =============================================================================

export async function getCurrentUserRole() {
  try {
    const { userId, orgId, role } = await getAuthenticatedUserContext();
    return { success: true, userId, orgId, role };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message, role: null };
  }
}

export async function toggleUserStatus(
  targetUserId: string,
  newStatus: 'active' | 'deactivated'
) {
  try {
    const { orgId, role } = await getAuthenticatedUserContext();
    if (role !== 'owner' && role !== 'admin') {
      return { success: false, error: 'Unauthorized' };
    }
    const supabase = createAdminClient();

    const { data: targetProfile } = await supabase
      .from('profiles')
      .select('id, org_id')
      .eq('id', targetUserId)
      .single();
    if (!targetProfile) return { success: false, error: 'User not found' };
    if (targetProfile.org_id !== orgId) {
      return { success: false, error: 'Unauthorized: Cross-tenant action blocked' };
    }

    const { error } = await supabase
      .from('profiles')
      .update({ account_status: newStatus })
      .eq('id', targetUserId);
    if (error) return { success: false, error: 'Failed to update account status' };

    return {
      success: true,
      message: `Account ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully`,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

// =============================================================================
// AUDIT LOGS
// =============================================================================

/**
 * Archives a facility by setting `is_active = false`.
 * Only accessible to 'owner' or 'admin' roles.
 */
export async function archiveFacility(facilityId: string) {
  try {
    const { userId, orgId, role } = await getAuthenticatedUserContext();
    
    if (role !== 'owner' && role !== 'admin') {
      return { success: false, error: 'Unauthorized: Only owners and admins can archive facilities' };
    }

    const supabase = createAdminClient();

    const { data: facility, error: facilityError } = await supabase
      .from('facilities')
      .select('id, org_id, name')
      .eq('id', facilityId)
      .eq('org_id', orgId)
      .single();

    if (facilityError || !facility) {
      throw new Error('Unauthorized: Facility not found or does not belong to your organization');
    }

    const { error: updateError } = await supabase
      .from('facilities')
      .update({ is_active: false })
      .eq('id', facilityId);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    await createAuditLog({
      facilityId,
      userId,
      actionType: 'facility_archived' as AuditActionType,
      metadata: {
        facility_name: facility.name,
        archived_at: new Date().toISOString(),
      },
    });

    revalidatePath('/dashboard');
    return { success: true, message: `Facility "${facility.name}" has been archived` };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * Adds a new facility to the organization.
 * Only accessible to 'owner' or 'admin' roles.
 */
export async function addFacility(payload: {
  name: string;
  facility_type: FacilityType;
  license_number: string;
  capacity: number;
  toggles: Partial<FacilityScopeToggles>;
}) {
  try {
    const { userId, orgId, role } = await getAuthenticatedUserContext();

    if (role !== 'owner' && role !== 'admin') {
      return { success: false, error: 'Unauthorized: Only owners and admins can add facilities' };
    }

    const supabase = createAdminClient();

    const togglePayload: Record<string, boolean> = {};
    for (const key of FACILITY_TOGGLE_KEYS) {
      togglePayload[key] = Boolean(payload.toggles[key]);
    }

    const { data: newFacility, error: insertError } = await supabase
      .from('facilities')
      .insert({
        org_id: orgId,
        name: payload.name,
        facility_type: payload.facility_type,
        license_number: payload.license_number,
        capacity: payload.capacity,
        is_active: true,
        ...togglePayload,
      })
      .select()
      .single();

    if (insertError) {
      console.error('❌ Error inserting facility:', insertError);
      return { success: false, error: 'Failed to create facility' };
    }

    await createAuditLog({
      facilityId: newFacility.id as string,
      userId,
      actionType: 'facility_settings_update' as AuditActionType,
      metadata: {
        action: 'facility_created',
        facility_name: payload.name,
        facility_type: payload.facility_type,
        toggles: payload.toggles,
      },
    });

    revalidatePath('/dashboard');
    return { success: true, facility: newFacility, message: 'Facility created successfully' };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

export async function getAuditLogs(facilityId?: string) {
  try {
    const { userId, orgId, role } = await getAuthenticatedUserContext();
    const supabase = createAdminClient();

    let logsQuery = supabase
      .from('audit_logs')
      .select('*, facilities!inner(name, org_id, director_id)')
      .eq('facilities.org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(500);

    if (facilityId) {
      logsQuery = logsQuery.eq('facility_id', facilityId);
    }
    if (role === 'director') {
      logsQuery = logsQuery.eq('facilities.director_id', userId);
    }

    const { data: logs, error } = await logsQuery;
    if (error) {
      console.error('❌ Error fetching audit logs:', error);
      return [];
    }

    return (logs ?? []).map((log: Record<string, unknown>) => {
      const facility = log.facilities as { name?: string } | null;
      const metadata = (log.metadata as Record<string, unknown> | null) ?? {};
      return {
        ...log,
        facility_name: facility?.name ?? 'Unknown Facility',
        user_name: (metadata.user_name as string | undefined) ?? 'Unknown User',
        user_role: (metadata.user_role as string | undefined) ?? 'unknown',
      };
    });
  } catch (error) {
    console.error('❌ Exception in getAuditLogs:', error);
    return [];
  }
}
