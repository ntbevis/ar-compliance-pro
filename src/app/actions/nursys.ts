'use server';

import { createClient } from 'src/app/utils/supabase/server';
import { createAdminClient } from 'src/app/utils/supabase/admin';
import { revalidatePath } from 'next/cache';
import {
  isNursysConfigured,
  submitManageNurseList,
  getManageNurseList,
  submitNurseLookup,
  getNurseLookup,
  interpretLicense,
  pickMatchingLicense,
} from '@/lib/nursys';

/** Public-facing status for the UI. */
export type NurseVerificationStatus =
  | 'enroll_submitted'
  | 'lookup_submitted'
  | 'verified'
  | 'expired'
  | 'action_required'
  | 'not_found'
  | 'failed';

interface VerificationView {
  id: string;
  status: NurseVerificationStatus;
  licenseStatus?: string | null;
  licenseExpiration?: string | null;
  ncsbnId?: string | null;
  errorMessage?: string | null;
}

async function getCtx() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('Unauthorized: please sign in.');
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('org_id, role')
    .eq('id', session.user.id)
    .single();
  if (!profile?.org_id) throw new Error('Unauthorized: no organization on profile.');
  return { userId: session.user.id, orgId: profile.org_id as string, admin };
}

async function assertFacilityInOrg(
  admin: ReturnType<typeof createAdminClient>,
  facilityId: string,
  orgId: string
) {
  const { data, error } = await admin
    .from('facilities')
    .select('id')
    .eq('id', facilityId)
    .eq('org_id', orgId)
    .single();
  if (error || !data) {
    throw new Error('Unauthorized: facility not found or not in your organization.');
  }
}

export interface EnrollNurseParams {
  facilityId: string;
  personnelId: string;
  requirementId: string;
  typeKey: string;
  licenseType: string; // RN | PN | CNP | CNS | CNM | CRNA
  jurisdiction: string; // license issuing state (board), e.g. "AR"
  licenseNumber: string;
  address1: string;
  address2?: string;
  city: string;
  state: string; // employment address state
  zip: string;
  lastFourSSN: string;
  birthYear: string;
  email?: string;
}

/**
 * Step 1: enroll the nurse on the Nursys nurse list (ManageNurseList POST).
 * PII (SSN-4, birth year, address) is passed through to Nursys and NOT stored.
 */
