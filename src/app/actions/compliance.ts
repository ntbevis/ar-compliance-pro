// src/app/actions/compliance.ts
'use server';

import { getRegulatoryStatus } from '@/lib/reg-monitor';
import { createAdminClient } from 'src/app/utils/supabase/admin';
import { createClient } from 'src/app/utils/supabase/server';
import { routeAndExtract } from '@/lib/llm-router';

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
  
  if (!profile.org_id) {
    throw new Error('Unauthorized: User is not associated with any organization');
  }
  
  // 3. Enforce account status gate - block deactivated accounts
  if (profile.account_status === 'deactivated') {
    throw new Error('Access Denied: This account has been deactivated by your organization administrator.');
  }
  
  return {
    userId,
    orgId: profile.org_id,
    role: profile.role,
    accountStatus: profile.account_status
  };
}

// Helper to determine content type from file name extensions
function getMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'txt') return 'text/plain';
  return 'application/pdf'; // Default to standard document format handles
}

/**
 * Fetches real-time, high-fidelity compliance metrics for a facility
 * by bridging the UI to our vector-backed engine in src/lib.
 * SECURITY: Verifies facility belongs to authenticated user's organization.
 */
export async function getFacilityComplianceData(facilityId: string) {
  try {
    // 1. Authenticate user and get their organization context
    const { orgId } = await getAuthenticatedUserContext();
    
    // 2. Verify facility belongs to user's organization
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
    
    // 3. Call your automated monitoring layer
    const rawStatus = await getRegulatoryStatus(facilityId);
    
    // 4. Return the exact shape the Next.js dashboard UI expects
    return {
      score: rawStatus?.calculatedScore ?? 0,
      gaps: (rawStatus?.identifiedGaps ?? []).map((gap: any) => ({
        id: gap.id,
        name: gap.title,             // e.g., "DCCECE Background Check"
        typeKey: gap.systemSlug,     // e.g., "dccece_background_check"
        severity: gap.isCritical ? 'critical' : 'standard'
      })),
      totalPersonnel: rawStatus?.staffCount ?? 0
    };
  } catch (error) {
    console.error("❌ Error bridging UI to Compliance Engine:", error);
    // Graceful fallback so the UI doesn't crash if the database table is empty
    return {
      score: 0,
      gaps: [],
      totalPersonnel: 0
    };
  }
}

/**
 * Handles post-upload processing hook.
 * Resolves the document from the verified columns, fetches the binary payload directly,
 * and passes the raw content stream to the AI routing engine for flawless conversion.
 * SECURITY: Verifies facility belongs to authenticated user's organization.
 */
