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
  changeNursysPassword,
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
  return {
    userId: session.user.id,
    orgId: profile.org_id as string,
    role: (profile.role as string) ?? null,
    admin,
  };
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
        type_key: params.typeKey,
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
  verificationId: string
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

    const verification = await advanceVerificationRow(admin, v, userId);
    return { success: true, verification };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error.' };
  }
}

/**
 * Core async state machine for ONE verification row: enroll -> lookup -> final.
 * Performs NO auth/ownership checks — callers (the user action OR the cron
 * poller) must gate access first. `userId` is null for the unattended cron path.
 * Network/processing hiccups return the row unchanged so the next poll retries.
 */
async function advanceVerificationRow(
  admin: ReturnType<typeof createAdminClient>,
  v: Record<string, unknown>,
  userId: string | null
): Promise<VerificationView> {
  const status = v.status as string;
  if (['verified', 'expired', 'not_found', 'failed'].includes(status)) {
    return toView(v);
  }

  const id = v.id as string;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (status === 'enroll_submitted') {
    const poll = await getManageNurseList(v.enroll_transaction_id as string);
    if (!poll.ok || !poll.processingComplete) return toView(v);
    if (!poll.recordSuccess) {
      patch.status = 'failed';
      patch.error_message = poll.error ?? 'Enrollment rejected.';
      return applyPatch(admin, id, patch);
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
      return applyPatch(admin, id, patch);
    }
    patch.status = 'lookup_submitted';
    patch.lookup_transaction_id = lookup.transactionId;
    return applyPatch(admin, id, patch);
  }

  // status === 'lookup_submitted'
  const poll = await getNurseLookup(v.lookup_transaction_id as string);
  if (!poll.ok || !poll.processingComplete) return toView(v);

  if (!poll.found || poll.licenses.length === 0) {
    patch.status = 'not_found';
    patch.error_message =
      poll.messages[0] ??
      'Nursys could not locate this license. Verify the number/state, or upload the document instead.';
    if (poll.ncsbnId) patch.ncsbn_id = poll.ncsbnId;
    return applyPatch(admin, id, patch);
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
    return applyPatch(admin, id, patch);
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
    const documentId = crypto.randomUUID();
    // document_type MUST equal the requirement's typeKey to satisfy it.
    const documentType = (v.type_key as string) || (v.license_type as string);
    await admin.from('facility_documents').insert({
      id: documentId,
      facility_id: v.facility_id,
      document_type: documentType,
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

    // Audit (best-effort; never block the verification on an audit write).
    try {
      await admin.from('audit_logs').insert({
        facility_id: v.facility_id,
        user_id: userId,
        action_type: 'license_verified',
        metadata: {
          source: userId ? 'nursys' : 'nursys_cron',
          personnel_id: v.personnel_id != null ? String(v.personnel_id) : null,
          requirement_id: v.requirement_id,
          document_id: documentId,
          ncsbn_id: poll.ncsbnId ?? null,
          license_status: license.LicenseStatus,
          expiration_date: expiration,
        },
      });
    } catch {
      /* ignore audit failure */
    }
    revalidatePath('/dashboard');
  } else {
    // expired | action_required — record the finding; do not create a passing doc.
    patch.status = outcome;
    patch.error_message =
      outcome === 'expired'
        ? 'Nursys reports this license as EXPIRED.'
        : `Nursys reports a status needing review: ${license.LicenseStatus ?? 'unknown'}.`;
  }
  return applyPatch(admin, id, patch);
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

async function applyPatch(
  admin: ReturnType<typeof createAdminClient>,
  id: string,
  patch: Record<string, unknown>
): Promise<VerificationView> {
  const { data } = await admin
    .from('nursys_verifications')
    .update(patch)
    .eq('id', id)
    .select('id, status, license_status, license_expiration, ncsbn_id, error_message')
    .single();
  return toView(data);
}

// =============================================================================
// PHASE 2 — server-side polling, password rotation, alerting
// =============================================================================

const ROTATE_EVERY_DAYS = 80; // Nursys expires passwords at 90; rotate early.

/**
 * Service-role poller (no user context) invoked by the cron route. Advances
 * every in-flight verification so results finalize even when no browser tab is
 * open. Each row is isolated so one failure can't abort the batch.
 */
export async function pollPendingVerifications(): Promise<{ processed: number; advanced: number }> {
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from('nursys_verifications')
    .select('*')
    .in('status', ['enroll_submitted', 'lookup_submitted'])
    .order('created_at', { ascending: true })
    .limit(200);

  let advanced = 0;
  for (const v of rows ?? []) {
    try {
      const before = v.status as string;
      const after = await advanceVerificationRow(admin, v, null);
      if (after.status !== before) advanced += 1;
    } catch {
      /* isolate per-row errors; the next sweep retries */
    }
  }

  await admin
    .from('nursys_integration_state')
    .update({ last_poll_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', true);

  return { processed: rows?.length ?? 0, advanced };
}

/** RFC-safe strong password meeting Nursys rules (upper+lower+digit, 8-50). */
function generateStrongPassword(): string {
  const alnum = Buffer.from(crypto.getRandomValues(new Uint8Array(36)))
    .toString('base64')
    .replace(/[^a-zA-Z0-9]/g, '');
  // Prefix guarantees the required character classes regardless of the random tail.
  return ('Aa1' + alnum).slice(0, 40);
}

/**
 * Rotates the Nursys API password if it's older than ROTATE_EVERY_DAYS (or
 * forced). Changes it at Nursys first, then persists the new value to Vault so
 * the app picks it up with no redeploy. Alerts on failure. Service-role only.
 */
export async function rotateNursysPassword(
  opts?: { force?: boolean }
): Promise<{ rotated: boolean; reason?: string; error?: string }> {
  const admin = createAdminClient();

  if (!isNursysConfigured()) {
    return { rotated: false, error: 'Nursys is not configured (missing base URL/username).' };
  }

  const { data: state } = await admin
    .from('nursys_integration_state')
    .select('password_rotated_at')
    .eq('id', true)
    .maybeSingle();

  const rotatedAt = state?.password_rotated_at ? new Date(state.password_rotated_at).getTime() : 0;
  const ageDays = rotatedAt ? (Date.now() - rotatedAt) / 86_400_000 : Infinity;
  if (!opts?.force && ageDays < ROTATE_EVERY_DAYS) {
    return { rotated: false, reason: `not due (password age ${Math.floor(ageDays)}d)` };
  }

  const newPassword = generateStrongPassword();

  // 1) Change it at Nursys (authenticates with the CURRENT password).
  const changed = await changeNursysPassword(newPassword);
  if (!changed.ok) {
    await recordIntegrationAlert(admin, {
      severity: 'critical',
      message: `Nursys password rotation FAILED at the API: ${changed.error}`,
      context: { ageDays: Math.floor(ageDays) },
    });
    await admin
      .from('nursys_integration_state')
      .update({
        last_rotation_status: 'failed',
        last_rotation_error: changed.error ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', true);
    return { rotated: false, error: changed.error };
  }

  // 2) Persist the new password to Vault so verification calls use it.
  const { error: setErr } = await admin.rpc('set_nursys_password', { new_secret: newPassword });
  if (setErr) {
    await recordIntegrationAlert(admin, {
      severity: 'critical',
      message:
        `Nursys password was CHANGED at the API but FAILED to save to Vault: ${setErr.message}. ` +
        `Verification will break until the password is re-stored manually.`,
      context: {},
    });
    return { rotated: false, error: `Vault store failed: ${setErr.message}` };
  }

  await admin
    .from('nursys_integration_state')
    .update({
      password_rotated_at: new Date().toISOString(),
      last_rotation_status: 'success',
      last_rotation_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', true);

  await recordIntegrationAlert(admin, {
    severity: 'info',
    message: 'Nursys API password rotated successfully.',
    context: { previousAgeDays: Number.isFinite(ageDays) ? Math.floor(ageDays) : null },
  });

  return { rotated: true };
}

/**
 * Records a system alert and (for warning/error/critical) emails the platform
 * admin via Resend when RESEND_API_KEY is configured; otherwise it's a no-op
 * email-wise (the row is still written for the in-app admin view).
 */
async function recordIntegrationAlert(
  admin: ReturnType<typeof createAdminClient>,
  alert: { severity: 'info' | 'warning' | 'error' | 'critical'; message: string; context?: Record<string, unknown> }
): Promise<void> {
  try {
    await admin.from('integration_alerts').insert({
      integration: 'nursys',
      severity: alert.severity,
      message: alert.message,
      context: alert.context ?? null,
    });
  } catch {
    /* never throw from the alert path */
  }

  if (alert.severity === 'info') return;

  const resendKey = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_ADMIN_EMAIL ?? 'nolan@complianceguardpro.io';
  const from = process.env.ALERT_FROM_EMAIL ?? 'Compliance Guard <onboarding@resend.dev>';
  if (!resendKey) return; // dry run — row already written for the admin view

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to,
        subject: `[${alert.severity.toUpperCase()}] Nursys integration alert`,
        html: `<p>${alert.message}</p><pre style="background:#f1f5f9;padding:8px;border-radius:6px">${JSON.stringify(
          alert.context ?? {},
          null,
          2
        )}</pre>`,
      }),
    });
  } catch {
    /* email is best-effort */
  }
}

/** Admin read of recent integration alerts (owner-only). */
export async function getIntegrationAlerts(
  limit = 25
): Promise<{ success: boolean; alerts?: Array<Record<string, unknown>>; error?: string }> {
  try {
    const { role, admin } = await getCtx();
    if (role !== 'owner') return { success: false, error: 'Forbidden.' };
    const { data } = await admin
      .from('integration_alerts')
      .select('id, integration, severity, message, context, created_at, resolved_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    return { success: true, alerts: data ?? [] };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error.' };
  }
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
