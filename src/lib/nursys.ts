/**
 * Nursys e-Notify JSON API client (spec v3.1.5).
 *
 * Auth: `username` + `password` HTTP headers over HTTPS (read from env only —
 * the password never lives in code or git). The API is asynchronous: you POST a
 * batch and receive a TransactionId, then GET with that id to retrieve results
 * (recommended ~5 min wait; processing must complete within 20 min).
 *
 * Phase 1 reads the password from NURSYS_API_PASSWORD. Phase 2 will move the
 * (rotating) password into Supabase Vault and swap the source here.
 */

const RAW_BASE_URL = process.env.NURSYS_API_BASE_URL ?? '';
const API_USERNAME = process.env.NURSYS_API_USERNAME ?? '';
const API_PASSWORD = process.env.NURSYS_API_PASSWORD ?? '';

/** Normalized base URL guaranteed to end with a single slash. */
const BASE_URL = RAW_BASE_URL.replace(/\/+$/, '') + '/';

const REQUEST_TIMEOUT_MS = 30_000;

/** Valid Nursys license-type codes (Appendix A.2). */
export const NURSYS_LICENSE_TYPES = {
  RN: 'Registered Nurse',
  PN: 'Practical/Vocational Nurse (LPN/LVN)',
  CNP: 'Certified Nurse Practitioner (APRN)',
  CNS: 'Clinical Nurse Specialist (APRN)',
  CNM: 'Certified Nurse Midwife (APRN)',
  CRNA: 'Certified Registered Nurse Anesthetist (APRN)',
} as const;

export type NursysLicenseType = keyof typeof NURSYS_LICENSE_TYPES;

export function isNursysConfigured(): boolean {
  return Boolean(BASE_URL.length > 1 && API_USERNAME && API_PASSWORD);
}

// --- Wire types (subset of the spec we consume) ------------------------------
interface TransactionError {
  ErrorId?: number;
  ErrorMessage?: string;
}
interface Transaction {
  TransactionId?: string;
  TransactionSuccessFlag?: boolean;
  TransactionComment?: string;
  TransactionErrors?: TransactionError[];
}

export interface NursysLicense {
  LicenseType?: string;
  JurisdictionAbbreviation?: string;
  Jurisdiction?: string;
  LicenseNumber?: string;
  Active?: string;
  LicenseStatus?: string;
  LicenseOriginalDate?: string;
  LicenseExpirationDate?: string;
  CompactStatus?: string;
}

interface NurseLookupResponse {
  SuccessFlag?: boolean;
  Errors?: TransactionError[];
  NcsbnId?: number | string;
  FirstName?: string;
  LastName?: string;
  Messages?: Array<{ Message?: string }>;
  NurseLookupLicenses?: NursysLicense[];
}

export interface ManageNurseListInput {
  /** "A" = add/update, "R" = remove. */
  submissionActionCode: 'A' | 'R';
  jurisdiction: string;
  licenseNumber: string;
  licenseType: string;
  email?: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zip: string;
  lastFourSSN: string;
  birthYear: string | number;
  recordId?: string;
}

type SubmitResult =
  | { ok: true; transactionId: string }
  | { ok: false; error: string };

type EnrollPollResult =
  | { ok: true; processingComplete: false }
  | { ok: true; processingComplete: true; recordSuccess: boolean; error?: string }
  | { ok: false; error: string };

type LookupPollResult =
  | { ok: true; processingComplete: false }
  | { ok: true; processingComplete: true; found: boolean; licenses: NursysLicense[]; ncsbnId?: string; messages: string[] }
  | { ok: false; error: string };

function authHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    username: API_USERNAME,
    password: API_PASSWORD,
  };
}

