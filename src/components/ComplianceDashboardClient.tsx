'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from 'src/app/utils/supabase/client';
import {
  signAttestation,
  markNotApplicable,
  recordDocumentUpload,
  hashFileBuffer,
  deleteDocument,
} from 'src/app/actions/compliance';
import { verifyDocumentWithAI } from 'src/app/actions/ai-verify';
import type { DocumentComplianceStatus, IdentifiedGap } from '@/lib/types';

interface DashboardProps {
  facilityId: string;
  facilityReadinessScore: number;
  personnelReadinessScore: number;
  gaps: IdentifiedGap[];
}

type DashboardGap = IdentifiedGap;

type ChecklistTab = 'facility' | 'personnel';

// ── Score Dial ──────────────────────────────────────────────────────────────

function ScoreDial({
  label,
  emoji,
  score,
  description,
}: {
  label: string;
  emoji: string;
  score: number;
  description: string;
}) {
  const tone =
    score >= 80
      ? { border: 'border-emerald-500', text: 'text-emerald-600', bg: 'bg-emerald-50' }
      : score >= 50
      ? { border: 'border-amber-500', text: 'text-amber-600', bg: 'bg-amber-50' }
      : { border: 'border-rose-500', text: 'text-rose-600', bg: 'bg-rose-50' };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col items-center justify-center text-center">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
        <span className="mr-1.5" aria-hidden>
          {emoji}
        </span>
        {label}
      </h3>
      <div
        className={`w-32 h-32 rounded-full border-8 flex items-center justify-center text-3xl font-black ${tone.border} ${tone.text} ${tone.bg}`}
      >
        {score}%
      </div>
      <p className="text-xs text-slate-500 mt-3 max-w-[14rem]">{description}</p>
    </div>
  );
}

// ── Compliance Status Badge ──────────────────────────────────────────────────

function StatusBadge({
  status,
  onClick,
}: {
  status: DocumentComplianceStatus;
  onClick?: () => void;
}) {
  if (status === 'satisfied') {
    return (
      <button
        onClick={onClick}
        className="text-xs font-medium px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors cursor-pointer"
        title="Click to manage this document"
      >
        ✅ Satisfied
      </button>
    );
  }
  if (status === 'expiring_soon') {
    return (
      <button
        onClick={onClick}
        className="text-xs font-medium px-2.5 py-1 rounded-md bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors cursor-pointer"
        title="Click to manage this document"
      >
        🟡 Expiring Soon
      </button>
    );
  }
  if (status === 'expired') {
    return (
      <button
        onClick={onClick}
        className="text-xs font-medium px-2.5 py-1 rounded-md bg-rose-100 text-rose-700 hover:bg-rose-200 transition-colors cursor-pointer"
        title="Click to manage this document"
      >
        🔴 Expired
      </button>
    );
  }
  return null;
}

// ── Document Management Modal ────────────────────────────────────────────────

