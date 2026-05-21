'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from 'src/app/utils/supabase/client';
import {
  signAttestation,
  markNotApplicable,
  recordDocumentUpload,
  hashFileBuffer,
} from 'src/app/actions/compliance';
import type { IdentifiedGap } from '@/lib/types';

interface DashboardProps {
  facilityId: string;
  facilityReadinessScore: number;
  personnelReadinessScore: number;
  gaps: IdentifiedGap[];
}

type DashboardGap = IdentifiedGap;

type ChecklistTab = 'facility' | 'personnel';

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
  const [signingAttestationId, setSigningAttestationId] = useState<string | null>(null);
  const [markingNAId, setMarkingNAId] = useState<string | null>(null);

  // Only `is_scored === true` rules appear in the dashboard tabs.
  const scoredGaps = gaps.filter((g) => g.is_scored);
  const facilityGaps = scoredGaps.filter((g) => g.score_category === 'facility');
  const personnelGaps = scoredGaps.filter((g) => g.score_category === 'personnel');

  const recomputeScoresAfterCompletion = (gap: DashboardGap) => {
    if (!gap.is_scored) return;

    const recompute = (bucket: DashboardGap[]) => {
      if (bucket.length === 0) return 100;
      const satisfied = bucket.filter((g) => g.completed).length;
      return Math.round((satisfied / bucket.length) * 100);
    };

    if (gap.score_category === 'facility') {
      setScoreFacility(recompute(facilityGaps.map((g) => (g.id === gap.id ? { ...g, completed: true } : g))));
    } else if (gap.score_category === 'personnel') {
      setScorePersonnel(
        recompute(personnelGaps.map((g) => (g.id === gap.id ? { ...g, completed: true } : g)))
      );
    }
  };

  const markGapCompleted = (gapId: string, completionType: 'document' | 'attestation' | 'n/a') => {
    const target = gaps.find((g) => g.id === gapId);
    setGaps((prev) =>
      prev.map((g) => (g.id === gapId ? { ...g, completed: true, completionType } : g))
    );
    if (target) recomputeScoresAfterCompletion(target);
  };

  const handleUploadEvidence = async (gap: DashboardGap, file: File) => {
    if (!userAttestation) {
      alert('⚠️ You must check the legal certification box before uploading.');
      return;
    }

    setUploadingId(gap.id);
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
        document_type: gap.typeKey,
        status: 'approved',
        file_url: storagePath,
        name: file.name,
        metadata: { upload_source: 'compliance_checklist' },
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

  const renderGapRow = (gap: DashboardGap) => {
    const isBusy = uploadingId === gap.id || signingAttestationId === gap.id || markingNAId === gap.id;
    const isCompleted = Boolean(gap.completed);

    return (
      <div
        key={gap.id}
        className={`p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-colors ${
          isCompleted ? 'bg-slate-50' : 'hover:bg-slate-50/50'
        }`}
      >
        <div className="space-y-0.5 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-semibold text-sm ${isCompleted ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
              {gap.name}
            </span>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                gap.severity === 'critical' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {gap.severity.toUpperCase()}
            </span>
            {gap.frequency && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                {String(gap.frequency).replace(/_/g, ' ').toUpperCase()}
              </span>
            )}
            {isCompleted && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                {gap.completionType === 'n/a' ? 'N/A' : 'COMPLETED'}
              </span>
            )}
          </div>
          <p className={`text-[11px] font-mono ${isCompleted ? 'text-slate-300' : 'text-slate-400'}`}>
            Requirement Key: {gap.typeKey}
          </p>
          {isCompleted && (
            <p className="text-[10px] text-slate-400 italic mt-1">
              To undo, delete this record from the Document Center.
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isCompleted ? (
            <div className="text-emerald-600 font-medium text-xs">✓ Satisfied</div>
          ) : isBusy ? (
            <div className="flex items-center gap-2 text-indigo-600 font-bold text-xs animate-pulse">
              <span className="w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>
              Working…
            </div>
          ) : (
            <>
              <label
                className={`px-3 py-1.5 rounded-md text-xs font-medium shadow-sm transition-all cursor-pointer ${
                  userAttestation
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                }`}
                title={userAttestation ? 'Upload evidence' : 'Please check the legal certification box above'}
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
              I certify that this information is authentic, unaltered, and satisfies Arkansas DHS requirements.
              I understand that providing false information may result in penalties under state and federal law.
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
            <span className="ml-2 inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5 rounded-full text-[10px] bg-white text-slate-800">
              {facilityGaps.length}
            </span>
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
            <span className="ml-2 inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5 rounded-full text-[10px] bg-white text-slate-800">
              {personnelGaps.length}
            </span>
          </button>
        </div>

        {activeGaps.length === 0 ? (
          <div className="p-12 text-center text-emerald-600 text-sm font-semibold">
            ✅ All scored {activeTab === 'facility' ? 'facility' : 'personnel'} requirements are satisfied.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">{activeGaps.map(renderGapRow)}</div>
        )}
      </div>
    </div>
  );
}
