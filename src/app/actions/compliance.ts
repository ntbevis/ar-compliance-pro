// src/app/actions/compliance.ts
'use server';

import { createAdminClient } from 'src/app/utils/supabase/admin';
import { createClient } from 'src/app/utils/supabase/server';
import { getRegulatoryStatus, ruleAppliesToFacility } from '@/lib/reg-monitor';
import { createHash } from 'crypto';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import type { ComplianceRule, Facility, FacilityScopeToggles, FacilityType, IdentifiedGap } from '@/lib/types';
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
  | 'operational_acknowledgment'
  | 'facility_settings_update'
  | 'facility_profile_update'
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
  aiExpirationDate?: string;
  status?: 'approved' | 'pending';
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
    if (params.aiExpirationDate) {
      metadata.ai_extracted_expiration = params.aiExpirationDate;
    }

    const { error: updateError } = await supabase
      .from('facility_documents')
      .update({
        status: params.status ?? 'approved',
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
// OPERATIONAL BLUEPRINTS
// =============================================================================

export type BlueprintRule = {
  id: string;
  name: string;
  typeKey: string;
  severity: 'critical' | 'standard';
  frequency: string;
  is_scored: boolean;
};

/**
 * Returns the full list of compliance rules applicable to a facility — used as the
 * static reference manual in the Operational Blueprints view. Unlike getRegulatoryStatus,
 * this does NOT compute scores, gap statuses, or document satisfaction. It is read-only.
 */
export async function getOperationalBlueprints(facilityId: string): Promise<BlueprintRule[]> {
  try {
    const { orgId } = await getAuthenticatedUserContext();
    const supabase = createAdminClient();

    const { data: facility, error: facilityError } = await supabase
      .from('facilities')
      .select(['id', 'org_id', 'facility_type', ...FACILITY_TOGGLE_KEYS].join(', '))
      .eq('id', facilityId)
      .eq('org_id', orgId)
      .single();

    if (facilityError || !facility) {
      throw new Error('Unauthorized: Facility not found or does not belong to your organization');
    }

    const { data: allRules } = await supabase.from('compliance_criteria').select('*');

    return (allRules || [])
      .filter((rule: Record<string, unknown>) =>
        ruleAppliesToFacility(
          rule as unknown as ComplianceRule,
          facility as unknown as Facility
        )
      )
      .map((rule: Record<string, unknown>) => ({
        id: rule.id as string,
        name: (rule.requirement_name as string) ?? '',
        typeKey: (rule.required_document_type as string) ?? '',
        severity: ((rule.severity as 'critical' | 'standard') ?? 'standard'),
        frequency: String(rule.frequency ?? ''),
        is_scored: typeof rule.is_scored === 'boolean' ? rule.is_scored : true,
      }));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ getOperationalBlueprints failure:', message);
    return [];
  }
}

/**
 * Signs the Operational Acknowledgment for a facility director.
 * Creates an audit log entry and returns the name-stamped acknowledgment details
 * so the UI can update immediately without a second fetch.
 */
export async function signOperationalAcknowledgment(facilityId: string): Promise<
  | { success: true; acknowledgment: { created_at: string; user_name: string } }
  | { success: false; error: string }
> {
  try {
    const { userId, orgId, role } = await getAuthenticatedUserContext();

    if (role !== 'owner' && role !== 'admin' && role !== 'director') {
      return {
        success: false,
        error: 'Only owners, administrators, or directors may sign operational acknowledgments.',
      };
    }

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

    // Fetch the user's display name to embed in the response (createAuditLog also fetches it
    // internally; this avoids a second round-trip by caching the value here).
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .single();

    const userName = (profile?.full_name as string | null) ?? 'Unknown User';
    const now = new Date().toISOString();

    await createAuditLog({
      facilityId,
      userId,
      actionType: 'operational_acknowledgment',
      metadata: {
        acknowledged_at: now,
        acknowledgment_text:
          'I acknowledge that maintaining these operational standards is my responsibility as the facility director.',
      },
    });

    revalidatePath('/dashboard');
    return { success: true, acknowledgment: { created_at: now, user_name: userName } };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ signOperationalAcknowledgment failure:', message);
    return { success: false, error: message };
  }
}

/**
 * Retrieves the most recent Operational Acknowledgment for a facility.
 * Returns null if none has ever been signed.
 */
export async function getLatestOperationalAcknowledgment(
  facilityId: string
): Promise<{ created_at: string; user_name: string } | null> {
  try {
    const { orgId } = await getAuthenticatedUserContext();
    const supabase = createAdminClient();

    // Verify org ownership before exposing audit data
    const { data: facility } = await supabase
      .from('facilities')
      .select('id')
      .eq('id', facilityId)
      .eq('org_id', orgId)
      .maybeSingle();

    if (!facility) return null;

    const { data: log } = await supabase
      .from('audit_logs')
      .select('created_at, metadata')
      .eq('facility_id', facilityId)
      .eq('action_type', 'operational_acknowledgment')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!log) return null;

    const metadata = (log.metadata as Record<string, unknown> | null) ?? {};
    const userName =
      typeof metadata.user_name === 'string' ? metadata.user_name : 'Unknown User';

    return { created_at: log.created_at as string, user_name: userName };
  } catch {
    return null;
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

      // Role-specific absolute override: if applicable_roles is a non-empty array, the
      // result is determined solely by the role match — the sub_classification and facility
      // toggle checks below are completely bypassed in either direction.
      const applicableRoles = Array.isArray(rule.applicable_roles)
        ? (rule.applicable_roles as string[])
        : null;
      if (applicableRoles !== null && applicableRoles.length > 0) {
        return applicableRoles.some((r) => r.toLowerCase() === roleName.toLowerCase());
      }

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
 * Deletes a single document from `facility_documents` and writes an audit log entry.
 * Accessible to 'owner' and 'director' roles only.
 */
export async function deleteDocument(documentId: string, facilityId: string) {
  try {
    const { userId, orgId, role } = await getAuthenticatedUserContext();

    if (role !== 'owner' && role !== 'director' && role !== 'admin') {
      return { success: false, error: 'Unauthorized: Only owners and directors can delete documents' };
    }

    const supabase = createAdminClient();

    // Verify the document belongs to a facility in this org
    const { data: doc, error: docError } = await supabase
      .from('facility_documents')
      .select('id, facility_id, name, document_type')
      .eq('id', documentId)
      .single();

    if (docError || !doc) {
      return { success: false, error: 'Document not found' };
    }

    const { data: facility } = await supabase
      .from('facilities')
      .select('org_id')
      .eq('id', doc.facility_id)
      .single();

    if (!facility || facility.org_id !== orgId) {
      return { success: false, error: 'Unauthorized: Document does not belong to your organization' };
    }

    const { error: deleteError } = await supabase
      .from('facility_documents')
      .delete()
      .eq('id', documentId);

    if (deleteError) {
      return { success: false, error: 'Failed to delete document' };
    }

    await createAuditLog({
      facilityId,
      userId,
      actionType: 'document_deletion',
      metadata: {
        document_id: documentId,
        document_name: doc.name,
        document_type: doc.document_type,
        deleted_for_replacement: true,
      },
    });

    revalidatePath('/dashboard');
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

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

/**
 * Generates a temporary signed URL for a facility document stored in Supabase Storage.
 * The URL is valid for 5 minutes. Also returns the document's metadata so the viewer
 * can display AI-extracted fields (e.g. expiration date, upload source).
 *
 * Authorization: owner, admin, or the director specifically assigned to this facility.
 */
export async function getSecureDocumentUrl(
  documentId: string,
  facilityId: string
): Promise<
  | { success: true; url: string | null; metadata: Record<string, unknown> | null }
  | { success: false; error: string }
> {
  try {
    const { userId, orgId, role } = await getAuthenticatedUserContext();
    const supabase = createAdminClient();

    // Verify the facility belongs to this org
    const { data: facility, error: facilityError } = await supabase
      .from('facilities')
      .select('id, org_id, director_id')
      .eq('id', facilityId)
      .eq('org_id', orgId)
      .single();

    if (facilityError || !facility) {
      return { success: false, error: 'Unauthorized: Facility not found or does not belong to your organization' };
    }

    // Directors may only access documents from their own assigned facility
    const fac = facility as Record<string, unknown>;
    if (role === 'director' && fac.director_id !== userId) {
      return { success: false, error: 'Unauthorized: You are not the assigned director of this facility' };
    }

    // Fetch the document record to get the storage path
    const { data: document, error: docError } = await supabase
      .from('facility_documents')
      .select('id, file_url, metadata')
      .eq('id', documentId)
      .eq('facility_id', facilityId)
      .single();

    if (docError || !document) {
      return { success: false, error: 'Document not found or does not belong to this facility' };
    }

    const doc = document as Record<string, unknown>;
    const fileUrl = typeof doc.file_url === 'string' ? doc.file_url : null;
    const metadata = (doc.metadata as Record<string, unknown> | null) ?? null;

    // Attestation / N/A records have no physical file attachment
    if (!fileUrl) {
      return { success: true, url: null, metadata };
    }

    // Generate a 5-minute signed URL — long enough to read a PDF comfortably
    const { data: signedData, error: signedError } = await supabase.storage
      .from('facility-documents')
      .createSignedUrl(fileUrl, 300);

    if (signedError || !signedData?.signedUrl) {
      console.error('❌ Storage signed URL generation failed:', signedError);
      return { success: false, error: 'Failed to generate secure document URL' };
    }

    return { success: true, url: signedData.signedUrl, metadata };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ getSecureDocumentUrl failure:', message);
    return { success: false, error: message };
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

          const activeStaffCount = compliance.staffCount;
          const enrollment = facility.active_enrollment as number | null;
          const cap = facility.capacity as number | null;

          const capacity_utilization =
            cap != null && cap > 0 && enrollment != null
              ? Math.round((enrollment / cap) * 100)
              : undefined;

          const gross_ratio =
            enrollment != null && activeStaffCount > 0
              ? `1 : ${(enrollment / activeStaffCount).toFixed(1)}`
              : undefined;

          return {
            ...facility,
            facilityReadinessScore: compliance.facilityReadinessScore,
            personnelReadinessScore: compliance.personnelReadinessScore,
            totalPersonnel: activeStaffCount,
            gapsCount: compliance.identifiedGaps.length,
            active_staff_count: activeStaffCount,
            capacity_utilization,
            gross_ratio,
          };
        } catch (innerError) {
          console.error('❌ Error fetching compliance for facility', facility.id, innerError);
          return {
            ...facility,
            facilityReadinessScore: 0,
            personnelReadinessScore: 0,
            totalPersonnel: 0,
            gapsCount: 0,
            active_staff_count: 0,
            capacity_utilization: undefined,
            gross_ratio: undefined,
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

/**
 * Updates editable core profile fields (name, license_number, capacity) for a facility.
 * Toggle updates are handled separately by updateFacilitySettings.
 */
export async function updateFacilityProfile(
  facilityId: string,
  fields: { name?: string; license_number?: string; capacity?: number }
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

    const update: Record<string, unknown> = {};
    if (fields.name?.trim()) update.name = fields.name.trim();
    if (fields.license_number?.trim()) update.license_number = fields.license_number.trim().toUpperCase();
    if (typeof fields.capacity === 'number' && fields.capacity > 0) update.capacity = fields.capacity;

    if (Object.keys(update).length === 0) {
      return { success: true };
    }

    const { error: updateError } = await supabase
      .from('facilities')
      .update(update)
      .eq('id', facilityId);

    if (updateError) return { success: false, error: updateError.message };

    await createAuditLog({
      facilityId,
      userId,
      actionType: 'facility_profile_update',
      metadata: { updated_fields: update },
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
// TENANT USER MANAGEMENT
// =============================================================================

/**
 * Returns all director-role profiles belonging to the caller's organization.
 * Accessible to any authenticated org member.
 */
export async function getOrgDirectors(): Promise<
  Array<{
    id: string;
    full_name: string | null;
    email: string | null;
    account_status: string | null;
    org_id: string | null;
  }>
> {
  try {
    const { orgId } = await getAuthenticatedUserContext();
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, account_status, org_id')
      .eq('org_id', orgId)
      .eq('role', 'director')
      .order('full_name', { ascending: true });

    if (error) {
      console.error('❌ getOrgDirectors error:', error);
      return [];
    }
    return data ?? [];
  } catch (error) {
    console.error('❌ getOrgDirectors exception:', error);
    return [];
  }
}

/**
 * Idempotent invite for a Facility Director. Safe to call multiple times for
 * the same email (supports "Resend Invite") and handles the case where a user
 * was deleted from Supabase Auth but still has a lingering profiles row.
 *
 * Flow:
 *  1. Look up any existing profile row for this email (zombie detection).
 *  2. Attempt `inviteUserByEmail`.
 *     - Success → fresh invite; resolved user ID comes from the invite response.
 *       If a zombie profile existed with a different ID it is removed first.
 *     - `user_already_exists` → the user has an active Auth account; send a
 *       password-reset / magic-link email instead and resolve the ID from the
 *       existing profile row.
 *  3. Upsert the director profile with the resolved ID.
 *  4. Assign the director to the requested facilities.
 *
 * Caller must be an 'owner' or 'admin'.
 */
export async function inviteFacilityDirector(
  email: string,
  fullName: string,
  facilityIds: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const { orgId, role } = await getAuthenticatedUserContext();

    if (role !== 'owner' && role !== 'admin') {
      return { success: false, error: 'Unauthorized: Only owners and admins can invite directors' };
    }

    if (!facilityIds || facilityIds.length === 0) {
      return { success: false, error: 'At least one facility must be selected' };
    }

    const supabase = createAdminClient();

    // Verify all selected facilities belong to this org
    const { data: facilities, error: facilityError } = await supabase
      .from('facilities')
      .select('id, org_id')
      .in('id', facilityIds)
      .eq('org_id', orgId);

    if (facilityError || !facilities || facilities.length !== facilityIds.length) {
      return { success: false, error: 'Unauthorized: One or more facilities not found or do not belong to your organization' };
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const redirectTo = `${siteUrl}/auth/callback?next=/auth/reset-password`;

    // ── 1. Check for a pre-existing profile row (catches zombie profiles) ────
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    // ── 2. Attempt the Supabase Auth invitation ───────────────────────────────
    let resolvedUserId: string;

    const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
      email,
      { redirectTo }
    );

    const isUserAlreadyExists =
      inviteError?.code === 'user_already_exists' ||
      (inviteError?.message?.toLowerCase().includes('already') &&
        inviteError?.message?.toLowerCase().includes('registered'));

    if (inviteError && !isUserAlreadyExists) {
      console.error('❌ inviteUserByEmail error:', inviteError);
      return { success: false, error: inviteError.message ?? 'Failed to send invitation' };
    }

    if (isUserAlreadyExists) {
      // The user already has an active Auth account. Send a password-reset /
      // magic-link email so they can still access the platform.
      console.log('ℹ️ User already exists in Auth — sending password reset email to:', email);
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });
      if (resetError) {
        // Non-fatal — profile and facility assignment still proceeds.
        console.error('⚠️ resetPasswordForEmail error (non-fatal):', resetError);
      }

      if (!existingProfile?.id) {
        // Extremely rare: user_already_exists in Auth but no profile row exists.
        // This indicates data corruption; surface a clear message.
        console.error('❌ user_already_exists in Auth but no matching profile row found for:', email);
        return {
          success: false,
          error: 'This email is already registered in the authentication system but has no associated profile. Please contact support.',
        };
      }

      resolvedUserId = existingProfile.id;
    } else {
      // Fresh invite succeeded — use the new Auth user's ID.
      resolvedUserId = inviteData!.user.id;

      // If a zombie profile with a different ID is lingering, remove it before
      // upserting so we don't violate the unique email constraint.
      if (existingProfile && existingProfile.id !== resolvedUserId) {
        console.log('⚠️ Removing stale zombie profile for:', email, '(old id:', existingProfile.id, ')');
        await supabase.from('profiles').delete().eq('id', existingProfile.id);
      }
    }

    // ── 3. Upsert the director profile ───────────────────────────────────────
    const { error: profileError } = await supabase.from('profiles').upsert({
      id: resolvedUserId,
      org_id: orgId,
      role: 'director',
      full_name: fullName,
      email: email,
      account_status: 'active',
      onboarding_completed: true,
    });

    if (profileError) {
      console.error('❌ Profile upsert error:', profileError);
      return { success: false, error: 'Invitation sent but failed to create/update profile record' };
    }

    // ── 4. Assign director to selected facilities ─────────────────────────────
    const { error: facilityUpdateError } = await supabase
      .from('facilities')
      .update({ director_id: resolvedUserId })
      .in('id', facilityIds);

    if (facilityUpdateError) {
      console.error('❌ Facility director_id update error:', facilityUpdateError);
    }

    revalidatePath('/dashboard');
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ inviteFacilityDirector failure:', message);
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

    // 1. Get the facilities this user is allowed to see
    let facQuery = supabase.from('facilities').select('id, name, director_id').eq('org_id', orgId);
    if (role === 'director') {
      facQuery = facQuery.eq('director_id', userId);
    }
    const { data: facilities, error: facError } = await facQuery;

    if (facError || !facilities || facilities.length === 0) return [];

    const allowedFacIds = facilities.map(f => f.id);
    const targetFacIds = facilityId && allowedFacIds.includes(facilityId)
      ? [facilityId]
      : allowedFacIds;

    if (targetFacIds.length === 0) return [];

    // 2. Fetch the logs for those facilities
    const { data: logs, error } = await supabase
      .from('audit_logs')
      .select('*')
      .in('facility_id', targetFacIds)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      console.error('❌ Error fetching audit logs:', error);
      return [];
    }

    // 3. Map facility names to the logs
    const facMap = new Map(facilities.map(f => [f.id, f.name]));

    return (logs ?? []).map((log) => {
      const metadata = (log.metadata as Record<string, unknown> | null) ?? {};
      return {
        ...log,
        facility_name: facMap.get(log.facility_id) ?? 'Unknown Facility',
        user_name: (metadata.user_name as string | undefined) ?? 'Unknown User',
        user_role: (metadata.user_role as string | undefined) ?? 'unknown',
      };
    });
  } catch (error) {
    console.error('❌ Exception in getAuditLogs:', error);
    return [];
  }
}
