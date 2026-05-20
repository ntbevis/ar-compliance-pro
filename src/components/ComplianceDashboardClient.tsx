'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from 'src/app/utils/supabase/client';
import { handleDocumentUploadSuccess, signAttestation, markNotApplicable } from 'src/app/actions/compliance';
import { useFacility } from 'src/context/FacilityContext';

interface Gap {
  id: string;
  name: string;
  typeKey: string;
  severity: 'critical' | 'standard';
  frequency?: string; // Dynamic frequency: 'one-time', 'daily', 'weekly', 'monthly', 'annual', '2_years', '5_years', etc.
}

interface DashboardProps {
  facilityId: string;
  initialScore: number;
  initialGaps: Gap[];
}

export default function ComplianceDashboardClient({
  facilityId,
  initialScore,
  initialGaps
}: DashboardProps) {
  const router = useRouter();
  const supabase = createClient();
  
  const [gaps, setGaps] = useState<Gap[]>(initialGaps);
  const [score, setScore] = useState<number>(initialScore);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [signingAttestationId, setSigningAttestationId] = useState<string | null>(null);
  const [markingNAId, setMarkingNAId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [userAttestation, setUserAttestation] = useState<boolean>(false);
  const [auditFeedback, setAuditFeedback] = useState<{
    status: string;
    code?: string;
    action?: string;
  } | null>(null);

  // Segment gaps into critical and standard tiers
  const criticalGaps = gaps.filter(g => g.severity === 'critical' || g.id === 'staffing-ratio-deficit');
  const standardGaps = gaps.filter(g => g.severity === 'standard' && g.id !== 'staffing-ratio-deficit');

  // Universal Dropzone handler - AI will classify the document
  const handleUniversalDropzone = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Require user attestation before upload
    if (!userAttestation) {
      alert('⚠️ You must certify the authenticity of this document before uploading.');
      e.target.value = ''; // Reset file input
      return;
    }

    try {
      setIsUploading(true);
      setAuditFeedback(null);
      console.log(`🎬 Universal Dropzone upload triggered: ${file.name}`);

      // 1. Generate a standardized unique ID for the document record
      const documentId = crypto.randomUUID();
      const fileExtension = file.name.split('.').pop()?.toLowerCase() || 'txt';
      const storagePath = `${facilityId}/${documentId}.${fileExtension}`;

      // 2. Stream the raw file directly to your private storage bucket
      const { error: storageError } = await supabase.storage
        .from('facility-documents')
        .upload(storagePath, file);

      if (storageError) throw storageError;

      // 3. Insert with general_compliance_upload - AI will classify it
      const { error: insertError } = await supabase
        .from('facility_documents')
        .insert({
          id: documentId,
          facility_id: facilityId,
          document_type: 'general_compliance_upload',
          status: 'pending',
          file_url: storagePath,
          name: file.name,
          metadata: { original_upload_method: 'universal_dropzone' }
        });

      if (insertError) throw insertError;

      console.log(`🧠 Invoking AI classification and compliance verification...`);
      
      // 4. Trigger the Server Action loop with user attestation
      const response = await handleDocumentUploadSuccess(facilityId, documentId, userAttestation);

      if (response.success && response.report) {
        const report = response.report;
        
        // Lock in the live extraction details for user visibility
        setAuditFeedback({
          status: report.compliance_status,
          code: report.regulatory_code_violated,
          action: report.corrective_action
        });

        // Trigger an operational refresh to sync database states across server views
        router.refresh();
        
        // Optimistically clear matching gap if AI classified it correctly
        if (report.compliance_status === 'Compliant' && report.extracted_document_type) {
          const matchingGap = gaps.find(g => g.typeKey === report.extracted_document_type);
          
          if (matchingGap) {
            setGaps((prev) => prev.filter((g) => g.id !== matchingGap.id));
            
            // Only update score if this was a critical gap
            if (matchingGap.severity === 'critical') {
              const initialCriticalCount = initialGaps.filter(g => g.severity === 'critical' || g.id === 'staffing-ratio-deficit').length;
              setScore((prev) => Math.min(100, prev + Math.round(100 / (initialCriticalCount || 1))));
            }
          }
        }
      } else {
        alert(`Audit finished with processing issues. Please inspect system error parameters.`);
      }

    } catch (error: any) {
      console.error("❌ Universal Dropzone Exception:", error);
      alert(`Processing failed: ${error.message || error}`);
    } finally {
      setIsUploading(false);
      e.target.value = ''; // Reset file input
    }
  };

  const handleSignAttestation = async (gap: Gap) => {
    // Require user attestation before signing
    if (!userAttestation) {
      alert('⚠️ You must certify the authenticity of this attestation before signing.');
      return;
    }

    if (!confirm(`Sign digital attestation for: ${gap.name}?\n\nThis will mark the requirement as satisfied without uploading a physical document.`)) {
      return;
    }

    setSigningAttestationId(gap.id);
    try {
      const result = await signAttestation(facilityId, gap.id, userAttestation);
      
      if (result.success) {
        alert(`✅ ${result.message}`);
        
        // Remove the gap from the list
        setGaps(prevGaps => prevGaps.filter(g => g.id !== gap.id));
        
        // Only update score if this was a critical gap
        if (gap.severity === 'critical') {
          const newScore = Math.min(100, score + Math.ceil(100 / (criticalGaps.length || 1)));
          setScore(newScore);
        }
        
        router.refresh();
      } else {
        alert(`❌ Failed to sign attestation: ${result.error}`);
      }
    } catch (error) {
      console.error('Error signing attestation:', error);
      alert('❌ An unexpected error occurred');
    } finally {
      setSigningAttestationId(null);
    }
  };

  const handleNavigateToPersonnel = () => {
    // This will be handled by the parent component through context
    const { setCurrentView } = useFacility();
    setCurrentView('personnel');
  };

  const handleMarkNotApplicable = async (gap: Gap) => {
    // Require user attestation before marking N/A
    if (!userAttestation) {
      alert('⚠️ You must certify the authenticity of this N/A declaration before proceeding.');
      return;
    }

    const reason = prompt(`Mark "${gap.name}" as Not Applicable?\n\nPlease provide a brief reason (required):`);
    
    if (!reason || reason.trim() === '') {
      alert('⚠️ A reason is required to mark a requirement as N/A.');
      return;
    }

    setMarkingNAId(gap.id);
    try {
      const result = await markNotApplicable(facilityId, gap.id, reason.trim(), userAttestation);
      
      if (result.success) {
        alert(`✅ ${result.message}`);
        
        // Remove the gap from the list
        setGaps(prevGaps => prevGaps.filter(g => g.id !== gap.id));
        
        // Only update score if this was a critical gap
        if (gap.severity === 'critical') {
          const newScore = Math.min(100, score + Math.ceil(100 / (criticalGaps.length || 1)));
          setScore(newScore);
        }
        
        router.refresh();
      } else {
        alert(`❌ Failed to mark as N/A: ${result.error}`);
      }
    } catch (error) {
      console.error('Error marking as N/A:', error);
      alert('❌ An unexpected error occurred');
    } finally {
      setMarkingNAId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto text-slate-800">
      {/* Dynamic Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Core Metric Ring */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col items-center justify-center text-center">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Facility Readiness</h3>
          <div className={`w-28 h-28 rounded-full border-8 flex items-center justify-center text-2xl font-black ${
            score >= 80 ? 'border-emerald-500 text-emerald-600 bg-emerald-50' : 
            score >= 50 ? 'border-amber-500 text-amber-600 bg-amber-50' : 
            'border-rose-500 text-rose-600 bg-rose-50'
          }`}>
            {score}%
          </div>
          <p className="text-xs text-slate-400 mt-3">Calculated against Arkansas Licensing requirements.</p>
        </div>

        {/* Universal Dropzone - AI Classification */}
        <div className="md:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-800 mb-1">🎯 Universal Document Dropzone</h3>
            <p className="text-xs text-slate-400 mb-4">Drop any compliance document here. AI will automatically classify and match it to requirements.</p>
          </div>
          
          {auditFeedback ? (
            <div className={`p-4 rounded-lg border text-xs space-y-1.5 ${
              auditFeedback.status === 'Compliant'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}>
              <div className="flex items-center justify-between font-bold text-sm">
                <span>Result: {auditFeedback.status.toUpperCase()}</span>
                <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono shadow-sm">AI Classified</span>
              </div>
              <p><span className="font-semibold">Code Section:</span> {auditFeedback.code}</p>
              <p><span className="font-semibold">Remediation Action:</span> {auditFeedback.action}</p>
            </div>
          ) : (
            <label className={`border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer ${
              isUploading
                ? 'border-indigo-400 bg-indigo-50'
                : userAttestation
                ? 'border-slate-300 bg-slate-50 hover:border-indigo-500 hover:bg-indigo-50'
                : 'border-slate-200 bg-slate-50 cursor-not-allowed opacity-60'
            }`}>
              <input
                type="file"
                accept=".txt,.pdf,.png,.jpg,.jpeg"
                className="hidden"
                onChange={handleUniversalDropzone}
                disabled={!userAttestation || isUploading}
              />
              {isUploading ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-sm font-bold text-indigo-600">AI Processing...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <svg className="w-12 h-12 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-sm font-bold text-slate-700">
                    {userAttestation ? 'Click or Drop Document Here' : 'Check attestation box first'}
                  </p>
                  <p className="text-xs text-slate-400">PDF, TXT, PNG, JPG accepted</p>
                </div>
              )}
            </label>
          )}
        </div>
      </div>

      {/* Legal Attestation Checkbox - Penalty of Perjury */}
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
            <p className="text-xs text-amber-700 mt-2 italic">
              By checking this box, you acknowledge that all documents and attestations are subject to audit and legal review.
            </p>
          </label>
        </div>
      </div>

      {/* Critical Requirements Panel */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-900 px-6 py-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">Outstanding Core Facility Requirements (Critical)</h2>
        </div>

        {criticalGaps.length === 0 ? (
          <div className="p-8 text-center text-emerald-600 text-xs font-semibold">
            ✅ All critical audit requirements satisfied. Your facility is audit-ready.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {criticalGaps.map((gap) => (
              <div key={gap.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-800 text-sm">{gap.name}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      gap.severity === 'critical' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {gap.severity.toUpperCase()}
                    </span>
                    {gap.frequency && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                        {gap.frequency.replace(/_/g, ' ').toUpperCase()}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono">Requirement Key: {gap.typeKey}</p>
                </div>

                <div className="flex items-center gap-2">
                  {uploadingId === gap.id ? (
                    <div className="flex items-center gap-2 text-indigo-600 font-bold text-xs animate-pulse">
                      <span className="w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>
                      AI Verification running...
                    </div>
                  ) : signingAttestationId === gap.id ? (
                    <div className="flex items-center gap-2 text-emerald-600 font-bold text-xs animate-pulse">
                      <span className="w-3.5 h-3.5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></span>
                      Signing attestation...
                    </div>
                  ) : markingNAId === gap.id ? (
                    <div className="flex items-center gap-2 text-amber-600 font-bold text-xs animate-pulse">
                      <span className="w-3.5 h-3.5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin"></span>
                      Marking N/A...
                    </div>
                  ) : gap.id === 'staffing-ratio-deficit' ? (
                    /* Special UI for staffing ratio deficit - navigate to Personnel Vault */
                    <button
                      onClick={handleNavigateToPersonnel}
                      className="px-4 py-2 rounded-md text-xs font-bold shadow-sm transition-all bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-2"
                    >
                      👥 Add Staff to Vault
                    </button>
                  ) : (
                    <>
                      {/* Show attestation button for frequent requirements (daily, weekly, monthly) */}
                      {gap.frequency && ['daily', 'weekly', 'monthly'].includes(gap.frequency) ? (
                        <button
                          onClick={() => handleSignAttestation(gap)}
                          disabled={!userAttestation}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium shadow-sm transition-all min-w-[140px] ${
                            userAttestation
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                              : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                          }`}
                          title={!userAttestation ? 'Please check the legal certification box above' : ''}
                        >
                          ✓ Sign Digital Attestation
                        </button>
                      ) : null}
                      
                      {/* Mark N/A button - not available for staffing deficit */}
                      {gap.id !== 'staffing-ratio-deficit' && (
                        <button
                          onClick={() => handleMarkNotApplicable(gap)}
                          disabled={!userAttestation}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium shadow-sm transition-all ${
                            userAttestation
                              ? 'bg-slate-600 hover:bg-slate-700 text-white cursor-pointer'
                              : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                          }`}
                          title={!userAttestation ? 'Please check the legal certification box above' : 'Mark this requirement as Not Applicable'}
                        >
                          Mark N/A
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Standard Requirements Panel - Administrative Housekeeping */}
      {standardGaps.length > 0 && (
        <div className="bg-slate-50 rounded-xl shadow-sm border border-slate-300 overflow-hidden">
          <div className="bg-slate-600 px-6 py-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-100">Administrative Housekeeping (Standard Requirements)</h2>
          </div>

          <div className="divide-y divide-slate-200">
            {standardGaps.map((gap) => (
              <div key={gap.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 hover:bg-white/50 transition-colors">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-slate-700 text-sm">{gap.name}</span>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-600">
                      {gap.severity.toUpperCase()}
                    </span>
                    {gap.frequency && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-600">
                        {gap.frequency.replace(/_/g, ' ').toUpperCase()}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono">Requirement Key: {gap.typeKey}</p>
                </div>

                <div className="flex items-center gap-2">
                  {uploadingId === gap.id ? (
                    <div className="flex items-center gap-2 text-indigo-600 font-bold text-xs animate-pulse">
                      <span className="w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>
                      AI Verification running...
                    </div>
                  ) : signingAttestationId === gap.id ? (
                    <div className="flex items-center gap-2 text-emerald-600 font-bold text-xs animate-pulse">
                      <span className="w-3.5 h-3.5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></span>
                      Signing attestation...
                    </div>
                  ) : markingNAId === gap.id ? (
                    <div className="flex items-center gap-2 text-amber-600 font-bold text-xs animate-pulse">
                      <span className="w-3.5 h-3.5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin"></span>
                      Marking N/A...
                    </div>
                  ) : (
                    <>
                      {/* Show attestation button for frequent requirements (daily, weekly, monthly) */}
                      {gap.frequency && ['daily', 'weekly', 'monthly'].includes(gap.frequency) ? (
                        <button
                          onClick={() => handleSignAttestation(gap)}
                          disabled={!userAttestation}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium shadow-sm transition-all min-w-[140px] ${
                            userAttestation
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                              : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                          }`}
                          title={!userAttestation ? 'Please check the legal certification box above' : ''}
                        >
                          ✓ Sign Digital Attestation
                        </button>
                      ) : null}
                      
                      {/* Mark N/A button */}
                      <button
                        onClick={() => handleMarkNotApplicable(gap)}
                        disabled={!userAttestation}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium shadow-sm transition-all ${
                          userAttestation
                            ? 'bg-slate-500 hover:bg-slate-600 text-white cursor-pointer'
                            : 'bg-slate-300 text-slate-400 cursor-not-allowed'
                        }`}
                        title={!userAttestation ? 'Please check the legal certification box above' : 'Mark this requirement as Not Applicable'}
                      >
                        Mark N/A
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}