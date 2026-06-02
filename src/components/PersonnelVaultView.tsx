'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { createClient } from 'src/app/utils/supabase/client';
import {
  addPersonnel,
  getAvailableRoles,
  getPersonnelData,
  getRequirementsForRole,
  getSeparatedPersonnelData,
  markEmployeeSeparated,
  getPersonnelDocuments,
  recordDocumentUpload,
  signAttestation,
  markNotApplicable,
  hashFileBuffer,
  deleteDocument,
  getSecureDocumentUrl,
} from 'src/app/actions/compliance';
import { verifyDocumentWithAI } from 'src/app/actions/ai-verify';
import {
  enrollAndVerifyNurse,
  advanceNurseVerification,
  type NurseVerificationStatus,
} from 'src/app/actions/nursys';
import type { DocumentComplianceStatus } from '@/lib/types';

/** Nursys license-type codes we support (Appendix A.2): RN, LPN/LVN, and APRN roles. */
const NURSE_LICENSE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'RN', label: 'RN — Registered Nurse' },
  { value: 'PN', label: 'LPN / LVN — Practical/Vocational Nurse' },
  { value: 'CNP', label: 'APRN — Nurse Practitioner' },
  { value: 'CNS', label: 'APRN — Clinical Nurse Specialist' },
  { value: 'CNM', label: 'APRN — Nurse Midwife' },
  { value: 'CRNA', label: 'APRN — Nurse Anesthetist' },
];

interface NurseVerificationView {
  id: string;
  status: NurseVerificationStatus;
  licenseStatus?: string | null;
  licenseExpiration?: string | null;
  ncsbnId?: string | null;
  errorMessage?: string | null;
}

interface Props {
  facilityId: string;
}

interface PersonnelRecord {
  id: string;
  name: string;
  role: string;
  clearance_status: string;
  hire_date: string;
  status?: string;
  separation_date?: string | null;
}

interface RoleRequirement {
  id: string;
  name: string;
  typeKey: string;
  severity: string;
  frequency: string;
  attestationAllowed?: boolean;
}