export async function enrollAndVerifyNurse(
  params: EnrollNurseParams
): Promise<{ success: true; verification: VerificationView } | { success: false; error: string }> {
  try {
    if (!isNursysConfigured()) {
      return {
        success: false,
        error: 'License verification is not configured yet. Please contact your administrator.',
      };
    }

    const { userId, orgId, admin } = await getCtx();
    await assertFacilityInOrg(admin, params.facilityId, orgId);

    // Basic input validation before paying for an API call.
    if (!/^\d{4}$/.test(params.lastFourSSN)) {
      return { success: false, error: 'Last 4 digits of SSN must be exactly 4 digits.' };
    }
    if (!/^\d{4}$/.test(params.birthYear)) {
      return { success: false, error: 'Birth year must be a 4-digit year.' };
    }
    if (!params.licenseNumber.trim() || !params.jurisdiction || !params.licenseType) {
      return { success: false, error: 'License number, issuing state, and license type are required.' };
    }

    const submit = await submitManageNurseList({
      submissionActionCode: 'A',
      jurisdiction: params.jurisdiction,
      licenseNumber: params.licenseNumber.trim(),
      licenseType: params.licenseType,
      email: params.email,
      address1: params.address1,
      address2: params.address2,
      city: params.city,
      state: params.state,
      zip: params.zip,
      lastFourSSN: params.lastFourSSN,
      birthYear: params.birthYear,
      recordId: params.personnelId,
    });

    if (!submit.ok) {
      return { success: false, error: `Nursys enrollment failed: ${submit.error}` };
    }

    const { data: row, error } = await admin
      .from('nursys_verifications')
      .insert({
        facility_id: params.facilityId,
        personnel_id: params.personnelId ? Number(params.personnelId) : null,
        requirement_id: params.requirementId || null,
        status: 'enroll_submitted',
        enroll_transaction_id: submit.transactionId,
        jurisdiction: params.jurisdiction,
        license_type: params.licenseType,
        license_number: params.licenseNumber.trim(),
        created_by: userId,
      })
      .select('id, status, license_status, license_expiration, ncsbn_id, error_message')
      .single();

    if (error || !row) {
      return { success: false, error: 'Could not record the verification request.' };
    }

    return { success: true, verification: toView(row) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error.' };
  }
}

/**
 * Step 2+: advance an in-flight verification through the async state machine.
 * Safe to call repeatedly (polling). Returns the current status.
 */
export async function advanceNurseVerification(
  verificationId: string,
  typeKey?: string
): Promise<{ success: true; verification: VerificationView } | { success: false; error: string }> {
  try {
    if (!isNursysConfigured()) {
      return { success: false, error: 'License verification is not configured.' };
    }
    const { userId, orgId, admin } = await getCtx();

    const { data: v, error: vErr } = await admin
      .from('nursys_verifications')
      .select('*')
      .eq('id', verificationId)
      .single();
    if (vErr || !v) return { success: false, error: 'Verification not found.' };
    await assertFacilityInOrg(admin, v.facility_id as string, orgId);

    // Terminal states: nothing to advance.
    if (['verified', 'expired', 'not_found', 'failed'].includes(v.status as string)) {
      return { success: true, verification: toView(v) };
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (v.status === 'enroll_submitted') {
      const poll = await getManageNurseList(v.enroll_transaction_id as string);
      if (!poll.ok) return { success: false, error: poll.error };
      if (!poll.processingComplete) return { success: true, verification: toView(v) };
      if (!poll.recordSuccess) {
        patch.status = 'failed';
        patch.error_message = poll.error ?? 'Enrollment rejected.';
        return await finalize(admin, verificationId, patch);
      }
      // Enrollment done -> kick off the lookup.
      const lookup = await submitNurseLookup({
        jurisdiction: v.jurisdiction as string,
        licenseNumber: v.license_number as string,
        licenseType: v.license_type as string,
        recordId: v.personnel_id != null ? String(v.personnel_id) : undefined,
      });
      if (!lookup.ok) {
        patch.status = 'failed';
        patch.error_message = `Lookup submission failed: ${lookup.error}`;
        return await finalize(admin, verificationId, patch);
      }
      patch.status = 'lookup_submitted';
      patch.lookup_transaction_id = lookup.transactionId;
      return await finalize(admin, verificationId, patch);
    }

    if (v.status === 'lookup_submitted') {
      const poll = await getNurseLookup(v.lookup_transaction_id as string);
      if (!poll.ok) return { success: false, error: poll.error };
      if (!poll.processingComplete) return { success: true, verification: toView(v) };

      if (!poll.found || poll.licenses.length === 0) {
        patch.status = 'not_found';
        patch.error_message =
          poll.messages[0] ??
          'Nursys could not locate this license. Verify the number/state, or upload the document instead.';
        if (poll.ncsbnId) patch.ncsbn_id = poll.ncsbnId;
        return await finalize(admin, verificationId, patch);
      }

      const license = pickMatchingLicense(
        poll.licenses,
        v.jurisdiction as string,
        v.license_type as string,
        v.license_number as string
      );
      if (!license) {
        patch.status = 'not_found';
        patch.error_message = 'No matching license found in the Nursys result.';
        return await finalize(admin, verificationId, patch);
      }

      const { outcome, expiration } = interpretLicense(license);
      patch.ncsbn_id = poll.ncsbnId ?? null;
      patch.license_status = license.LicenseStatus ?? null;
      patch.license_expiration = expiration;
      patch.result = {
        licenseType: license.LicenseType,
        jurisdiction: license.JurisdictionAbbreviation,
        licenseNumber: license.LicenseNumber,
        active: license.Active,
        licenseStatus: license.LicenseStatus,
        compactStatus: license.CompactStatus,
        expiration,
      };

      if (outcome === 'verified') {
        // Write the authoritative, verified compliance document.
        const documentId = crypto.randomUUID();
        await admin.from('facility_documents').insert({
          id: documentId,
          facility_id: v.facility_id,
          document_type: typeKey ?? (v.license_type as string),
          status: 'approved',
          file_url: 'verified_via_nursys',
          name: `${v.jurisdiction} ${v.license_type} License – ${String(v.license_number).toUpperCase()} (Nursys Verified)`,
          expires_at: expiration,
          metadata: {
            upload_source: 'nursys',
            personnel_id: v.personnel_id != null ? String(v.personnel_id) : null,
            license_number: String(v.license_number).toUpperCase(),
            license_state: v.jurisdiction,
            verified_status: license.LicenseStatus ?? 'UNENCUMBERED',
            ncsbn_id: poll.ncsbnId ?? null,
            ai_extracted_expiration: expiration,
          },
        });
        patch.document_id = documentId;
        patch.status = 'verified';

        await admin.from('audit_logs').insert({
          facility_id: v.facility_id,
          user_id: userId,
          action_type: 'license_verified',
          metadata: {
            source: 'nursys',
            personnel_id: v.personnel_id != null ? String(v.personnel_id) : null,
            requirement_id: v.requirement_id,
            document_id: documentId,
            ncsbn_id: poll.ncsbnId ?? null,
            license_status: license.LicenseStatus,
            expiration_date: expiration,
          },
        });
        revalidatePath('/dashboard');
      } else {
        // expired | action_required — record the finding; do not create a passing doc.
        patch.status = outcome;
        patch.error_message =
          outcome === 'expired'
            ? 'Nursys reports this license as EXPIRED.'
            : `Nursys reports a status needing review: ${license.LicenseStatus ?? 'unknown'}.`;
      }
      return await finalize(admin, verificationId, patch);
    }

    return { success: true, verification: toView(v) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error.' };
  }
}

/** Returns the most recent verification for a person+requirement, if any. */
export async function getLatestNurseVerification(
  facilityId: string,
  personnelId: string,
  requirementId: string
): Promise<VerificationView | null> {
  try {
    const { orgId, admin } = await getCtx();
    await assertFacilityInOrg(admin, facilityId, orgId);
    const { data } = await admin
      .from('nursys_verifications')
      .select('id, status, license_status, license_expiration, ncsbn_id, error_message')
      .eq('facility_id', facilityId)
      .eq('personnel_id', Number(personnelId))
      .eq('requirement_id', requirementId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ? toView(data) : null;
  } catch {
    return null;
  }
}

async function finalize(
  admin: ReturnType<typeof createAdminClient>,
  id: string,
  patch: Record<string, unknown>
): Promise<{ success: true; verification: VerificationView }> {
  const { data } = await admin
    .from('nursys_verifications')
    .update(patch)
    .eq('id', id)
    .select('id, status, license_status, license_expiration, ncsbn_id, error_message')
    .single();
  return { success: true, verification: toView(data) };
}

function toView(row: Record<string, unknown> | null): VerificationView {
  return {
    id: (row?.id as string) ?? '',
    status: (row?.status as NurseVerificationStatus) ?? 'failed',
    licenseStatus: (row?.license_status as string) ?? null,
    licenseExpiration: (row?.license_expiration as string) ?? null,
    ncsbnId: (row?.ncsbn_id as string) ?? null,
    errorMessage: (row?.error_message as string) ?? null,
  };
}