function DocManagementModal({
  gap,
  facilityId,
  onClose,
  onDeleted,
}: {
  gap: DashboardGap;
  facilityId: string;
  onClose: () => void;
  onDeleted: (gapId: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!gap.document_id) return;
    setDeleting(true);
    try {
      const result = await deleteDocument(gap.document_id, facilityId);
      if (result.success) {
        onDeleted(gap.id);
        onClose();
      } else {
        alert(`❌ Delete failed: ${result.error}`);
        setConfirming(false);
      }
    } finally {
      setDeleting(false);
    }
  };

  const statusLabel: Record<DocumentComplianceStatus, string> = {
    satisfied: 'Satisfied',
    expiring_soon: 'Expiring Soon',
    expired: 'Expired',
    missing: 'Missing',
  };

  const statusColor: Record<DocumentComplianceStatus, string> = {
    satisfied: 'text-emerald-700 bg-emerald-100',
    expiring_soon: 'text-amber-700 bg-amber-100',
    expired: 'text-rose-700 bg-rose-100',
    missing: 'text-slate-700 bg-slate-100',
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full">
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-6 py-4 rounded-t-xl flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Document Management</h2>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Requirement details */}
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Requirement</p>
                <p className="font-semibold text-slate-800">{gap.name}</p>
                <p className="text-[11px] font-mono text-slate-400 mt-0.5">{gap.typeKey}</p>
              </div>
              <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${statusColor[gap.compliance_status]}`}>
                {statusLabel[gap.compliance_status]}
              </span>
            </div>
          </div>

          <div className="bg-slate-50 rounded-lg p-4 space-y-2 border border-slate-200">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Frequency</span>
              <span className="font-medium text-slate-800">
                {String(gap.frequency).replace(/_/g, ' ').toUpperCase()}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Upload Date</span>
              <span className="font-medium text-slate-800">
                {gap.document_created_at
                  ? new Date(gap.document_created_at).toLocaleDateString()
                  : '—'}
              </span>
            </div>
          </div>

          {/* Inline delete confirmation */}
          {confirming ? (
            <div className="rounded-xl border-2 border-rose-300 bg-rose-50 p-4 space-y-3">
              <p className="text-sm font-bold text-rose-800">
                ⚠️ Are you sure? This will permanently delete the document and reset this requirement to "Missing."
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirming(false)}
                  disabled={deleting}
                  className="flex-1 px-4 py-2 rounded-lg bg-slate-200 text-slate-700 font-medium hover:bg-slate-300 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 px-4 py-2 rounded-lg bg-rose-600 text-white font-medium hover:bg-rose-700 disabled:opacity-50"
                >
                  {deleting ? 'Deleting…' : 'Yes, Delete Document'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              disabled={!gap.document_id}
              className="w-full px-4 py-2.5 bg-rose-600 text-white rounded-lg font-medium hover:bg-rose-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              🗑️ Delete &amp; Replace Document
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard Component ─────────────────────────────────────────────────

export default function ComplianceDashboardClient({
  facilityId,
  facilityReadinessScore,
  personnelReadinessScore,
  gaps: initialGaps,
}: DashboardProps) {
  const router = useRouter();
  const supabase = createClient();

  const [gaps, setGaps] = useState<DashboardGap[]>(initialGaps);
  const [scoreFacility, setScoreFacility] = useState<number>(facilityReadinessScore);
  const [scorePersonnel, setScorePersonnel] = useState<number>(personnelReadinessScore);
  const [activeTab, setActiveTab] = useState<ChecklistTab>('facility');
  const [userAttestation, setUserAttestation] = useState<boolean>(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [signingAttestationId, setSigningAttestationId] = useState<string | null>(null);
  const [markingNAId, setMarkingNAId] = useState<string | null>(null);

  // Document management modal
  const [docManagementGap, setDocManagementGap] = useState<DashboardGap | null>(null);

  // AI rejection modal
  const [rejectionModal, setRejectionModal] = useState<{
    requirementName: string;
    detectedType: string;
    confidence: number;
    reason: string;
  } | null>(null);

  // Scored rules partitioned by category
  const scoredGaps = gaps.filter((g) => g.is_scored);
  const facilityGaps = scoredGaps.filter((g) => g.score_category === 'facility');
  const personnelGaps = scoredGaps.filter((g) => g.score_category === 'personnel');

  // Tab badge count = rules that need attention
  const needsAttention = (g: DashboardGap) =>
    !g.completed && g.compliance_status !== 'satisfied';

  const facilityAttentionCount = facilityGaps.filter(needsAttention).length;
  const personnelAttentionCount = personnelGaps.filter(needsAttention).length;

  // ── Score recomputation ────────────────────────────────────────────────────

  const recomputeScoresAfterCompletion = (gap: DashboardGap) => {
    if (!gap.is_scored) return;
    const countSatisfied = (bucket: DashboardGap[]) => {
      if (bucket.length === 0) return 100;
      const satisfied = bucket.filter(
        (g) => g.completed || g.compliance_status !== 'missing'
      ).length;
      return Math.round((satisfied / bucket.length) * 100);
    };
    if (gap.score_category === 'facility') {
      setScoreFacility(
        countSatisfied(
          facilityGaps.map((g) => (g.id === gap.id ? { ...g, completed: true } : g))
        )
      );
    } else if (gap.score_category === 'personnel') {
      setScorePersonnel(
        countSatisfied(
          personnelGaps.map((g) => (g.id === gap.id ? { ...g, completed: true } : g))
        )
      );
    }
  };

  const markGapCompleted = (gapId: string, completionType: 'document' | 'attestation' | 'n/a') => {
    const target = gaps.find((g) => g.id === gapId);
    setGaps((prev) =>
      prev.map((g) =>
        g.id === gapId
          ? { ...g, completed: true, completionType, compliance_status: 'satisfied' }
          : g
      )
    );
    if (target) recomputeScoresAfterCompletion(target);
  };

  // When a document is deleted: reset the gap back to 'missing' so action buttons reappear
  const handleDocDeleted = (gapId: string) => {
    setGaps((prev) =>
      prev.map((g) =>
        g.id === gapId
          ? { ...g, compliance_status: 'missing', completed: false, document_id: undefined, document_created_at: undefined }
          : g
      )
    );
    router.refresh();
  };

  // ── Upload / Attest / N/A handlers ────────────────────────────────────────

  const handleUploadEvidence = async (gap: DashboardGap, file: File) => {
    if (!userAttestation) {
      alert('⚠️ You must check the legal certification box before uploading.');
      return;
    }

    // ── Step 1: AI Verification ───────────────────────────────────────────────
    setVerifyingId(gap.id);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('requirementName', gap.name);

      const aiResult = await verifyDocumentWithAI(formData);

      if (!aiResult.success) {
        // AI service error — fail open with a warning so users aren't blocked
        console.warn('⚠️ AI verification service unavailable, proceeding with upload:', aiResult.error);
      } else if (!aiResult.object.is_valid_match) {
        // AI rejected the document — show rejection modal and abort
        setRejectionModal({
          requirementName: gap.name,
          detectedType: aiResult.object.detected_document_type,
          confidence: aiResult.object.confidence_score,
          reason: aiResult.object.rejection_reason ?? 'The document did not match the requirement.',
        });
        return;
      }

      // AI approved — extract expiration date if available
      const aiExpirationDate = aiResult.success
        ? (aiResult.object.expiration_date ?? undefined)
        : undefined;

      // ── Step 2: Storage Upload ──────────────────────────────────────────────
      setVerifyingId(null);
      setUploadingId(gap.id);

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
        document_type: gap.typeKey,
        status: 'approved',
        file_url: storagePath,
        name: file.name,
        metadata: {
          upload_source: 'compliance_checklist',
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
        documentType: gap.typeKey,
        fileName: file.name,
        fileSize: file.size,
        fileHash,
        userAttestation,
        aiExpirationDate,
      });

      if (!result.success) {
        alert(`❌ Upload audit log failure: ${result.error}`);
        return;
      }

      markGapCompleted(gap.id, 'document');
      router.refresh();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      alert(`❌ Upload failed: ${message}`);
    } finally {
      setVerifyingId(null);
      setUploadingId(null);
    }
  };

  const handleSignAttestation = async (gap: DashboardGap) => {
    if (!userAttestation) {
      alert('⚠️ You must check the legal certification box before signing.');
      return;
    }
    if (!confirm(`Sign digital attestation for: ${gap.name}?`)) return;

    setSigningAttestationId(gap.id);
    try {
      const result = await signAttestation(facilityId, gap.id, userAttestation);
      if (result.success) {
        markGapCompleted(gap.id, 'attestation');
        router.refresh();
      } else {
        alert(`❌ Failed to sign attestation: ${result.error}`);
      }
    } finally {
      setSigningAttestationId(null);
    }
  };

  const handleMarkNotApplicable = async (gap: DashboardGap) => {
    if (!userAttestation) {
      alert('⚠️ You must check the legal certification box before declaring N/A.');
      return;
    }
    const reason = prompt(`Mark "${gap.name}" as Not Applicable. Provide a brief reason:`);
    if (!reason || reason.trim() === '') {
      alert('⚠️ A reason is required.');
      return;
    }

    setMarkingNAId(gap.id);
    try {
      const result = await markNotApplicable(facilityId, gap.id, reason.trim(), userAttestation);
      if (result.success) {
        markGapCompleted(gap.id, 'n/a');
        router.refresh();
      } else {
        alert(`❌ Failed to mark as N/A: ${result.error}`);
      }
    } finally {
      setMarkingNAId(null);
    }
  };

  // ── Row renderer ──────────────────────────────────────────────────────────

  const renderGapRow = (gap: DashboardGap) => {
    const isVerifying = verifyingId === gap.id;
    const isBusy =
      isVerifying ||
      uploadingId === gap.id ||
      signingAttestationId === gap.id ||
      markingNAId === gap.id;

    const status = gap.completed ? 'satisfied' : gap.compliance_status;
    const isMissing = status === 'missing';

    return (
      <div
        key={gap.id}
        className={`p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-colors ${
          !isMissing ? 'bg-slate-50/60' : 'hover:bg-slate-50/50'
        }`}
      >
        <div className="space-y-0.5 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`font-semibold text-sm ${
                !isMissing ? 'text-slate-500' : 'text-slate-800'
              }`}
            >
              {gap.name}
            </span>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                gap.severity === 'critical'
                  ? 'bg-rose-100 text-rose-700'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {gap.severity.toUpperCase()}
            </span>
            {gap.frequency && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                {String(gap.frequency).replace(/_/g, ' ').toUpperCase()}
              </span>
            )}
          </div>
          <p className="text-[11px] font-mono text-slate-400">
            Requirement Key: {gap.typeKey}
          </p>
          {!isMissing && gap.document_created_at && (
            <p className="text-[10px] text-slate-400 italic mt-0.5">
              Uploaded {new Date(gap.document_created_at).toLocaleDateString()} · Click badge to manage
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!isMissing ? (
            <StatusBadge
              status={status}
              onClick={() => setDocManagementGap(gap)}
            />
          ) : isVerifying ? (
            <div className="flex items-center gap-2 text-violet-600 font-bold text-xs animate-pulse">
              <span className="w-3.5 h-3.5 border-2 border-violet-600 border-t-transparent rounded-full animate-spin"></span>
              🤖 AI verifying…
            </div>
          ) : isBusy ? (
            <div className="flex items-center gap-2 text-indigo-600 font-bold text-xs animate-pulse">
              <span className="w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>
              Uploading…
            </div>
          ) : (
            <>
              <label
                className={`px-3 py-1.5 rounded-md text-xs font-medium shadow-sm transition-all cursor-pointer ${
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
                    if (file) handleUploadEvidence(gap, file);
                    e.target.value = '';
                  }}
                />
              </label>
              <button
                onClick={() => handleSignAttestation(gap)}
                disabled={!userAttestation}
                className={`px-3 py-1.5 rounded-md text-xs font-medium shadow-sm transition-all ${
                  userAttestation
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                }`}
              >
                Sign Attestation
              </button>
              <button
                onClick={() => handleMarkNotApplicable(gap)}
                disabled={!userAttestation}
                className={`px-3 py-1.5 rounded-md text-xs font-medium shadow-sm transition-all ${
                  userAttestation
                    ? 'bg-slate-600 hover:bg-slate-700 text-white'
                    : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                }`}
              >
                Mark N/A
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  const activeGaps = activeTab === 'facility' ? facilityGaps : personnelGaps;

  return (
    <div className="space-y-6 max-w-6xl mx-auto text-slate-800">
      {/* AI Rejection Modal */}
      {rejectionModal && (
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
                    {rejectionModal.requirementName}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 font-medium">Document Detected</span>
                  <span className="text-slate-800 font-semibold">{rejectionModal.detectedType}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 font-medium">AI Confidence</span>
                  <span className={`font-bold text-xs px-2 py-0.5 rounded-full ${
                    rejectionModal.confidence >= 70 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {rejectionModal.confidence}%
                  </span>
                </div>
              </div>
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-rose-700 mb-1">
                  Rejection Reason
                </p>
                <p className="text-sm text-rose-900 leading-relaxed">{rejectionModal.reason}</p>
              </div>
              <p className="text-xs text-slate-500 italic">
                Please upload the correct document and try again. If you believe this is an error, use &ldquo;Sign Attestation&rdquo; to manually certify compliance.
              </p>
              <button
                onClick={() => setRejectionModal(null)}
                className="w-full px-4 py-2.5 bg-slate-800 text-white rounded-lg font-medium hover:bg-slate-700 transition-colors"
              >
                Dismiss & Try Again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Management Modal */}
      {docManagementGap && (
        <DocManagementModal
          gap={docManagementGap}
          facilityId={facilityId}
          onClose={() => setDocManagementGap(null)}
          onDeleted={handleDocDeleted}
        />
      )}

      {/* Twin Dials */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ScoreDial
          label="Facility Operations Score"
          emoji="🏢"
          score={scoreFacility}
          description="Building, food service, transportation, water and structural compliance."
        />
        <ScoreDial
          label="Personnel & Licensing Upkeep"
          emoji="👥"
          score={scorePersonnel}
          description="Staff credentials, background checks, role-specific certifications."
        />
      </div>

      {/* Legal certification */}
      <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <input
            type="checkbox"
            id="user-attestation"
            checked={userAttestation}
            onChange={(e) => setUserAttestation(e.target.checked)}
            className="mt-1 w-5 h-5 text-blue-600 border-amber-400 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
          />
          <label htmlFor="user-attestation" className="flex-1 cursor-pointer">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-bold text-amber-900">⚖️ Legal Certification Required</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                MANDATORY
              </span>
            </div>
            <p className="text-sm text-amber-900 leading-relaxed">
              I certify that this information is authentic, unaltered, and satisfies Arkansas DHS
              requirements. I understand that providing false information may result in penalties under
              state and federal law.
            </p>
          </label>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="border-b border-slate-200 flex" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === 'facility'}
            onClick={() => setActiveTab('facility')}
            className={`flex-1 px-6 py-4 font-bold text-sm transition-colors ${
              activeTab === 'facility'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            🏢 Building &amp; Facility Checklist
            {facilityAttentionCount > 0 && (
              <span className="ml-2 inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5 rounded-full text-[10px] bg-rose-100 text-rose-800">
                {facilityAttentionCount}
              </span>
            )}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'personnel'}
            onClick={() => setActiveTab('personnel')}
            className={`flex-1 px-6 py-4 font-bold text-sm transition-colors ${
              activeTab === 'personnel'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            👥 Staff &amp; Personnel Vault
            {personnelAttentionCount > 0 && (
              <span className="ml-2 inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5 rounded-full text-[10px] bg-rose-100 text-rose-800">
                {personnelAttentionCount}
              </span>
            )}
          </button>
        </div>

        {activeGaps.length === 0 ? (
          <div className="p-12 text-center text-emerald-600 text-sm font-semibold">
            ✅ All scored {activeTab === 'facility' ? 'facility' : 'personnel'} requirements are
            satisfied.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">{activeGaps.map(renderGapRow)}</div>
        )}
      </div>
    </div>
  );
}