export async function handleDocumentUploadSuccess(facilityId: string, documentId: string) {
  console.log(`🔄 Processing upload action for facility ${facilityId}, document ${documentId}`);
  
  try {
    // 1. Authenticate user and verify facility ownership + fetch facility classification scope
    const { orgId } = await getAuthenticatedUserContext();
    const supabase = createAdminClient();
    
    const { data: facility, error: facilityError } = await supabase
      .from('facilities')
      .select('id, org_id, facility_type, sub_classification')
      .eq('id', facilityId)
      .eq('org_id', orgId)
      .single();
    
    if (facilityError || !facility) {
      throw new Error('Unauthorized: Facility not found or does not belong to your organization');
    }
    
    const facilityType = facility.facility_type;
    const subClassification = facility.sub_classification;
    
    console.log(`📋 Facility Classification: ${facilityType}${subClassification ? ` (${subClassification})` : ''}`);
    
    // 2. Query compliance_criteria table for valid document types based on facility scope
    let criteriaQuery = supabase
      .from('compliance_criteria')
      .select('required_document_type')
      .eq('facility_type', facilityType);
    
    // Add sub-classification filter if available for precise regulatory scoping
    if (subClassification) {
      criteriaQuery = criteriaQuery.eq('sub_classification', subClassification);
    }
    
    const { data: criteriaRecords, error: criteriaError } = await criteriaQuery;
    
    if (criteriaError) {
      console.error('❌ Error querying compliance_criteria:', criteriaError);
    }
    
    // Extract array of valid document type keys from database
    const allowedSystemKeys = (criteriaRecords || [])
      .map(record => record.required_document_type)
      .filter(Boolean); // Remove any null/undefined values
    
    console.log(`🔑 Dynamic Schema Loaded: ${allowedSystemKeys.length} valid document types for this facility classification`);
    
    // 3. Fetch the exact record using your confirmed columns and verify it belongs to the facility
    const { data: docRecord, error: docError } = await supabase
      .from('facility_documents')
      .select('id, name, file_url, metadata, facility_id')
      .eq('id', documentId)
      .eq('facility_id', facilityId)
      .single();

    if (docError || !docRecord) {
      throw new Error(`Failed to locate document record: ${docError?.message}`);
    }

    const fileName = docRecord.name || 'document.pdf';
    const mimeType = getMimeType(fileName);
    const fileTargetSource = docRecord.file_url;

    if (!fileTargetSource) {
      throw new Error(`Target file_url column is empty for record ${documentId}`);
    }

    let buffer: Buffer;

    // 4. Resilient Binary Resolver: Handles both direct fully-qualified URLs and relative storage paths
    if (fileTargetSource.startsWith('http://') || fileTargetSource.startsWith('https://')) {
      console.log(`📥 Downloading document asset via public source endpoint: ${fileTargetSource}`);
      const networkResponse = await fetch(fileTargetSource);
      if (!networkResponse.ok) throw new Error(`Network asset fetch failed: status ${networkResponse.status}`);
      const arrayBuffer = await networkResponse.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } else {
      console.log(`📥 Downloading document asset from internal storage bucket path: ${fileTargetSource}`);
      const { data: storageBlob, error: storageError } = await supabase
        .storage
        .from('facility-documents')
        .download(fileTargetSource);

      if (storageError || !storageBlob) {
        throw new Error(`Failed to retrieve binary from facility-documents bucket: ${storageError?.message}`);
      }
      const arrayBuffer = await storageBlob.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    }

    // 5. Pre-Validation Interceptor Layer - Scan for problematic keywords
    console.log(`🔍 Running pre-validation keyword scan on document: ${fileName}`);
    
    let contentText = '';
    if (mimeType === 'text/plain') {
      contentText = buffer.toString('utf-8');
    }
    
    // Combine filename and content for comprehensive scanning
    const scanTarget = `${fileName.toLowerCase()} ${contentText.toLowerCase()}`;
    
    // Define problematic keywords that indicate immediate compliance issues
    const problematicKeywords = ['expired', 'revoked', 'invalid', 'failed'];
    const foundIssues = problematicKeywords.filter(keyword => scanTarget.includes(keyword));
    
    // If problematic keywords found, flag immediately and skip expensive AI processing
    if (foundIssues.length > 0) {
      console.log(`🚫 Pre-validation FAILED: Keywords detected [${foundIssues.join(', ')}] - Flagging document immediately`);
      
      const auditTimestamp = new Date().toISOString();
      const flaggedNotes = `Automated pre-validation scan detected compliance issues: ${foundIssues.join(', ')}. Manual review required.`;
      
      // Update document status to flagged with audit metadata
      const { error: updateError } = await supabase
        .from('facility_documents')
        .update({
          status: 'flagged',
          metadata: {
            ...(typeof docRecord.metadata === 'object' ? docRecord.metadata : {}),
            auditedAt: auditTimestamp,
            notes: flaggedNotes,
            pre_validation_result: 'failed',
            keywords_detected: foundIssues,
            audit_run_at: auditTimestamp,
            ai_processing_skipped: true
          }
        })
        .eq('id', documentId);

      if (updateError) throw updateError;

      console.log(`✅ Document ${documentId} flagged and logged. AI processing skipped to save tokens.`);
      return {
        success: true,
        status: 'flagged',
        report: {
          compliance_status: 'Non-Compliant',
          regulatory_code_violated: foundIssues.join(', '),
          corrective_action: flaggedNotes
        }
      };
    }

    console.log(`✅ Pre-validation passed - No problematic keywords detected. Proceeding to AI analysis...`);

    // 6. Pass the high-fidelity binary payload or raw string straight to the AI router
    // Now includes facilityId for sub-classification scoped RAG retrieval + dynamic schema keys
    console.log(`🧠 Handing data payload directly to AI routing engine with dynamic schema for perfect conversion...`);
    
    let auditReport;
    if (mimeType === 'text/plain') {
      // Direct string evaluation for plain text files
      const cleanText = buffer.toString('utf-8');
      auditReport = await routeAndExtract({
        text: cleanText,
        facilityId,
        allowedSystemKeys,
        facilityType,
        subClassification
      });
    } else {
      // Pass the binary buffer and mime type forward for multimodal image/document vision conversions
      auditReport = await routeAndExtract({
        buffer,
        mimeType,
        facilityId,
        allowedSystemKeys,
        facilityType,
        subClassification
      });
    }

    // Map compliance outcome directly to your allowed status categories
    const finalStatus = auditReport.compliance_status === 'Compliant' ? 'approved' : 'flagged';

    console.log(`💾 Committing regulatory status [${finalStatus}] into table row records...`);
    
    // Extract the AI-classified document type from the audit report
    const extractedDocumentType = auditReport.extracted_document_type || 'general_compliance_upload';
    console.log(`📄 AI Classified Document Type: ${extractedDocumentType}`);
    
    // 7. Intelligent Personnel Matching & Auto-Linking
    let personnelId: string | null = null;
    let personnelMatchStatus = 'not_attempted';
    
    if (auditReport.extracted_personnel_name || auditReport.extracted_first_name || auditReport.extracted_last_name) {
      console.log(`👤 Personnel name detected in document. Attempting fuzzy match...`);
      
      const firstName = auditReport.extracted_first_name?.trim();
      const lastName = auditReport.extracted_last_name?.trim();
      const fullName = auditReport.extracted_personnel_name?.trim();
      
      // Build fuzzy matching query
      const personnelQuery = supabase
        .from('personnel')
        .select('id, name')
        .eq('facility_id', facilityId)
        .eq('status', 'active'); // Only match active personnel
      
      // Try multiple name format combinations for robust matching
      if (firstName && lastName) {
        // Match: "First Last" OR "Last, First" OR "Last First"
        const { data: matches } = await personnelQuery.or(
          `name.ilike.%${firstName}%${lastName}%,name.ilike.%${lastName}%${firstName}%`
        );
        
        if (matches && matches.length > 0) {
          personnelId = matches[0].id;
          personnelMatchStatus = 'matched';
          console.log(`✅ Personnel matched: ${matches[0].name} (ID: ${personnelId})`);
        } else {
          personnelMatchStatus = 'no_match';
          console.log(`⚠️ No personnel match found for: ${firstName} ${lastName}`);
        }
      } else if (fullName) {
        // Fallback: Try matching with full name string
        const { data: matches } = await personnelQuery.ilike('name', `%${fullName}%`);
        
        if (matches && matches.length > 0) {
          personnelId = matches[0].id;
          personnelMatchStatus = 'matched';
          console.log(`✅ Personnel matched: ${matches[0].name} (ID: ${personnelId})`);
        } else {
          personnelMatchStatus = 'no_match';
          console.log(`⚠️ No personnel match found for: ${fullName}`);
        }
      }
    }
    
    // 8. Update the verified columns in place with enhanced audit metadata, personnel link, and extracted document type
    const auditTimestamp = new Date().toISOString();
    const updatePayload: any = {
      status: finalStatus,
      document_type: extractedDocumentType, // Save AI-extracted document type to database
      metadata: {
        ...(typeof docRecord.metadata === 'object' ? docRecord.metadata : {}),
        auditedAt: auditTimestamp,
        notes: finalStatus === 'approved'
          ? 'Automated AI legal compliance scan passed.'
          : `AI analysis flagged: ${auditReport.corrective_action || 'Compliance issues detected'}`,
        pre_validation_result: 'passed',
        keywords_detected: [],
        audit_run_at: auditTimestamp,
        compliance_status: auditReport.compliance_status,
        regulatory_code_violated: auditReport.regulatory_code_violated || 'None',
        corrective_action: auditReport.corrective_action || 'None',
        extracted_personnel_name: auditReport.extracted_personnel_name || null,
        personnel_match_status: personnelMatchStatus
      }
    };
    
    // Add personnel_id if matched
    if (personnelId) {
      updatePayload.personnel_id = personnelId;
    }
    
    const { error: updateError } = await supabase
      .from('facility_documents')
      .update(updatePayload)
      .eq('id', documentId);

    if (updateError) throw updateError;

    // 9. Auto-Update Personnel Clearance Status if document is approved and linked to personnel
    if (finalStatus === 'approved' && personnelId) {
      console.log(`🔄 Auto-updating personnel clearance status for personnel_id: ${personnelId}`);
      
      const { error: personnelUpdateError } = await supabase
        .from('personnel')
        .update({ clearance_status: 'approved' })
        .eq('id', personnelId);
      
      if (personnelUpdateError) {
        console.error('❌ Error updating personnel clearance status:', personnelUpdateError);
      } else {
        console.log(`✅ Personnel ${personnelId} clearance status automatically updated to 'approved'`);
      }
    }

    console.log(`✅ Pipeline Success: Document ${documentId} completely verified.`);
    
    // Include personnel match info in response
    return {
      success: true,
      status: finalStatus,
      report: auditReport,
      personnelMatched: personnelMatchStatus === 'matched',
      personnelName: auditReport.extracted_personnel_name || null
    };

  } catch (error: any) {
    console.error(`❌ Action Failure: Unable to process document audit link:`, error.message);
    
    // Fall back safely to flagged status so it surfaces for manual review instead of hanging
    const supabase = createAdminClient();
    await supabase
      .from('facility_documents')
      .update({
        status: 'flagged',
        metadata: { system_processing_error: error.message }
      })
      .eq('id', documentId);

    return { success: false, error: error.message };
  }
}