async function nursysFetch(path: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${BASE_URL}${path}`, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function transactionError(t: Transaction | undefined): string | null {
  if (!t) return 'Empty response from Nursys.';
  if (t.TransactionSuccessFlag) return null;
  const first = t.TransactionErrors?.[0];
  return first?.ErrorMessage || t.TransactionComment || 'Nursys request failed.';
}

// --- Manage Nurse List (enrollment) ------------------------------------------
export async function submitManageNurseList(nurse: ManageNurseListInput): Promise<SubmitResult> {
  try {
    const body = {
      ManageNurseListRequests: [
        {
          SubmissionActionCode: nurse.submissionActionCode,
          JurisdictionAbbreviation: nurse.jurisdiction,
          LicenseNumber: nurse.licenseNumber,
          LicenseType: nurse.licenseType,
          NcsbnId: '',
          Email: nurse.email ?? '',
          Address1: nurse.address1,
          Address2: nurse.address2 ?? '',
          City: nurse.city,
          State: nurse.state,
          Zip: nurse.zip,
          LastFourSSN: nurse.lastFourSSN,
          BirthYear: String(nurse.birthYear),
          // Ignored for non-hospital institution types (our case).
          HospitalPracticeSetting: '',
          NotificationsEnabled: 'Y',
          RemindersEnabled: 'N',
          RecordId: nurse.recordId ?? '',
        },
      ],
    };
    const res = await nursysFetch('managenurselist', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { Transaction?: Transaction };
    const err = transactionError(json.Transaction);
    if (err) return { ok: false, error: err };
    return { ok: true, transactionId: json.Transaction!.TransactionId as string };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error contacting Nursys.' };
  }
}

export async function getManageNurseList(transactionId: string): Promise<EnrollPollResult> {
  try {
    const res = await nursysFetch(`managenurselist?transactionId=${encodeURIComponent(transactionId)}`, {
      method: 'GET',
      headers: authHeaders(),
    });
    const json = (await res.json()) as {
      ProcessingCompleteFlag?: boolean;
      Transaction?: Transaction;
      ManageNurseListResponses?: Array<{ SuccessFlag?: boolean; Errors?: TransactionError[] }>;
    };
    if (!json.ProcessingCompleteFlag) return { ok: true, processingComplete: false };
    const record = json.ManageNurseListResponses?.[0];
    const recordSuccess = Boolean(record?.SuccessFlag);
    return {
      ok: true,
      processingComplete: true,
      recordSuccess,
      error: recordSuccess ? undefined : record?.Errors?.[0]?.ErrorMessage || 'Enrollment was rejected by Nursys.',
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error contacting Nursys.' };
  }
}

// --- Nurse Lookup (verification) ---------------------------------------------
export async function submitNurseLookup(input: {
  jurisdiction: string;
  licenseNumber: string;
  licenseType: string;
  recordId?: string;
}): Promise<SubmitResult> {
  try {
    const body = {
      NurseLookupRequests: [
        {
          JurisdictionAbbreviation: input.jurisdiction,
          LicenseNumber: input.licenseNumber,
          LicenseType: input.licenseType,
          NcsbnId: '',
          RecordId: input.recordId ?? '',
        },
      ],
    };
    const res = await nursysFetch('nurselookup', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { Transaction?: Transaction };
    const err = transactionError(json.Transaction);
    if (err) return { ok: false, error: err };
    return { ok: true, transactionId: json.Transaction!.TransactionId as string };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error contacting Nursys.' };
  }
}

export async function getNurseLookup(transactionId: string): Promise<LookupPollResult> {
  try {
    const res = await nursysFetch(`nurselookup?transactionId=${encodeURIComponent(transactionId)}`, {
      method: 'GET',
      headers: authHeaders(),
    });
    const json = (await res.json()) as {
      ProcessingCompleteFlag?: boolean;
      NurseLookupResponses?: NurseLookupResponse[];
    };
    if (!json.ProcessingCompleteFlag) return { ok: true, processingComplete: false };
    const response = json.NurseLookupResponses?.[0];
    const found = Boolean(response?.SuccessFlag);
    return {
      ok: true,
      processingComplete: true,
      found,
      licenses: response?.NurseLookupLicenses ?? [],
      ncsbnId: response?.NcsbnId != null ? String(response.NcsbnId) : undefined,
      messages: (response?.Messages ?? []).map((m) => m.Message ?? '').filter(Boolean),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error contacting Nursys.' };
  }
}

// --- Change password (used by Phase 2 rotation) ------------------------------
export async function changeNursysPassword(newPassword: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await nursysFetch('changepassword', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ NewPassword: newPassword }),
    });
    const json = (await res.json()) as { Transaction?: Transaction };
    const err = transactionError(json.Transaction);
    return err ? { ok: false, error: err } : { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error contacting Nursys.' };
  }
}

/**
 * Interprets a Nursys license status string (Appendix A.8) + expiration into our
 * verification outcome. "UNENCUMBERED" = full unrestricted license to practice.
 */
export function interpretLicense(license: NursysLicense): {
  outcome: 'verified' | 'expired' | 'action_required';
  expiration: string | null;
} {
  const status = (license.LicenseStatus ?? '').toUpperCase();
  const expiration = license.LicenseExpirationDate
    ? new Date(license.LicenseExpirationDate).toISOString().split('T')[0]
    : null;

  if (status.includes('EXPIRED')) return { outcome: 'expired', expiration };

  const isExpiredByDate = expiration ? new Date(expiration).getTime() < Date.now() : false;

  // Clean, active license: unencumbered with no expiry in the past.
  if (status.includes('UNENCUMBERED') && !isExpiredByDate) {
    return { outcome: 'verified', expiration };
  }

  // Anything else (discipline, contact-board, undetermined, suppressed) needs a human.
  return { outcome: 'action_required', expiration };
}

/** Picks the license from a lookup result that matches the submitted credential. */
export function pickMatchingLicense(
  licenses: NursysLicense[],
  jurisdiction: string,
  licenseType: string,
  licenseNumber: string
): NursysLicense | null {
  if (licenses.length === 0) return null;
  const norm = (s: string | undefined) => (s ?? '').trim().toUpperCase().replace(/[\s.-]/g, '');
  const exact = licenses.find(
    (l) =>
      norm(l.JurisdictionAbbreviation) === norm(jurisdiction) &&
      norm(l.LicenseType) === norm(licenseType) &&
      norm(l.LicenseNumber) === norm(licenseNumber)
  );
  if (exact) return exact;
  // Fall back to a type+jurisdiction match (license number formatting can differ).
  return (
    licenses.find(
      (l) => norm(l.JurisdictionAbbreviation) === norm(jurisdiction) && norm(l.LicenseType) === norm(licenseType)
    ) ?? null
  );
}
