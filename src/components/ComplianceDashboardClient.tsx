'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from 'src/app/utils/supabase/client';
import { handleDocumentUploadSuccess } from 'src/app/actions/compliance';

interface Gap {
  id: string;
  name: string;
  typeKey: string;
  severity: 'critical' | 'standard';
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
  const [auditFeedback, setAuditFeedback] = useState<{
    status: string;
    code?: string;
    action?: string;
  } | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, gap: Gap) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingId(gap.id);
      setAuditFeedback(null);
      console.log(`🎬 Upload triggered for checklist element: ${gap.name}`);

      // 1. Generate a standardized unique ID for the document record
      const documentId = crypto.randomUUID();
      const fileExtension = file.name.split('.').pop()?.toLowerCase() || 'txt';
      const storagePath = `${facilityId}/${documentId}.${fileExtension}`;

      // 2. Stream the raw file directly to your private storage bucket
      const { error: storageError } = await supabase.storage
        .from('facility-documents')
        .upload(storagePath, file);

      if (storageError) throw storageError;

      // 3. Insert the tracking row into facility_documents matching your schema columns
      const { error: insertError } = await supabase
        .from('facility_documents')
        .insert({
          id: documentId,
          facility_id: facilityId,
          document_type: gap.typeKey,
          status: 'pending',
          file_url: storagePath,
          name: file.name,
          metadata: { original_upload_method: 'dashboard_ui' }
        });

      if (insertError) throw insertError;

      console.log(`🧠 Invoking real-time AI compliance verification...`);
      
      // 4. Trigger the Server Action loop
      const response = await handleDocumentUploadSuccess(facilityId, documentId);

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
        
        // Optimistically clear passing items out of the list view immediately
        if (report.compliance_status === 'Compliant') {
          setGaps((prev) => prev.filter((g) => g.id !== gap.id));
          setScore((prev) => Math.min(100, prev + Math.round(100 / (initialGaps.length || 1))));
        }
      } else {
        alert(`Audit finished with processing issues. Please inspect system error parameters.`);
      }

    } catch (error: any) {
      console.error("❌ UI Upload Flow Exception:", error);
      alert(`Processing failed: ${error.message || error}`);
    } finally {
      setUploadingId(null);
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

        {/* Live Audit Desk Interface */}
        <div className="md:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-800 mb-1">AR_Compliance_Guard Audit Desk</h3>
            <p className="text-xs text-slate-400 mb-4">Upload facility files below. The system converts layouts natively via multimodal AI to run precise vector-law evaluations.</p>
          </div>
          
          {auditFeedback ? (
            <div className={`p-4 rounded-lg border text-xs space-y-1.5 ${
              auditFeedback.status === 'Compliant' 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}>
              <div className="flex items-center justify-between font-bold text-sm">
                <span>Result: {auditFeedback.status.toUpperCase()}</span>
                <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono shadow-sm">Pristine Verification</span>
              </div>
              <p><span className="font-semibold">Code Section:</span> {auditFeedback.code}</p>
              <p><span className="font-semibold">Remediation Action:</span> {auditFeedback.action}</p>
            </div>
          ) : (
            <div className="border-2 border-dashed border-slate-200 bg-slate-50 rounded-lg p-5 text-center text-xs text-slate-400 italic">
              Awaiting real-time ingestion triggers...
            </div>
          )}
        </div>
      </div>

      {/* Checklist View Panel */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-900 px-6 py-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">Outstanding Core Facility Requirements</h2>
        </div>

        {gaps.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs italic">
            🎉 Maximum Precision Compliance Verified. No outstanding tracking gaps remain.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {gaps.map((gap) => (
              <div key={gap.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800 text-sm">{gap.name}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      gap.severity === 'critical' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {gap.severity.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono">Requirement Key: {gap.typeKey}</p>
                </div>

                <div className="flex items-center">
                  {uploadingId === gap.id ? (
                    <div className="flex items-center gap-2 text-indigo-600 font-bold text-xs animate-pulse">
                      <span className="w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>
                      AI Verification running...
                    </div>
                  ) : (
                    <label className="cursor-pointer bg-white border border-slate-300 text-slate-800 hover:border-indigo-500 hover:text-indigo-600 px-3 py-1.5 rounded-md text-xs font-medium shadow-sm transition-all block text-center min-w-[120px]">
                      Upload Document
                      <input
                        type="file"
                        accept=".txt,.pdf,.png,.jpg,.jpeg"
                        className="hidden"
                        onChange={(e) => handleFileChange(e, gap)}
                      />
                    </label>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}