/**
 * Fetches all active personnel records for a specific facility.
 * Returns employee roster with clearance tracking data.
 * Filters out separated/inactive employees to show only current staff.
 * SECURITY: Verifies facility belongs to authenticated user's organization.
 */
export async function getPersonnelData(facilityId: string) {
  try {
    // 1. Authenticate user and verify facility ownership
    const { orgId } = await getAuthenticatedUserContext();
    const supabase = createAdminClient();
    
    const { data: facility, error: facilityError } = await supabase
      .from('facilities')
      .select('id, org_id')
      .eq('id', facilityId)
      .eq('org_id', orgId)
      .single();
    
    if (facilityError || !facility) {
      console.error('❌ Unauthorized facility access attempt:', facilityError);
      return [];
    }
    
    // 2. Fetch personnel data for verified facility
    const { data, error } = await supabase
      .from('personnel')
      .select('id, name, role, clearance_status, hire_date, created_at, status')
      .eq('facility_id', facilityId)
      .eq('status', 'active') // Only fetch active employees
      .order('hire_date', { ascending: false });

    if (error) {
      console.error('❌ Error fetching personnel data:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('❌ Exception in getPersonnelData:', error);
    return [];
  }
}

/**
 * Marks an employee as separated/inactive without deleting the record.
 * Preserves historical data while removing from active roster.
 * SECURITY: Verifies personnel belongs to a facility in user's organization.
 */
export async function markEmployeeSeparated(personnelId: string) {
  try {
    // 1. Authenticate user and get their organization context
    const { orgId } = await getAuthenticatedUserContext();
    const supabase = createAdminClient();
    
    // 2. Verify personnel belongs to a facility in user's organization
    const { data: personnel, error: personnelError } = await supabase
      .from('personnel')
      .select('id, facility_id, facilities!inner(org_id)')
      .eq('id', personnelId)
      .single();
    
    if (personnelError || !personnel) {
      console.error('❌ Personnel not found:', personnelError);
      return { success: false, error: 'Personnel record not found' };
    }
    
    // @ts-expect-error - Supabase join syntax
    if (personnel.facilities?.org_id !== orgId) {
      console.error('❌ Unauthorized personnel access attempt');
      return { success: false, error: 'Unauthorized: Personnel does not belong to your organization' };
    }
    
    // 3. Mark employee as separated
    const { error } = await supabase
      .from('personnel')
      .update({
        status: 'separated',
        separation_date: new Date().toISOString()
      })
      .eq('id', personnelId);

    if (error) {
      console.error('❌ Error marking employee as separated:', error);
      return { success: false, error: error.message };
    }

    console.log(`✅ Employee ${personnelId} marked as separated`);
    return { success: true };
  } catch (error: any) {
    console.error('❌ Exception in markEmployeeSeparated:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Fetches all separated/archived personnel records for a specific facility.
 * Returns historical employee roster for archive view.
 * SECURITY: Verifies facility belongs to authenticated user's organization.
 */
export async function getSeparatedPersonnelData(facilityId: string) {
  try {
    // 1. Authenticate user and verify facility ownership
    const { orgId } = await getAuthenticatedUserContext();
    const supabase = createAdminClient();
    
    const { data: facility, error: facilityError } = await supabase
      .from('facilities')
      .select('id, org_id')
      .eq('id', facilityId)
      .eq('org_id', orgId)
      .single();
    
    if (facilityError || !facility) {
      console.error('❌ Unauthorized facility access attempt:', facilityError);
      return [];
    }
    
    // 2. Fetch separated personnel data for verified facility
    const { data, error } = await supabase
      .from('personnel')
      .select('id, name, role, clearance_status, hire_date, created_at, status, separation_date')
      .eq('facility_id', facilityId)
      .eq('status', 'separated') // Only fetch separated employees
      .order('separation_date', { ascending: false });

    if (error) {
      console.error('❌ Error fetching separated personnel data:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('❌ Exception in getSeparatedPersonnelData:', error);
    return [];
  }
}

/**
 * Fetches all facility documents for a specific facility.
 * Returns document records with status and metadata.
 * SECURITY: Verifies facility belongs to authenticated user's organization.
 */
export async function getDocumentsData(facilityId: string) {
  try {
    // 1. Authenticate user and verify facility ownership
    const { orgId } = await getAuthenticatedUserContext();
    const supabase = createAdminClient();
    
    const { data: facility, error: facilityError } = await supabase
      .from('facilities')
      .select('id, org_id')
      .eq('id', facilityId)
      .eq('org_id', orgId)
      .single();
    
    if (facilityError || !facility) {
      console.error('❌ Unauthorized facility access attempt:', facilityError);
      return [];
    }
    
    // 2. Fetch documents data for verified facility
    const { data, error } = await supabase
      .from('facility_documents')
      .select('id, name, document_type, status, file_url, metadata, created_at')
      .eq('facility_id', facilityId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching documents data:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('❌ Exception in getDocumentsData:', error);
    return [];
  }
}

/**
 * Fetches all facilities with their compliance data for the master view.
 * Returns aggregated fleet overview with real-time compliance scores.
 * SECURITY: Filters facilities by authenticated user's organization.
 */
export async function getAllFacilitiesOverview() {
  try {
    // 1. Authenticate user and get their organization context
    const { orgId } = await getAuthenticatedUserContext();
    const supabase = createAdminClient();
    
    // 2. Fetch all facilities belonging to user's organization
    const { data: facilities, error } = await supabase
      .from('facilities')
      .select('id, name, facility_type, sub_classification, capacity')
      .eq('org_id', orgId) // Multi-tenant isolation filter
      .order('name', { ascending: true });

    if (error) {
      console.error('❌ Error fetching facilities:', error);
      return [];
    }

    if (!facilities || facilities.length === 0) {
      return [];
    }

    // 3. Fetch compliance data for each facility in parallel
    // Note: getFacilityComplianceData already has auth checks, but we've pre-filtered
    const facilitiesWithCompliance = await Promise.all(
      facilities.map(async (facility) => {
        try {
          const complianceData = await getFacilityComplianceData(facility.id);
          return {
            ...facility,
            complianceScore: complianceData.score,
            totalPersonnel: complianceData.totalPersonnel,
            gapsCount: complianceData.gaps.length
          };
        } catch (error) {
          console.error(`❌ Error fetching compliance for facility ${facility.id}:`, error);
          return {
            ...facility,
            complianceScore: 0,
            totalPersonnel: 0,
            gapsCount: 0
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
 * Toggles a user's account status between active and deactivated.
 * SECURITY: Only organization owners and admins can modify user account statuses.
 * Enforces same-organization verification to prevent cross-tenant administration attacks.
 */
export async function toggleUserStatus(
  targetUserId: string,
  newStatus: 'active' | 'deactivated'
) {
  try {
    // 1. Authenticate caller and get their organization context
    const { orgId, role } = await getAuthenticatedUserContext();
    
    // 2. Enforce role-based access control - only owners and admins can modify user statuses
    if (role !== 'owner' && role !== 'admin') {
      console.error('❌ Unauthorized role attempting to modify user status:', role);
      return {
        success: false,
        error: 'Unauthorized: Only organization owners can modify user account statuses.'
      };
    }
    
    const supabase = createAdminClient();
    
    // 3. Verify target user belongs to the same organization (prevent cross-tenant attacks)
    const { data: targetProfile, error: targetError } = await supabase
      .from('profiles')
      .select('id, org_id, account_status')
      .eq('id', targetUserId)
      .single();
    
    if (targetError || !targetProfile) {
      console.error('❌ Target user profile not found:', targetError);
      return {
        success: false,
        error: 'User not found or profile incomplete'
      };
    }
    
    // 4. Verify same organization (critical security check)
    if (targetProfile.org_id !== orgId) {
      console.error('❌ Cross-tenant administration attack attempt blocked');
      return {
        success: false,
        error: 'Unauthorized: Cannot modify users from other organizations'
      };
    }
    
    // 5. Update target user's account status
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ account_status: newStatus })
      .eq('id', targetUserId);
    
    if (updateError) {
      console.error('❌ Error updating user account status:', updateError);
      return {
        success: false,
        error: 'Failed to update account status'
      };
    }
    
    console.log(`✅ User ${targetUserId} account status updated to: ${newStatus}`);
    return {
      success: true,
      message: `Account ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully`
    };
    
  } catch (error: any) {
    console.error('❌ Exception in toggleUserStatus:', error);
    return {
      success: false,
      error: error.message || 'Failed to update user status'
    };
  }
}

/**
 * Get available personnel roles for a facility based on its classification.
 * Pulls from AI-discovered regulatory_roles table.
 */
export async function getAvailableRoles(facilityId: string) {
  try {
    // 1. Authenticate user and get their organization context
    const { orgId } = await getAuthenticatedUserContext();
    
    // 2. Verify facility belongs to user's organization and get classification
    const supabase = createAdminClient();
    const { data: facility, error: facilityError } = await supabase
      .from('facilities')
      .select('id, org_id, facility_type, sub_classification')
      .eq('id', facilityId)
      .eq('org_id', orgId)
      .single();
    
    if (facilityError || !facility) {
      throw new Error('Unauthorized: Facility not found or does not belong to your organization');
    }
    
    const facilityType = facility.facility_type;
    const subClassification = facility.sub_classification;
    
    // 3. Query regulatory_roles table for applicable roles
    let rolesQuery = supabase
      .from('regulatory_roles')
      .select('role_name')
      .eq('facility_type', facilityType);
    
    // Add sub-classification filter if available
    if (subClassification) {
      rolesQuery = rolesQuery.eq('sub_classification', subClassification);
    }
    
    const { data: roles, error: rolesError } = await rolesQuery;
    
    if (rolesError) {
      console.error('❌ Error querying regulatory_roles:', rolesError);
      return { success: false, error: 'Failed to fetch available roles', roles: [] };
    }
    
    // Extract unique role names
    const roleNames = Array.from(new Set((roles || []).map(r => r.role_name))).sort();
    
    console.log(`✅ Found ${roleNames.length} applicable roles for ${facilityType}${subClassification ? ` (${subClassification})` : ''}`);
    
    return { success: true, roles: roleNames };
  } catch (error) {
    console.error("❌ Error fetching available roles:", error);
    return { success: false, error: 'An unexpected error occurred', roles: [] };
  }
}

/**
 * Add a new personnel member to a facility with attestation tracking.
 */
export async function addPersonnel(
  facilityId: string,
  personnelData: {
    name: string;
    role: string;
    hire_date: string;
    attestation_frequency: 'annual' | 'biannual' | 'quarterly' | 'monthly';
  }
) {
  try {
    // 1. Authenticate user and verify facility ownership
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
    
    // 2. Calculate next attestation date based on frequency
    const hireDate = new Date(personnelData.hire_date);
    const nextAttestationDate = new Date(hireDate);
    
    switch (personnelData.attestation_frequency) {
      case 'monthly':
        nextAttestationDate.setMonth(nextAttestationDate.getMonth() + 1);
        break;
      case 'quarterly':
        nextAttestationDate.setMonth(nextAttestationDate.getMonth() + 3);
        break;
      case 'biannual':
        nextAttestationDate.setMonth(nextAttestationDate.getMonth() + 6);
        break;
      case 'annual':
        nextAttestationDate.setFullYear(nextAttestationDate.getFullYear() + 1);
        break;
    }
    
    // 3. Insert personnel record with attestation tracking
    const { data: newPersonnel, error: insertError } = await supabase
      .from('personnel')
      .insert({
        facility_id: facilityId,
        name: personnelData.name,
        role: personnelData.role,
        hire_date: personnelData.hire_date,
        status: 'active',
        clearance_status: 'pending',
        attestation_frequency: personnelData.attestation_frequency,
        next_attestation_date: nextAttestationDate.toISOString().split('T')[0],
        last_attestation_date: null
      })
      .select()
      .single();
    
    if (insertError) {
      console.error('❌ Error inserting personnel:', insertError);
      return { success: false, error: 'Failed to add personnel member' };
    }
    
    console.log(`✅ Successfully added personnel: ${personnelData.name} (${personnelData.role})`);
    
    return { success: true, personnel: newPersonnel };
  } catch (error) {
    console.error("❌ Error adding personnel:", error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}