interface PersonnelDocument {
  id: string;
  name: string;
  document_type: string;
  status: string;
  file_url: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// Client-side expiration helper (mirrors server logic in reg-monitor.ts)

/** Safely parse a date string; returns null if absent or invalid. */
function safeParseDate(value: string | null | undefined): Date | null {
  if (!value || typeof value !== 'string') return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Calculates compliance status for a personnel document.
 *
 * Priority:
 *   1. `doc.metadata.ai_extracted_expiration` — the printed expiration date extracted by the AI.
 *   2. Fall back to `createdAt + frequency` calculation when no AI date is present.
 */
function calcPersonnelComplianceStatus(
  createdAt: string,
  frequency: string,
  metadata?: Record<string, unknown> | null
): DocumentComplianceStatus {
  // Priority 1: AI-extracted printed expiration
  const aiRaw =
    typeof metadata?.ai_extracted_expiration === 'string'
      ? metadata.ai_extracted_expiration
      : null;
  const aiExpiry = safeParseDate(aiRaw);

  let expiry: Date | null = aiExpiry;

  // Priority 2: calculated from upload date + renewal frequency
  if (!expiry) {
    const created = safeParseDate(createdAt);
    if (!created) return 'satisfied';

    const d = new Date(created);
    switch (frequency) {
      case 'daily':     d.setDate(d.getDate() + 1); break;
      case 'weekly':    d.setDate(d.getDate() + 7); break;
      case 'monthly':   d.setMonth(d.getMonth() + 1); break;
      case 'quarterly': d.setMonth(d.getMonth() + 3); break;
      case 'biannual':  d.setMonth(d.getMonth() + 6); break;
      case 'annual':    d.setFullYear(d.getFullYear() + 1); break;
      case '2_years':   d.setFullYear(d.getFullYear() + 2); break;
      case '3_years':   d.setFullYear(d.getFullYear() + 3); break;
      case '5_years':   d.setFullYear(d.getFullYear() + 5); break;
      case '10_years':  d.setFullYear(d.getFullYear() + 10); break;
      default:          return 'satisfied'; // one-time / ongoing — never expires
    }
    expiry = d;
  }

  const daysLeft = (expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 30) return 'expiring_soon';
  return 'satisfied';
}

// ── File validation constants ────────────────────────────────────────────────

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

// ── License verification helpers ─────────────────────────────────────────────

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

const NURSING_LICENSE_ROLES = [
  'registered nurse (rn)',
  'licensed practical nurse (lpn)',
  'director of nursing (don)',
  'registered nurse (rn) - childcare',
  'licensed practical nurse (lpn) - childcare',
];

function isNursingLicenseRequirement(req: RoleRequirement, personRole: string): boolean {
  const reqNameLower = req.name.toLowerCase();
  const roleLower = personRole.toLowerCase();

  const isLicenseReq =
    reqNameLower.includes('license') ||
    reqNameLower.includes('licensure') ||
    reqNameLower.includes('board verification');

  const isNursingRole = NURSING_LICENSE_ROLES.includes(roleLower);

  return isLicenseReq && isNursingRole;
}

interface NewPersonnelForm {
  name: string;
  role: string;
  hire_date: string;
}

const EMPTY_FORM: NewPersonnelForm = {
  name: '',
  role: '',
  hire_date: new Date().toISOString().split('T')[0],
};

export default function PersonnelVaultView({ facilityId }: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [active, setActive] = useState<PersonnelRecord[]>([]);
  const [separated, setSeparated] = useState<PersonnelRecord[]>([]);
  const [showArchive, setShowArchive] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [form, setForm] = useState<NewPersonnelForm>(EMPTY_FORM);
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);
  const [loadingRoles, setLoadingRoles] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [separatingId, setSeparatingId] = useState<string | null>(null);
  const [requirementsByPerson, setRequirementsByPerson] = useState<
    Record<string, RoleRequirement[]>
  >({});
  const [expandedPersonId, setExpandedPersonId] = useState<string | null>(null);
  /**
   * Tracks the worst document compliance status per person.
   * Populated whenever a person's requirements row is expanded/loaded.
   * Drives the expiration warning badge on collapsed rows.
   */
  const [personWorstStatus, setPersonWorstStatus] = useState<Record<string, DocumentComplianceStatus | null>>({});

  // Personnel-specific upload state
  const [personnelDocuments, setPersonnelDocuments] = useState<PersonnelDocument[]>([]);
  const [uploadingReqId, setUploadingReqId] = useState<string | null>(null);
  const [verifyingReqId, setVerifyingReqId] = useState<string | null>(null);
  const [signingReqId, setSigningReqId] = useState<string | null>(null);
  const [markingNAReqId, setMarkingNAReqId] = useState<string | null>(null);
  const [personnelToArchive, setPersonnelToArchive] = useState<PersonnelRecord | null>(null);

  const [uploadError, setUploadError] = useState<string | null>(null);

  // License verification modal
  const [licenseModal, setLicenseModal] = useState<{
    personnelId: string;
    req: RoleRequirement;
  } | null>(null);
  const [licenseForm, setLicenseForm] = useState({
    licenseType: 'RN',
    licenseNumber: '',
    jurisdiction: 'AR',
    address1: '',
    address2: '',
    city: '',
    state: 'AR',
    zip: '',
    lastFourSSN: '',
    birthYear: '',
    email: '',
  });
  const [isVerifyingLicense, setIsVerifyingLicense] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [nurseVerification, setNurseVerification] = useState<NurseVerificationView | null>(null);

  // AI rejection modal
  const [personnelRejectionModal, setPersonnelRejectionModal] = useState<{
    requirementName: string;
    detectedType: string;
    confidence: number;
    reason: string;
    req: RoleRequirement;
    personnelId: string;
    file: File;
  } | null>(null);

  // Document management modal state
  const [docManagementItem, setDocManagementItem] = useState<{
    personnelId: string;
    req: RoleRequirement;
    doc: PersonnelDocument;
  } | null>(null);
  const [confirmingDocDelete, setConfirmingDocDelete] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState(false);

  // Secure document viewer state
  const [docViewerUrl, setDocViewerUrl] = useState<string | null>(null);
  const [isLoadingDocViewer, setIsLoadingDocViewer] = useState(false);

  // True while any upload or AI-verify is running — used to lock all upload triggers
  const isUploading = uploadingReqId !== null || verifyingReqId !== null;

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [activeData, separatedData, personnelDocs] = await Promise.all([
          getPersonnelData(facilityId),
          getSeparatedPersonnelData(facilityId),
          getPersonnelDocuments(facilityId),
        ]);
        setActive(activeData);
        setSeparated(separatedData);
        setPersonnelDocuments(personnelDocs as PersonnelDocument[]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [facilityId]);

  useEffect(() => {
    async function loadRoles() {
      if (!showAddForm) return;
      setLoadingRoles(true);
      try {
        const result = await getAvailableRoles(facilityId);
        if (result.success) setAvailableRoles(result.roles);
        else setAvailableRoles([]);
      } finally {
        setLoadingRoles(false);
      }
    }
    loadRoles();
  }, [showAddForm, facilityId]);

  // Fetch a signed URL whenever a document viewer modal opens
  useEffect(() => {
    const docId = docManagementItem?.doc.id;
    // Syncs a short-lived signed URL to the open document viewer (external system).
    if (!docId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDocViewerUrl(null);
      return;
    }
    setIsLoadingDocViewer(true);
    getSecureDocumentUrl(docId, facilityId)
      .then((result) => {
        if (result.success) setDocViewerUrl(result.url ?? null);
      })
      .finally(() => setIsLoadingDocViewer(false));
  }, [docManagementItem?.doc.id, facilityId]);

  const computeWorstStatus = (
    personId: string,
    reqs: RoleRequirement[],
    docs: PersonnelDocument[] = personnelDocuments
  ): DocumentComplianceStatus | null => {
    const statusPriority: Record<DocumentComplianceStatus, number> = {
      expired: 4, expiring_soon: 3, pending_review: 2, missing: 1, satisfied: 0,
    };
    let worst: DocumentComplianceStatus | null = null;
    for (const req of reqs) {
      const doc = docs.find((d) => {
        const meta = d.metadata as Record<string, unknown> | null;
        return meta && meta.personnel_id === personId && d.document_type === req.typeKey && (d.status === 'approved' || d.status === 'pending');
      });
      const status: DocumentComplianceStatus = doc
        ? doc.status === 'pending'
          ? 'pending_review'
          : calcPersonnelComplianceStatus(doc.created_at, req.frequency, doc.metadata)
        : 'missing';
      if (!worst || statusPriority[status] > statusPriority[worst]) worst = status;
    }
    return worst;
  };

  const toggleExpanded = async (person: PersonnelRecord) => {
    if (expandedPersonId === person.id) {
      setExpandedPersonId(null);
      return;
    }
    setExpandedPersonId(person.id);
    // Always refetch so DB/migration updates appear without a full page reload.
    const result = await getRequirementsForRole(facilityId, person.role);
    if (result.success) {
      setRequirementsByPerson((prev) => ({ ...prev, [person.id]: result.requirements }));
      const worst = computeWorstStatus(person.id, result.requirements);
      setPersonWorstStatus((prev) => ({ ...prev, [person.id]: worst }));
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.role) return;
    setSubmitting(true);
    try {
      const result = await addPersonnel(facilityId, form);
      if (result.success) {
        setForm(EMPTY_FORM);
        setShowAddForm(false);
        const refreshed = await getPersonnelData(facilityId);
        setActive(refreshed);
        const added = result.personnel as PersonnelRecord | undefined;
        if (added?.id && added.role) {
          const reqResult = await getRequirementsForRole(facilityId, added.role);
          if (reqResult.success) {
            setRequirementsByPerson((prev) => ({
              ...prev,
              [added.id]: reqResult.requirements,
            }));
            setExpandedPersonId(added.id);
          }
        }
      } else {
        toast.error(result.error ?? 'Operation failed.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSeparate = async () => {
    if (!personnelToArchive) return;
    
    setSeparatingId(personnelToArchive.id);
    try {
      const result = await markEmployeeSeparated(personnelToArchive.id);
      if (result.success) {
        setActive((prev) => prev.filter((p) => p.id !== personnelToArchive.id));
        const sep = await getSeparatedPersonnelData(facilityId);
        setSeparated(sep);
      } else {
        toast.error(result.error ?? 'Operation failed.');
      }
    } finally {
      setSeparatingId(null);
      setPersonnelToArchive(null);
    }
  };

  const getMatchingPersonnelDoc = (
    personnelId: string,
    typeKey: string
  ): PersonnelDocument | null => {
    return (
      personnelDocuments.find((doc) => {
        const meta = doc.metadata as Record<string, unknown> | null;
        return (
          meta &&
          meta.personnel_id === personnelId &&
          doc.document_type === typeKey &&
          (doc.status === 'approved' || doc.status === 'pending')
        );
      }) ?? null
    );
  };

  const handleDocDelete = async () => {
    if (!docManagementItem) return;
    setDeletingDoc(true);
    try {
      const result = await deleteDocument(docManagementItem.doc.id, facilityId);
      if (result.success) {
        const refreshedDocs = (await getPersonnelDocuments(facilityId)) as PersonnelDocument[];
        setPersonnelDocuments(refreshedDocs);
        setDocManagementItem(null);
        setConfirmingDocDelete(false);
        router.refresh();
      } else {
        toast.error(`Delete failed: ${result.error}`);
        setConfirmingDocDelete(false);
      }
    } finally {
      setDeletingDoc(false);
    }
  };

  const handlePersonnelSubmitForReview = async () => {
    if (!personnelRejectionModal) return;
    const { req, personnelId, file } = personnelRejectionModal;

    setPersonnelRejectionModal(null);
    setUploadingReqId(req.id);
    try {
      const documentId = crypto.randomUUID();
      const storagePath = `${facilityId}/personnel/${personnelId}/${req.id}/uploaded_evidence`;

      const { error: storageError } = await supabase.storage
        .from('facility-documents')
        .upload(storagePath, file, { upsert: true });
      if (storageError) throw storageError;

      const { error: insertError } = await supabase.from('facility_documents').insert({
        id: documentId,
        facility_id: facilityId,
        document_type: req.typeKey,
        status: 'pending',
        file_url: storagePath,
        name: file.name,
        metadata: {
          upload_source: 'personnel_vault',
          personnel_id: personnelId,
          pending_reason: 'AI verification failed — submitted for human review',
        },
      });
      if (insertError) throw insertError;

      const buffer = await file.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      const fileHash = await hashFileBuffer(base64);

      await recordDocumentUpload({
        facilityId,
        documentId,
        documentType: req.typeKey,
        fileName: file.name,
        fileSize: file.size,
        fileHash,
        userAttestation: true,
        personnelId,
        status: 'pending',
      });

      const refreshedDocs = (await getPersonnelDocuments(facilityId)) as PersonnelDocument[];
      setPersonnelDocuments(refreshedDocs);
      router.refresh();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Submit for review failed: ${message}`);
    } finally {
      setUploadingReqId(null);
    }
  };

  const handlePersonnelUpload = async (
    personnelId: string,
    requirement: RoleRequirement,
    file: File
  ) => {
    // ── Client-side file validation ───────────────────────────────────────────
    setUploadError(null);
    if (file.size > MAX_FILE_SIZE || !ALLOWED_TYPES.includes(file.type)) {
      setUploadError('File must be a PDF or image (JPEG/PNG) under 10MB.');
      return;
    }

    // ── Step 1: AI Verification ───────────────────────────────────────────────
    setVerifyingReqId(requirement.id);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('requirementName', requirement.name);

      const aiResult = await verifyDocumentWithAI(formData);

      if (!aiResult.success) {
        console.warn('⚠️ AI verification service unavailable, proceeding with upload:', aiResult.error);
      } else if (!aiResult.object.is_valid_match) {
        setPersonnelRejectionModal({
          requirementName: requirement.name,
          detectedType: aiResult.object.detected_document_type,
          confidence: aiResult.object.confidence_score,
          reason: aiResult.object.rejection_reason ?? 'The document did not match the requirement.',
          req: requirement,
          personnelId,
          file,
        });
        return;
      }

      const aiExpirationDate = aiResult.success
        ? (aiResult.object.expiration_date ?? undefined)
        : undefined;

      // ── Step 2: Storage Upload ──────────────────────────────────────────────
      setVerifyingReqId(null);
      setUploadingReqId(requirement.id);

      const documentId = crypto.randomUUID();
      // Deterministic path: overwriting the same key is idempotent and prevents
      // orphaned storage objects from rapid duplicate submissions.
      const storagePath = `${facilityId}/personnel/${personnelId}/${requirement.id}/uploaded_evidence`;

      const { error: storageError } = await supabase.storage
        .from('facility-documents')
        .upload(storagePath, file, { upsert: true });
      if (storageError) throw storageError;

      const { error: insertError } = await supabase.from('facility_documents').insert({
        id: documentId,
        facility_id: facilityId,
        document_type: requirement.typeKey,
        status: 'approved',
        file_url: storagePath,
        name: file.name,
        metadata: {
          upload_source: 'personnel_vault',
          personnel_id: personnelId,
          ...(aiExpirationDate ? { ai_extracted_expiration: aiExpirationDate } : {}),
        },
      });
      if (insertError) throw insertError;

      const buffer = await file.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      const fileHash = await hashFileBuffer(base64);

      const result = await recordDocumentUpload({
        facilityId,
        documentId,
        documentType: requirement.typeKey,
        fileName: file.name,
        fileSize: file.size,
        fileHash,
        userAttestation: true,
        personnelId,
        aiExpirationDate,
      });

      if (!result.success) {
        toast.error(`Upload audit log failure: ${result.error}`);
        return;
      }

      const refreshedDocs = (await getPersonnelDocuments(facilityId)) as PersonnelDocument[];
      setPersonnelDocuments(refreshedDocs);
      router.refresh();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Upload failed: ${message}`);
    } finally {
      setVerifyingReqId(null);
      setUploadingReqId(null);
    }
  };

  const handlePersonnelSignAttestation = async (
    personnelId: string,
    requirement: RoleRequirement
  ) => {
    if (!confirm(`Sign digital attestation for: ${requirement.name}?`)) return;

    setSigningReqId(requirement.id);
    try {
      const result = await signAttestation(facilityId, requirement.id, true, personnelId);
      if (result.success) {
        const refreshedDocs = (await getPersonnelDocuments(facilityId)) as PersonnelDocument[];
        setPersonnelDocuments(refreshedDocs);
        router.refresh();
      } else {
        toast.error(`Failed to sign attestation: ${result.error}`);
      }
    } finally {
      setSigningReqId(null);
    }
  };

  const handlePersonnelMarkNA = async (personnelId: string, requirement: RoleRequirement) => {
    const reason = prompt(`Mark "${requirement.name}" as Not Applicable. Provide a brief reason:`);
    if (!reason || reason.trim() === '') {
      toast.error('A reason is required to mark as N/A.');
      return;
    }

    setMarkingNAReqId(requirement.id);
    try {
      const result = await markNotApplicable(
        facilityId,
        requirement.id,
        reason.trim(),
        true,
        personnelId
      );
      if (result.success) {
        const refreshedDocs = (await getPersonnelDocuments(facilityId)) as PersonnelDocument[];
        setPersonnelDocuments(refreshedDocs);
        router.refresh();
      } else {
        toast.error(`Failed to mark as N/A: ${result.error}`);
      }
    } finally {
      setMarkingNAReqId(null);
    }
  };

  const resetLicenseForm = () => {
    setLicenseForm({
      licenseType: 'RN',
      licenseNumber: '',
      jurisdiction: 'AR',
      address1: '',
      address2: '',
      city: '',
      state: 'AR',
      zip: '',
      lastFourSSN: '',
      birthYear: '',
      email: '',
    });
    setNurseVerification(null);
    setIsVerifyingLicense(false);
    setIsCheckingStatus(false);
  };

  const closeLicenseModal = () => {
    setLicenseModal(null);
    resetLicenseForm();
  };

  // Step 1: enroll the nurse on Nursys (kicks off the async primary-source check).
  const handleEnrollLicense = async () => {
    if (!licenseModal) return;
    const { personnelId, req } = licenseModal;
    const f = licenseForm;

    if (!f.licenseNumber.trim()) {
      toast.error('Please enter the license number.');
      return;
    }
    if (!/^\d{4}$/.test(f.lastFourSSN)) {
      toast.error('Last 4 digits of SSN must be exactly 4 digits.');
      return;
    }
    if (!/^\d{4}$/.test(f.birthYear)) {
      toast.error('Birth year must be a 4-digit year.');
      return;
    }
    if (!f.address1.trim() || !f.city.trim() || !f.zip.trim()) {
      toast.error('Employment street address, city, and ZIP are required by Nursys.');
      return;
    }

    setIsVerifyingLicense(true);
    try {
      const result = await enrollAndVerifyNurse({
        facilityId,
        personnelId,
        requirementId: req.id,
        typeKey: req.typeKey,
        licenseType: f.licenseType,
        jurisdiction: f.jurisdiction,
        licenseNumber: f.licenseNumber,
        address1: f.address1,
        address2: f.address2,
        city: f.city,
        state: f.state,
        zip: f.zip,
        lastFourSSN: f.lastFourSSN,
        birthYear: f.birthYear,
        email: f.email || undefined,
      });

      if (result.success) {
        setNurseVerification(result.verification);
        toast.success('Submitted to Nursys. Primary-source verification is processing (usually a few minutes).');
      } else {
        toast.error(result.error);
      }
    } finally {
      setIsVerifyingLicense(false);
    }
  };

  // Step 2+: advance the async state machine (enroll -> lookup -> result).
  const handleCheckVerification = async () => {
    if (!licenseModal || !nurseVerification) return;
    const { personnelId } = licenseModal;
    setIsCheckingStatus(true);
    try {
      const result = await advanceNurseVerification(nurseVerification.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setNurseVerification(result.verification);
      const s = result.verification.status;

      if (s === 'verified') {
        toast.success(
          `Nursys verified — expires ${
            result.verification.licenseExpiration
              ? new Date(result.verification.licenseExpiration).toLocaleDateString()
              : 'on file'
          }.`
        );
        const refreshedDocs = (await getPersonnelDocuments(facilityId)) as PersonnelDocument[];
        setPersonnelDocuments(refreshedDocs);
        // Re-fetch this person's requirements and recompute against the FRESH docs.
        // (Recomputing off `personnelDocuments` state here would use the stale
        // pre-refresh array and leave the status chip on its old value.)
        const person = [...active, ...separated].find((p) => p.id === personnelId);
        let reqs = requirementsByPerson[personnelId];
        if (person) {
          const reqResult = await getRequirementsForRole(facilityId, person.role);
          if (reqResult.success) {
            reqs = reqResult.requirements;
            setRequirementsByPerson((prev) => ({ ...prev, [personnelId]: reqResult.requirements }));
          }
        }
        if (reqs) {
          const worst = computeWorstStatus(personnelId, reqs, refreshedDocs);
          setPersonWorstStatus((prev) => ({ ...prev, [personnelId]: worst }));
        }
        router.refresh();
        closeLicenseModal();
      } else if (s === 'expired' || s === 'action_required' || s === 'not_found' || s === 'failed') {
        toast.error(result.verification.errorMessage ?? 'Verification could not be completed.');
      } else {
        toast('Still processing at Nursys — we\u2019ll keep checking.', { icon: '\u23F3' });
      }
    } finally {
      setIsCheckingStatus(false);
    }
  };

  // Auto-poll while a verification is in flight (Nursys recommends ~5 min; we
  // re-check every 30s while the modal is open). Phase 2 replaces this with a
  // server-side cron sweep so results land even with the tab closed.
  useEffect(() => {
    if (!nurseVerification) return;
    const pending =
      nurseVerification.status === 'enroll_submitted' || nurseVerification.status === 'lookup_submitted';
    if (!pending) return;
    const timer = setTimeout(() => {
      handleCheckVerification();
    }, 30_000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nurseVerification]);

  const roster = showArchive ? separated : active;

  return (
    <div className="space-y-6 max-w-6xl mx-auto text-slate-800">
      {/* Archive Personnel Confirmation Modal */}
      {personnelToArchive && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="bg-gradient-to-r from-rose-600 to-rose-700 px-6 py-4 rounded-t-xl">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                ⚠️ Confirm Archive Action
              </h2>
            </div>
            <div className="p-6">
              <p className="text-slate-800 mb-2 font-semibold">
                Are you sure you want to archive <span className="text-rose-700">{personnelToArchive.name}</span>?
              </p>
              <p className="text-sm text-slate-600 mb-4">
                They will be moved to the separated roster.
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setPersonnelToArchive(null)}
                  disabled={separatingId !== null}
                  className="flex-1 px-4 py-2.5 bg-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSeparate}
                  disabled={separatingId !== null}
                  className="flex-1 px-4 py-2.5 bg-rose-600 text-white rounded-lg font-medium hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {separatingId !== null ? 'Archiving…' : 'Yes, Archive Employee'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Rejection Modal */}
      {personnelRejectionModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full">
            <div className="bg-gradient-to-r from-rose-600 to-rose-700 px-6 py-4 rounded-t-xl flex items-center gap-3">
              <span className="text-2xl" aria-hidden>🤖</span>
              <div>
                <h2 className="text-lg font-bold text-white leading-tight">AI Verification Failed</h2>
                <p className="text-rose-200 text-xs">Document does not match the requirement</p>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 rounded-lg p-4 space-y-3 border border-slate-200">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 font-medium">Requirement</span>
                  <span className="text-slate-800 font-semibold text-right max-w-[60%]">
                    {personnelRejectionModal.requirementName}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 font-medium">Document Detected</span>
                  <span className="text-slate-800 font-semibold">{personnelRejectionModal.detectedType}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 font-medium">AI Confidence</span>
                  <span className={`font-bold text-xs px-2 py-0.5 rounded-full ${
                    personnelRejectionModal.confidence >= 70
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    {personnelRejectionModal.confidence}%
                  </span>
                </div>
              </div>
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-rose-700 mb-1">
                  Rejection Reason
                </p>
                <p className="text-sm text-rose-900 leading-relaxed">
                  {personnelRejectionModal.reason}
                </p>
              </div>
              <p className="text-xs text-slate-500 italic">
                Please upload the correct document and try again. If you believe this is an error, use &ldquo;Attest&rdquo; to manually certify compliance, or submit for human review.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={() => setPersonnelRejectionModal(null)}
                  className="flex-1 px-4 py-2.5 bg-slate-800 text-white rounded-lg font-medium hover:bg-slate-700 transition-colors"
                >
                  Dismiss &amp; Try Again
                </button>
                <button
                  onClick={handlePersonnelSubmitForReview}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  ⏳ Submit for Human Review
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Document Viewer Modal */}
      {docManagementItem && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden"
            style={{ maxHeight: '90vh' }}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-6 py-4 flex items-center justify-between shrink-0">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-white">Document Viewer</h2>
                <p className="text-slate-400 text-xs mt-0.5 truncate">
                  {docManagementItem.req.name}
                </p>
              </div>
              <button
                onClick={() => { setDocManagementItem(null); setConfirmingDocDelete(false); setDocViewerUrl(null); }}
                className="ml-4 shrink-0 text-white/70 hover:text-white text-2xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {/* Two-column body */}
            <div
              className="flex-1 grid grid-cols-1 lg:grid-cols-[3fr_2fr] divide-y lg:divide-y-0 lg:divide-x divide-slate-200 overflow-hidden"
              style={{ minHeight: 0 }}
            >
              {/* ── Left / Top: Viewer pane ── */}
              <div className="bg-slate-950 flex flex-col items-center justify-center min-h-64 overflow-hidden">
                {isLoadingDocViewer ? (
                  <div className="flex flex-col items-center gap-3 text-slate-400">
                    <div className="w-8 h-8 border-4 border-slate-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm">Loading document…</p>
                  </div>
                ) : docViewerUrl ? (
                  /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(docViewerUrl.split('?')[0]) ? (
                    <img
                      src={docViewerUrl}
                      alt={docManagementItem.req.name}
                      className="w-full h-full object-contain p-4 max-h-[60vh]"
                    />
                  ) : (
                    <iframe
                      src={docViewerUrl}
                      title={`${docManagementItem.req.name} — Document`}
                      className="w-full h-full border-0"
                      style={{ minHeight: '320px' }}
                    />
                  )
                ) : (
                  <div className="text-center space-y-3 p-8">
                    <p className="text-5xl">📝</p>
                    <p className="text-sm text-slate-400 leading-relaxed">
                      No file attachment
                      <br />
                      <span className="text-slate-500 italic text-xs">
                        {docManagementItem.doc.file_url
                          ? 'Could not generate secure URL'
                          : 'Attestation or N/A record — no file'}
                      </span>
                    </p>
                  </div>
                )}
              </div>

              {/* ── Right / Bottom: Metadata & Actions pane ── */}
              <div className="p-6 space-y-5 overflow-y-auto bg-white">

                {/* Requirement */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Requirement
                  </p>
                  <p className="font-semibold text-slate-800 text-sm leading-snug">
                    {docManagementItem.req.name}
                  </p>
                  <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                    {docManagementItem.req.typeKey}
                  </p>
                  {(() => {
                    const s = calcPersonnelComplianceStatus(
                      docManagementItem.doc.created_at,
                      docManagementItem.req.frequency,
                      docManagementItem.doc.metadata
                    );
                    return (
                      <span className={`inline-block mt-2 text-xs font-bold px-2.5 py-1 rounded-full ${
                        s === 'expired'
                          ? 'bg-rose-100 text-rose-700'
                          : s === 'expiring_soon'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {s === 'expired' ? '🔴 Expired' : s === 'expiring_soon' ? '🟡 Expiring Soon' : '✅ Satisfied'}
                      </span>
                    );
                  })()}
                </div>

                {/* Document details */}
                <div className="bg-slate-50 rounded-lg p-4 space-y-2.5 border border-slate-200 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Upload Date</span>
                    <span className="font-medium text-slate-800">
                      {new Date(docManagementItem.doc.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Frequency</span>
                    <span className="font-medium text-slate-800 capitalize">
                      {docManagementItem.req.frequency.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>

                {/* AI Metadata */}
                {docManagementItem.doc.metadata && (
                  <div className="bg-violet-50 border border-violet-200 rounded-lg p-4 space-y-2.5 text-sm">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-violet-500">
                      🤖 AI Metadata
                    </p>
                    {typeof docManagementItem.doc.metadata.ai_extracted_expiration === 'string' ? (
                      <div className="flex justify-between">
                        <span className="text-violet-600">Expiration (AI)</span>
                        <span className="font-semibold text-violet-800">
                          {new Date(
                            docManagementItem.doc.metadata.ai_extracted_expiration
                          ).toLocaleDateString()}
                        </span>
                      </div>
                    ) : (
                      <p className="text-xs text-violet-400 italic">
                        No expiration date extracted
                      </p>
                    )}
                    {typeof docManagementItem.doc.metadata.upload_source === 'string' && (
                      <div className="flex justify-between">
                        <span className="text-violet-600">Source</span>
                        <span className="font-medium text-violet-800 capitalize">
                          {String(docManagementItem.doc.metadata.upload_source).replace(/_/g, ' ')}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Delete & Replace */}
                <div className="pt-1">
                  {confirmingDocDelete ? (
                    <div className="rounded-xl border-2 border-rose-300 bg-rose-50 p-4 space-y-3">
                      <p className="text-sm font-bold text-rose-800">
                        ⚠️ Permanently delete this document and reset this requirement to &ldquo;Missing.&rdquo;
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setConfirmingDocDelete(false)}
                          disabled={deletingDoc}
                          className="flex-1 px-3 py-2 rounded-lg bg-slate-200 text-slate-700 font-medium text-sm hover:bg-slate-300 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleDocDelete}
                          disabled={deletingDoc}
                          className="flex-1 px-3 py-2 rounded-lg bg-rose-600 text-white font-medium text-sm hover:bg-rose-700 disabled:opacity-50"
                        >
                          {deletingDoc ? 'Deleting…' : 'Yes, Delete'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmingDocDelete(true)}
                      className="w-full px-4 py-2.5 bg-rose-600 text-white rounded-lg font-medium text-sm hover:bg-rose-700 transition-colors"
                    >
                      🗑️ Delete &amp; Replace Document
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* License Verification Modal */}
      {licenseModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-700 to-blue-600 px-6 py-4 flex items-center justify-between shrink-0">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-white">Fulfill Requirement</h2>
                <p className="text-indigo-200 text-xs mt-0.5 truncate">{licenseModal.req.name}</p>
              </div>
              <button
                onClick={closeLicenseModal}
                className="ml-4 shrink-0 text-white/70 hover:text-white text-2xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              {!nurseVerification ? (
                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                  <p className="text-sm text-slate-600">
                    Real primary-source verification against the state board of nursing via{' '}
                    <span className="font-semibold">Nursys</span>. The identifying details below must match the
                    board&apos;s record. SSN digits and birth year are sent securely to Nursys for matching and are{' '}
                    <span className="font-semibold">never stored</span> by us.
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        License Type <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={licenseForm.licenseType}
                        onChange={(e) => setLicenseForm((p) => ({ ...p, licenseType: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        disabled={isVerifyingLicense}
                      >
                        {NURSE_LICENSE_TYPE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Issuing State <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={licenseForm.jurisdiction}
                        onChange={(e) => setLicenseForm((p) => ({ ...p, jurisdiction: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        disabled={isVerifyingLicense}
                      >
                        {US_STATES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      License Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={licenseForm.licenseNumber}
                      onChange={(e) => setLicenseForm((p) => ({ ...p, licenseNumber: e.target.value }))}
                      placeholder="Numbers only — no 'RN'/'LPN' prefix (e.g. 219097)"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      disabled={isVerifyingLicense}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Last 4 of SSN <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={4}
                        value={licenseForm.lastFourSSN}
                        onChange={(e) =>
                          setLicenseForm((p) => ({ ...p, lastFourSSN: e.target.value.replace(/\D/g, '').slice(0, 4) }))
                        }
                        placeholder="0000"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        disabled={isVerifyingLicense}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Birth Year <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={4}
                        value={licenseForm.birthYear}
                        onChange={(e) =>
                          setLicenseForm((p) => ({ ...p, birthYear: e.target.value.replace(/\D/g, '').slice(0, 4) }))
                        }
                        placeholder="e.g. 1985"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        disabled={isVerifyingLicense}
                      />
                    </div>
                  </div>

                  <div className="pt-1 border-t border-slate-100">
                    <p className="text-[11px] font-semibold text-slate-500 mt-2 mb-1">
                      Employment address (required by Nursys)
                    </p>
                    <input
                      type="text"
                      value={licenseForm.address1}
                      onChange={(e) => setLicenseForm((p) => ({ ...p, address1: e.target.value }))}
                      placeholder="Street address"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      disabled={isVerifyingLicense}
                    />
                    <input
                      type="text"
                      value={licenseForm.address2}
                      onChange={(e) => setLicenseForm((p) => ({ ...p, address2: e.target.value }))}
                      placeholder="Apt / Suite (optional)"
                      className="w-full mt-2 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      disabled={isVerifyingLicense}
                    />
                    <div className="grid grid-cols-6 gap-2 mt-2">
                      <input
                        type="text"
                        value={licenseForm.city}
                        onChange={(e) => setLicenseForm((p) => ({ ...p, city: e.target.value }))}
                        placeholder="City"
                        className="col-span-3 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        disabled={isVerifyingLicense}
                      />
                      <select
                        value={licenseForm.state}
                        onChange={(e) => setLicenseForm((p) => ({ ...p, state: e.target.value }))}
                        className="col-span-1 px-1 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        disabled={isVerifyingLicense}
                      >
                        {US_STATES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={licenseForm.zip}
                        onChange={(e) => setLicenseForm((p) => ({ ...p, zip: e.target.value }))}
                        placeholder="ZIP"
                        className="col-span-2 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        disabled={isVerifyingLicense}
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleEnrollLicense}
                    disabled={isVerifyingLicense || !licenseForm.licenseNumber.trim()}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-bold transition-colors ${
                      !isVerifyingLicense && licenseForm.licenseNumber.trim()
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    {isVerifyingLicense ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Submitting…
                      </>
                    ) : (
                      '🛡 Verify with Nursys'
                    )}
                  </button>
                  <p className="text-[10px] text-slate-400 italic text-center">
                    Primary-source verification with the state board of nursing. Results post automatically once the
                    board responds (usually a few minutes).
                  </p>
                </div>
              ) : nurseVerification.status === 'enroll_submitted' ||
                nurseVerification.status === 'lookup_submitted' ? (
                <div className="space-y-4 text-center py-2">
                  <div className="flex justify-center">
                    <span className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">Verification in progress</p>
                    <p className="text-xs text-slate-500 mt-1">
                      We&apos;ve submitted this license to Nursys and are waiting on the state board. This usually
                      takes a few minutes — we&apos;ll check automatically, or you can check now.
                    </p>
                  </div>
                  <button
                    onClick={handleCheckVerification}
                    disabled={isCheckingStatus}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-bold transition-colors ${
                      !isCheckingStatus
                        ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                        : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    {isCheckingStatus ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Checking…
                      </>
                    ) : (
                      '↻ Check status now'
                    )}
                  </button>
                  <button
                    onClick={closeLicenseModal}
                    className="w-full px-4 py-2 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100"
                  >
                    Close — it&apos;ll keep processing
                  </button>
                </div>
              ) : (
                <div className="space-y-4 text-center py-2">
                  <div className="text-4xl">
                    {nurseVerification.status === 'verified' ? '✅' : '⚠️'}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">
                      {nurseVerification.status === 'verified' && 'License verified by Nursys'}
                      {nurseVerification.status === 'expired' && 'License is expired'}
                      {nurseVerification.status === 'action_required' && 'Needs review'}
                      {nurseVerification.status === 'not_found' && 'No matching license found'}
                      {nurseVerification.status === 'failed' && 'Verification failed'}
                    </p>
                    {nurseVerification.licenseStatus && (
                      <p className="text-xs text-slate-500 mt-1">
                        Board status: <span className="font-semibold">{nurseVerification.licenseStatus}</span>
                      </p>
                    )}
                    {nurseVerification.errorMessage && (
                      <p className="text-xs text-rose-600 mt-1">{nurseVerification.errorMessage}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={resetLicenseForm}
                      className="flex-1 px-4 py-2.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                      Try again
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* File validation error */}
      {uploadError && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium">
          <span className="shrink-0 text-rose-500">✕</span>
          {uploadError}
        </div>
      )}

      <div className="bg-white p-5 md:p-8 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-bold mb-2">
              {showArchive ? 'Archived Employee Roster' : 'Active Personnel Vault'}
            </h2>
            <p className="text-xs text-slate-500">
              Click a row to view the personnel-category requirements that apply to that role.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {!showArchive && (
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 min-h-[44px]"
              >
                ➕ Add Employee
              </button>
            )}
            <button
              onClick={() => setShowArchive(!showArchive)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 min-h-[44px]"
            >
              📦 {showArchive ? 'Show Active Roster' : 'Show Archived Roster'}
              {showArchive && separated.length > 0 && (
                <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full text-xs font-bold">
                  {separated.length}
                </span>
              )}
            </button>
          </div>
        </div>

      {showAddForm && !showArchive && (
        <div className="mb-6 p-6 bg-blue-50 border border-blue-200 rounded-xl">
          <h3 className="text-md font-bold text-slate-800 mb-4">Add New Employee</h3>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="John Doe"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Role <span className="text-red-500">*</span>
                </label>
                {loadingRoles ? (
                  <div className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-400">
                    Loading roles…
                  </div>
                ) : availableRoles.length === 0 ? (
                  <div className="w-full px-3 py-2 border border-amber-300 rounded-lg bg-amber-50 text-amber-700 text-sm">
                    ⚠️ No roles match this facility&apos;s current scope flags.
                  </div>
                ) : (
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">Select a role…</option>
                    {availableRoles.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Hire Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={form.hire_date}
                  onChange={(e) => setForm({ ...form, hire_date: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={submitting || availableRoles.length === 0}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-slate-300"
              >
                {submitting ? 'Adding…' : 'Add Employee'}
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-6 py-2 bg-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-300"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Personnel Expiration Alert Summary ─────────────────────────── */}
      {!loading && !showArchive && (() => {
        const staffWithExpired = Object.entries(personWorstStatus)
          .filter(([, s]) => s === 'expired')
          .map(([id]) => active.find((p) => p.id === id))
          .filter(Boolean) as PersonnelRecord[];
        const staffExpiring = Object.entries(personWorstStatus)
          .filter(([, s]) => s === 'expiring_soon')
          .map(([id]) => active.find((p) => p.id === id))
          .filter(Boolean) as PersonnelRecord[];

        if (staffWithExpired.length === 0 && staffExpiring.length === 0) return null;
        return (
          <div className="rounded-xl overflow-hidden border shadow-sm">
            {staffWithExpired.length > 0 && (
              <div className="bg-rose-50 border-b border-rose-200 p-4">
                <div className="flex items-start gap-3">
                  <span className="text-lg shrink-0 mt-0.5">🚨</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-rose-800 text-sm">
                      {staffWithExpired.length} Staff Member{staffWithExpired.length !== 1 ? 's' : ''} Have Expired Documents
                    </p>
                    <p className="text-xs text-rose-600 mt-0.5 mb-2">
                      Expand each row below to see which credentials have lapsed and upload replacements.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {staffWithExpired.map((p) => (
                        <span key={p.id} className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 border border-rose-400 text-rose-800">
                          {p.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {staffExpiring.length > 0 && (
              <div className="bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                  <span className="text-lg shrink-0 mt-0.5">⚠️</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-amber-800 text-sm">
                      {staffExpiring.length} Staff Member{staffExpiring.length !== 1 ? 's' : ''} Have Documents Expiring Within 30 Days
                    </p>
                    <p className="text-xs text-amber-700 mt-0.5 mb-2">
                      Expand the rows below to renew credentials before they expire.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {staffExpiring.map((p) => (
                        <span key={p.id} className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 border border-amber-400 text-amber-800">
                          {p.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {loading ? (
        <p className="text-slate-500 italic">Loading roster…</p>
      ) : roster.length === 0 ? (
        <div className="border border-dashed border-slate-200 rounded-xl p-12 text-center italic text-slate-400 text-xs bg-slate-50">
          {showArchive ? 'No archived personnel.' : 'No active personnel. Add employees to begin tracking compliance.'}
        </div>
      ) : (
        <div className="space-y-3">
          {roster.map((person) => {
            const isExpanded = expandedPersonId === person.id;
            const requirements = requirementsByPerson[person.id] ?? [];
            return (
              <div
                key={person.id}
                className={`border rounded-xl overflow-hidden transition-shadow ${
                  isExpanded ? 'shadow-md border-blue-300' : 'border-slate-200'
                }`}
              >
                <button
                  onClick={() => toggleExpanded(person)}
                  className="w-full flex items-center justify-between gap-4 p-4 text-left hover:bg-slate-50"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 text-white font-bold flex items-center justify-center">
                      {person.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800">{person.name}</p>
                      <p className="text-xs text-slate-500">{person.role}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {/* Expiration indicator — visible once the row has been expanded once */}
                    {personWorstStatus[person.id] === 'expired' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 border border-rose-400 text-rose-700">
                        🔴 Expired
                      </span>
                    )}
                    {personWorstStatus[person.id] === 'expiring_soon' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 border border-amber-400 text-amber-700">
                        🟡 Expiring
                      </span>
                    )}
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        person.clearance_status === 'approved' || person.clearance_status === 'cleared'
                          ? 'bg-emerald-100 text-emerald-800'
                          : person.clearance_status === 'pending'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {person.clearance_status}
                    </span>
                    <span className="hidden sm:block text-xs text-slate-400">
                      Hired {new Date(person.hire_date).toLocaleDateString()}
                    </span>
                    {!showArchive && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPersonnelToArchive(person);
                        }}
                        disabled={separatingId === person.id}
                        className="text-xs font-medium px-3 py-1.5 rounded-md bg-slate-100 text-slate-700 hover:bg-rose-100 hover:text-rose-700 border border-slate-200 min-h-[32px]"
                      >
                        {separatingId === person.id ? 'Processing…' : '📦 Archive'}
                      </button>
                    )}
                    <span className="text-slate-400 text-lg" aria-hidden>
                      {isExpanded ? '▾' : '▸'}
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-200 bg-slate-50 p-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-3">
                      Required for this role
                    </h4>
                    {requirements.length === 0 ? (
                      <p className="text-xs italic text-slate-400">
                        No specific personnel-category requirements found for this role at this facility.
                      </p>
                    ) : (
                      <ul className="divide-y divide-slate-200 bg-white rounded-lg border border-slate-200">
                        {requirements.map((req) => {
                          const matchingDoc = getMatchingPersonnelDoc(person.id, req.typeKey);
                          const complianceStatus: DocumentComplianceStatus = matchingDoc
                            ? matchingDoc.status === 'pending'
                              ? 'pending_review'
                              : calcPersonnelComplianceStatus(matchingDoc.created_at, req.frequency, matchingDoc.metadata)
                            : 'missing';
                          const isMissing = complianceStatus === 'missing';
                          const isVerifyingThis = verifyingReqId === req.id;
                          const isBusy =
                            isVerifyingThis ||
                            uploadingReqId === req.id ||
                            signingReqId === req.id ||
                            markingNAReqId === req.id;

                          const statusBadgeClass: Record<DocumentComplianceStatus, string> = {
                            satisfied:      'bg-emerald-100 text-emerald-700 hover:bg-emerald-200',
                            expiring_soon:  'bg-amber-100 text-amber-700 hover:bg-amber-200',
                            expired:        'bg-rose-100 text-rose-700 hover:bg-rose-200',
                            pending_review: 'bg-blue-100 text-blue-700 hover:bg-blue-200',
                            missing:        '',
                          };
                          const statusBadgeLabel: Record<DocumentComplianceStatus, string> = {
                            satisfied:      '✅ Satisfied',
                            expiring_soon:  '🟡 Expiring Soon',
                            expired:        '🔴 Expired',
                            pending_review: '⏳ Pending Review',
                            missing:        '',
                          };

                          return (
                            <li key={req.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                              <div className="flex-1">
                                <p className={`text-sm font-medium ${isMissing ? 'text-slate-800' : 'text-slate-500'}`}>
                                  {req.name}
                                </p>
                                <p className="text-[11px] text-slate-400 font-mono">{req.typeKey}</p>
                                {!isMissing && matchingDoc && (
                                  <p className="text-[10px] text-slate-400 italic mt-0.5">
                                    Uploaded {new Date(matchingDoc.created_at).toLocaleDateString()} · Click badge to manage
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                    req.severity === 'critical'
                                      ? 'bg-rose-100 text-rose-700'
                                      : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  {req.severity.toUpperCase()}
                                </span>
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                                  {req.frequency.toUpperCase()}
                                </span>

                                {!isMissing ? (
                                  <button
                                    onClick={() =>
                                      matchingDoc &&
                                      setDocManagementItem({
                                        personnelId: person.id,
                                        req,
                                        doc: matchingDoc,
                                      })
                                    }
                                    className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors cursor-pointer ${statusBadgeClass[complianceStatus]}`}
                                    title="Click to manage this document"
                                  >
                                    {statusBadgeLabel[complianceStatus]}
                                  </button>
                                ) : isVerifyingThis ? (
                                  <div className="flex items-center gap-2 text-violet-600 font-bold text-xs animate-pulse">
                                    <span className="w-3 h-3 border-2 border-violet-600 border-t-transparent rounded-full animate-spin"></span>
                                    🤖 AI verifying…
                                  </div>
                                ) : isBusy ? (
                                  <div className="flex items-center gap-2 text-indigo-600 font-bold text-xs animate-pulse">
                                    <span className="w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>
                                    Uploading…
                                  </div>
                                ) : !showArchive ? (
                                  <>
                                    {isNursingLicenseRequirement(req, person.role) ? (
                                      <button
                                        onClick={() =>
                                          setLicenseModal({
                                            personnelId: person.id,
                                            req,
                                          })
                                        }
                                        disabled={isUploading}
                                        className={`px-2.5 py-1.5 rounded-md text-xs font-medium shadow-sm transition-all min-h-[32px] flex items-center gap-1 ${
                                          !isUploading
                                            ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                                            : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                                        }`}
                                        title="Primary-source verify this license via Nursys"
                                      >
                                        🛡️ Verify via Nursys
                                      </button>
                                    ) : (
                                      <label
                                        className={`px-2.5 py-1.5 rounded-md text-xs font-medium shadow-sm transition-all cursor-pointer flex items-center min-h-[32px] ${
                                          !isUploading
                                            ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                            : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                                        }`}
                                        title={isUploading ? 'Upload in progress…' : 'Upload evidence'}
                                      >
                                        Upload
                                        <input
                                          type="file"
                                          accept=".pdf,.jpg,.jpeg,.png"
                                          className="hidden"
                                          disabled={isUploading}
                                          onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) handlePersonnelUpload(person.id, req, file);
                                            e.target.value = '';
                                          }}
                                        />
                                      </label>
                                    )}
                                    {req.severity !== 'critical' && req.attestationAllowed && (
                                      <button
                                        onClick={() => handlePersonnelSignAttestation(person.id, req)}
                                        disabled={isUploading}
                                        className={`px-2.5 py-1.5 rounded-md text-xs font-medium shadow-sm transition-all min-h-[32px] ${
                                          !isUploading
                                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                            : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                                        }`}
                                      >
                                        Attest
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handlePersonnelMarkNA(person.id, req)}
                                      disabled={isUploading}
                                      className={`px-2.5 py-1.5 rounded-md text-xs font-medium shadow-sm transition-all min-h-[32px] ${
                                        !isUploading
                                          ? 'bg-slate-600 hover:bg-slate-700 text-white'
                                          : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                                      }`}
                                    >
                                      N/A
                                    </button>
                                  </>
                                ) : null}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
}
