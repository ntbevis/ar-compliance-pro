// src/app/admin/seed-laws/page.tsx
'use client';

import { useState, useTransition, useEffect } from 'react';
import { triggerStateWebSync, getAvailableSubClassifications } from './actions';

export default function AdminSeedLawsPage() {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ success?: boolean; message?: string } | null>(null);
  const [selectedSubClass, setSelectedSubClass] = useState<string>('all');
  const [subClassifications, setSubClassifications] = useState<{
    childcare: string[];
    healthcare: string[];
  }>({ childcare: [], healthcare: [] });

  useEffect(() => {
    // Load available sub-classifications on mount
    getAvailableSubClassifications().then(setSubClassifications);
  }, []);

  const handleSyncClick = () => {
    setStatus(null);
    
    // useTransition keeps the UI smooth and responsive while the server works
    startTransition(async () => {
      const subClassToSync = selectedSubClass === 'all' ? undefined : selectedSubClass;
      const result = await triggerStateWebSync(subClassToSync);
      
      if (result.success) {
        setStatus({ success: true, message: result.message });
      } else {
        setStatus({ success: false, message: result.error || 'Synchronisation encountered an issue.' });
      }
    });
  };

  const allSubClassifications = [
    ...subClassifications.childcare,
    ...subClassifications.healthcare
  ];

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header section */}
      <div className="mb-8 border-b pb-6">
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">System Administration Control</h1>
        <p className="text-gray-500 mt-2 text-sm md:text-base">
          Process and vectorize local regulatory documents using AI-powered text extraction and embedding generation.
        </p>
      </div>

      {/* Main interactive operational card */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Local Document Processing Engine</h2>
            <p className="text-xs text-gray-400 mt-1">
              Processing: Arkansas DCCECE (Childcare) & OLTC (Nursing Homes) Regulatory Documents
            </p>
          </div>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-800 border border-green-200">
            Local File Pipeline
          </span>
        </div>

        {/* Sub-Classification Selector */}
        <div className="mb-6">
          <label htmlFor="subclass-select" className="block text-sm font-semibold text-gray-700 mb-3">
            Target Sub-Classification Scope
          </label>
          <select
            id="subclass-select"
            value={selectedSubClass}
            onChange={(e) => setSelectedSubClass(e.target.value)}
            disabled={isPending}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
          >
            <option value="all">🌐 All Sub-Classifications (Complete Sync)</option>
            
            {subClassifications.childcare.length > 0 && (
              <optgroup label="🧸 Childcare Facilities">
                {subClassifications.childcare.map((subClass) => (
                  <option key={subClass} value={subClass}>
                    {subClass}
                  </option>
                ))}
              </optgroup>
            )}
            
            {subClassifications.healthcare.length > 0 && (
              <optgroup label="🏥 Healthcare Facilities">
                {subClassifications.healthcare.map((subClass) => (
                  <option key={subClass} value={subClass}>
                    {subClass}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <p className="text-xs text-gray-500 mt-2">
            Select a specific licensing sub-classification to sync only its regulatory requirements, or choose "All" to perform a complete system-wide sync.
          </p>
        </div>

        <div className="text-sm text-gray-600 mb-6 space-y-2">
          <p className="font-medium text-gray-700">When triggered, this server task executes the following atomic operations:</p>
          <ul className="list-disc list-inside space-y-1 text-gray-500 pl-2">
            <li>Loads regulatory PDF documents from local seed-laws directory.</li>
            <li>Extracts text using AI-powered PDF parsing (pdf2json).</li>
            <li>Passes content to OpenAI models to isolate core operational requirements.</li>
            <li>Tags extracted rules with precise 4-tier sub-classification metadata.</li>
            <li>Purges obsolete vector database entries cleanly to avoid context fragmentation.</li>
            <li>Stores optimized, clean 1536-dimension embeddings inside your Supabase tables.</li>
          </ul>
        </div>

        {/* Dynamic button component */}
        <button
          onClick={handleSyncClick}
          disabled={isPending}
          className={`w-full py-3.5 px-4 rounded-lg font-medium text-white transition-all duration-200 shadow-sm ${
            isPending
              ? 'bg-gray-400 cursor-not-allowed shadow-none'
              : 'bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99]'
          }`}
        >
          {isPending ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
              Processing Local Documents & Vectorizing...
            </span>
          ) : (
            <>
              {selectedSubClass === 'all'
                ? '🔄 Process Local Regulatory Documents (All Classifications)'
                : `🎯 Process: ${selectedSubClass}`
              }
            </>
          )}
        </button>

        {/* Status Reporting Banner */}
        {status && (
          <div
            className={`mt-6 p-4 rounded-lg border text-sm flex items-start gap-2.5 animate-fadeIn ${
              status.success
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            <span className="text-lg">{status.success ? '✅' : '❌'}</span>
            <div>
              <p className="font-semibold">{status.success ? 'Success' : 'Operation Failed'}</p>
              <p className="text-xs opacity-90 mt-0.5">{status.message}</p>
            </div>
          </div>
        )}
      </div>

      {/* Info Panel */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-1">4-Tier Sub-Classification System</p>
            <p className="text-xs text-blue-700 leading-relaxed">
              Our compliance engine now distinguishes between <strong>Licensed Child Care Center (CCC)</strong>, <strong>Licensed Family Child Care Home (FCCH)</strong>, <strong>Skilled Nursing Facility (SNF)</strong>, and <strong>Assisted Living Facility (Tier I/II)</strong>. This ensures regulatory requirements are precisely matched to each facility's exact licensing classification.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
