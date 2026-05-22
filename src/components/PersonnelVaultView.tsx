'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
} from 'src/app/actions/compliance';
import type { DocumentComplianceStatus } from '@/lib/types';

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
function calcPersonnelComplianceStatus(
  createdAt: string,
  frequency: string
): DocumentComplianceStatus {
  const created = new Date(createdAt);
  if (isNaN(created.getTime())) return 'satisfied';

  const expiry = new Date(created);
  switch (frequency) {
    case 'daily':     expiry.setDate(expiry.getDate() + 1); break;
    case 'weekly':    expiry.setDate(expiry.getDate() + 7); break;
    case 'monthly':   expiry.setMonth(expiry.getMonth() + 1); break;
    case 'quarterly': expiry.setMonth(expiry.getMonth() + 3); break;
    case 'biannual':  expiry.setMonth(expiry.getMonth() + 6); break;
    case 'annual':    expiry.setFullYear(expiry.getFullYear() + 1); break;
    case '2_years':   expiry.setFullYear(expiry.getFullYear() + 2); break;
    case '3_years':   expiry.setFullYear(expiry.getFullYear() + 3); break;
    case '5_years':   expiry.setFullYear(expiry.getFullYear() + 5); break;
    case '10_years':  expiry.setFullYear(expiry.getFullYear() + 10); break;
    default:          return 'satisfied'; // one-time / ongoing — never expires
  }

  const daysLeft = (expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 30) return 'expiring_soon';
  return 'satisfied';
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

  // Personnel-specific upload state
  const [personnelDocuments, setPersonnelDocuments] = useState<PersonnelDocument[]>([]);
  const [userAttestation, setUserAttestation] = useState<boolean>(false);
  const [uploadingReqId, setUploadingReqId] = useState<string | null>(null);
  const [signingReqId, setSigningReqId] = useState<string | null>(null);
  const [markingNAReqId, setMarkingNAReqId] = useState<string | null>(null);
  const [personnelToArchive, setPersonnelToArchive] = useState<PersonnelRecord | null>(null);

  // Document management modal state
  const [docManagementItem, setDocManagementItem] = useState<{
    personnelId: string;
    req: RoleRequirement;
    doc: PersonnelDocument;
  } | null>(null);
  const [confirmingDocDelete, setConfirmingDocDelete] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState(false);

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

  const toggleExpanded = async (person: PersonnelRecord) => {
    if (expandedPersonId === person.id) {
      setExpandedPersonId(null);
      return;
    }
    setExpandedPersonId(person.id);
    if (!requirementsByPerson[person.id]) {
      const result = await getRequirementsForRole(facilityId, person.role);
      if (result.success) {
        setRequirementsByPerson((prev) => ({ ...prev, [person.id]: result.requirements }));
      }
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
      } else {
        alert(`❌ ${result.error}`);
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
        alert(`❌ ${result.error}`);
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
          doc.status === 'approved'
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
        alert(`❌ Delete failed: ${result.error}`);
        setConfirmingDocDelete(false);
      }
    } finally {
      setDeletingDoc(false);
    }
  };

  const handlePersonnelUpload = async (
    personnelId: string,
    requirement: RoleRequirement,
    file: File
  ) => {
    if (!userAttestation) {
      alert('⚠️ You must check the legal certification box before uploading.');
      return;
    }

    setUploadingReqId(requirement.id);
    try {
      const documentId = crypto.randomUUID();
      const fileExtension = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
      const storagePath = `${facilityId}/${documentId}.${fileExtension}`;

      const { error: storageError } = await supabase.storage
        .from('facility-documents')
        .upload(storagePath, file);
      if (storageError) throw storageError;

      const { error: insertError } = await supabase.from('facility_documents').insert({
        id: documentId,
        facility_id: facilityId,
        document_type: requirement.typeKey,
        status: 'approved',
        file_url: storagePath,
        name: file.name,
        metadata: { upload_source: 'personnel_vault', personnel_id: personnelId },
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
        userAttestation,
        personnelId,
      });

      if (!result.success) {
        alert(`❌ Upload audit log failure: ${result.error}`);
        return;
      }

      const refreshedDocs = (await getPersonnelDocuments(facilityId)) as PersonnelDocument[];
      setPersonnelDocuments(refreshedDocs);
      router.refresh();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      alert(`❌ Upload failed: ${message}`);
    } finally {
      setUploadingReqId(null);
    }
  };

  const handlePersonnelSignAttestation = async (
    personnelId: string,
    requirement: RoleRequirement
  ) => {
    if (!userAttestation) {
      alert('⚠️ You must check the legal certification box before signing.');
      return;
    }
    if (!confirm(`Sign digital attestation for: ${requirement.name}?`)) return;

    setSigningReqId(requirement.id);
    try {
      const result = await signAttestation(facilityId, requirement.id, userAttestation, personnelId);
      if (result.success) {
        const refreshedDocs = (await getPersonnelDocuments(facilityId)) as PersonnelDocument[];
        setPersonnelDocuments(refreshedDocs);
        router.refresh();
      } else {
        alert(`❌ Failed to sign attestation: ${result.error}`);
      }
    } finally {
      setSigningReqId(null);
    }
  };

  const handlePersonnelMarkNA = async (personnelId: string, requirement: RoleRequirement) => {
    if (!userAttestation) {
      alert('⚠️ You must check the legal certification box before declaring N/A.');
      return;
    }
    const reason = prompt(`Mark "${requirement.name}" as Not Applicable. Provide a brief reason:`);
    if (!reason || reason.trim() === '') {
      alert('⚠️ A reason is required.');
      return;
    }

    setMarkingNAReqId(requirement.id);
    try {
      const result = await markNotApplicable(
        facilityId,
        requirement.id,
        reason.trim(),
        userAttestation,
        personnelId
      );
      if (result.success) {
        const refreshedDocs = (await getPersonnelDocuments(facilityId)) as PersonnelDocument[];
        setPersonnelDocuments(refreshedDocs);
        router.refresh();
      } else {
        alert(`❌ Failed to mark as N/A: ${result.error}`);
      }
    } finally {
      setMarkingNAReqId(null);
    }
  };

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

      {/* Document Management Modal */}
      {docManagementItem && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full">
            <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-6 py-4 rounded-t-xl flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Document Management</h2>
              <button
                onClick={() => { setDocManagementItem(null); setConfirmingDocDelete(false); }}
                className="text-white/70 hover:text-white text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Requirement</p>
                <p className="font-semibold text-slate-800">{docManagementItem.req.name}</p>
                <p className="text-[11px] font-mono text-slate-400">{docManagementItem.req.typeKey}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-4 space-y-2 border border-slate-200 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Upload Date</span>
                  <span className="font-medium text-slate-800">
                    {new Date(docManagementItem.doc.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Frequency</span>
                  <span className="font-medium text-slate-800">
                    {docManagementItem.req.frequency.replace(/_/g, ' ').toUpperCase()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Current Status</span>
                  <span className={`font-bold text-xs px-2 py-0.5 rounded-full ${
                    calcPersonnelComplianceStatus(docManagementItem.doc.created_at, docManagementItem.req.frequency) === 'expired'
                      ? 'bg-rose-100 text-rose-700'
                      : calcPersonnelComplianceStatus(docManagementItem.doc.created_at, docManagementItem.req.frequency) === 'expiring_soon'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {calcPersonnelComplianceStatus(docManagementItem.doc.created_at, docManagementItem.req.frequency) === 'expired'
                      ? '🔴 Expired'
                      : calcPersonnelComplianceStatus(docManagementItem.doc.created_at, docManagementItem.req.frequency) === 'expiring_soon'
                      ? '🟡 Expiring Soon'
                      : '✅ Satisfied'}
                  </span>
                </div>
              </div>

              {confirmingDocDelete ? (
                <div className="rounded-xl border-2 border-rose-300 bg-rose-50 p-4 space-y-3">
                  <p className="text-sm font-bold text-rose-800">
                    ⚠️ Are you sure? This will permanently delete the document and reset this requirement to &ldquo;Missing.&rdquo;
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setConfirmingDocDelete(false)}
                      disabled={deletingDoc}
                      className="flex-1 px-4 py-2 rounded-lg bg-slate-200 text-slate-700 font-medium hover:bg-slate-300 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDocDelete}
                      disabled={deletingDoc}
                      className="flex-1 px-4 py-2 rounded-lg bg-rose-600 text-white font-medium hover:bg-rose-700 disabled:opacity-50"
                    >
                      {deletingDoc ? 'Deleting…' : 'Yes, Delete Document'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmingDocDelete(true)}
                  className="w-full px-4 py-2.5 bg-rose-600 text-white rounded-lg font-medium hover:bg-rose-700 transition-colors"
                >
                  🗑️ Delete &amp; Replace Document
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Legal Certification */}
      {!showArchive && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <input
              type="checkbox"
              id="personnel-attestation"
              checked={userAttestation}
              onChange={(e) => setUserAttestation(e.target.checked)}
              className="mt-1 w-5 h-5 text-blue-600 border-amber-400 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
            />
            <label htmlFor="personnel-attestation" className="flex-1 cursor-pointer">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-bold text-amber-900">⚖️ Legal Certification Required</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                  MANDATORY
                </span>
              </div>
              <p className="text-sm text-amber-900 leading-relaxed">
                I certify that this information is authentic, unaltered, and satisfies Arkansas DHS requirements.
                I understand that providing false information may result in penalties under state and federal law.
              </p>
            </label>
          </div>
        </div>
      )}

      <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold mb-2">
            {showArchive ? 'Archived Employee Roster' : 'Active Personnel Vault'}
          </h2>
          <p className="text-xs text-slate-500">
            Click a row to view the personnel-category requirements that apply to that role.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!showArchive && (
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700"
            >
              ➕ Add Employee
            </button>
          )}
          <button
            onClick={() => setShowArchive(!showArchive)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
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
                  <div className="flex items-center gap-3">
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
                    <span className="text-xs text-slate-400">
                      Hired {new Date(person.hire_date).toLocaleDateString()}
                    </span>
                    {!showArchive && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPersonnelToArchive(person);
                        }}
                        disabled={separatingId === person.id}
                        className="text-xs font-medium px-3 py-1.5 rounded-md bg-slate-100 text-slate-700 hover:bg-rose-100 hover:text-rose-700 border border-slate-200"
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
                            ? calcPersonnelComplianceStatus(matchingDoc.created_at, req.frequency)
                            : 'missing';
                          const isMissing = complianceStatus === 'missing';
                          const isBusy =
                            uploadingReqId === req.id ||
                            signingReqId === req.id ||
                            markingNAReqId === req.id;

                          const statusBadgeClass: Record<DocumentComplianceStatus, string> = {
                            satisfied:     'bg-emerald-100 text-emerald-700 hover:bg-emerald-200',
                            expiring_soon: 'bg-amber-100 text-amber-700 hover:bg-amber-200',
                            expired:       'bg-rose-100 text-rose-700 hover:bg-rose-200',
                            missing:       '',
                          };
                          const statusBadgeLabel: Record<DocumentComplianceStatus, string> = {
                            satisfied:     '✅ Satisfied',
                            expiring_soon: '🟡 Expiring Soon',
                            expired:       '🔴 Expired',
                            missing:       '',
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
                                ) : isBusy ? (
                                  <div className="flex items-center gap-2 text-indigo-600 font-bold text-xs animate-pulse">
                                    <span className="w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>
                                    Working…
                                  </div>
                                ) : !showArchive ? (
                                  <>
                                    <label
                                      className={`px-2.5 py-1 rounded-md text-xs font-medium shadow-sm transition-all cursor-pointer ${
                                        userAttestation
                                          ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                          : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                                      }`}
                                      title={
                                        userAttestation
                                          ? 'Upload evidence'
                                          : 'Please check the legal certification box above'
                                      }
                                    >
                                      Upload
                                      <input
                                        type="file"
                                        accept=".pdf,.png,.jpg,.jpeg,.txt"
                                        className="hidden"
                                        disabled={!userAttestation}
                                        onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          if (file) handlePersonnelUpload(person.id, req, file);
                                          e.target.value = '';
                                        }}
                                      />
                                    </label>
                                    <button
                                      onClick={() => handlePersonnelSignAttestation(person.id, req)}
                                      disabled={!userAttestation}
                                      className={`px-2.5 py-1 rounded-md text-xs font-medium shadow-sm transition-all ${
                                        userAttestation
                                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                          : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                                      }`}
                                    >
                                      Attest
                                    </button>
                                    <button
                                      onClick={() => handlePersonnelMarkNA(person.id, req)}
                                      disabled={!userAttestation}
                                      className={`px-2.5 py-1 rounded-md text-xs font-medium shadow-sm transition-all ${
                                        userAttestation
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
