'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  getPendingDocuments,
  getAdminDocumentUrl,
  approveDocument,
  rejectDocument,
  type PendingDocument,
} from '@/app/actions/admin';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateString: string) {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function isImageUrl(url: string) {
  const path = url.split('?')[0].toLowerCase();
  return /\.(jpg|jpeg|png|gif|webp)$/.test(path);
}

// ---------------------------------------------------------------------------
// Review Modal
// ---------------------------------------------------------------------------

function ReviewModal({
  doc,
  onClose,
  onResolved,
}: {
  doc: PendingDocument;
  onClose: () => void;
  onResolved: (id: string) => void;
}) {
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [isLoadingDoc, setIsLoadingDoc] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  useEffect(() => {
    // Fetches a short-lived signed URL for the document (external system).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoadingDoc(true);
    getAdminDocumentUrl(doc.id, doc.facility_id)
      .then((result) => {
        if (result.success) setDocumentUrl(result.url ?? null);
      })
      .finally(() => setIsLoadingDoc(false));
  }, [doc.id, doc.facility_id]);

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      const result = await approveDocument(doc.id, doc.facility_id);
      if (result.success) {
        toast.success(result.message);
        onResolved(doc.id);
        onClose();
      } else {
        toast.error(result.error ?? 'Failed to approve document');
      }
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      toast.error('Please enter a rejection reason.');
      return;
    }
    setIsRejecting(true);
    try {
      const result = await rejectDocument(doc.id, doc.facility_id, rejectionReason);
      if (result.success) {
        toast.success(result.message);
        onResolved(doc.id);
        onClose();
      } else {
        toast.error(result.error ?? 'Failed to reject document');
      }
    } finally {
      setIsRejecting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div
        className="bg-slate-900 border border-slate-700 sm:rounded-2xl shadow-2xl w-full sm:max-w-5xl flex flex-col overflow-hidden"
        style={{ maxHeight: '95vh' }}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-white truncate">{doc.name}</h2>
            <p className="text-slate-400 text-xs mt-0.5">
              {doc.org_name} &rsaquo; {doc.facility_name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 shrink-0 text-white/60 hover:text-white text-2xl leading-none transition-colors"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div
          className="flex-1 grid grid-cols-1 lg:grid-cols-[3fr_2fr] divide-y lg:divide-y-0 lg:divide-x divide-slate-700 overflow-hidden"
          style={{ minHeight: 0 }}
        >
          {/* Document viewer pane */}
          <div className="bg-slate-950 flex flex-col items-center justify-center min-h-64 overflow-hidden">
            {isLoadingDoc ? (
              <div className="flex flex-col items-center gap-3 text-slate-400">
                <div className="w-8 h-8 border-4 border-slate-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm">Loading document…</p>
              </div>
            ) : documentUrl ? (
              isImageUrl(documentUrl) ? (
                <img
                  src={documentUrl}
                  alt={doc.name}
                  className="w-full h-full object-contain p-4 max-h-[60vh]"
                />
              ) : (
                <iframe
                  src={documentUrl}
                  title={doc.name}
                  className="w-full h-full border-0"
                  style={{ minHeight: '340px' }}
                />
              )
            ) : (
              <div className="text-center space-y-3 p-8">
                <p className="text-5xl">📄</p>
                <p className="text-sm text-slate-400">No file attachment available</p>
              </div>
            )}
          </div>

          {/* Metadata + action pane */}
          <div className="p-6 space-y-6 overflow-y-auto bg-slate-900">
            {/* Document info */}
            <div className="space-y-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                  Requirement
                </p>
                <p className="font-semibold text-white text-sm leading-snug">{doc.name}</p>
                {doc.document_type && (
                  <p className="text-[11px] font-mono text-slate-500 mt-0.5">{doc.document_type}</p>
                )}
              </div>

              <div className="bg-slate-800 rounded-lg p-4 space-y-3 border border-slate-700 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-400">Organization</span>
                  <span className="font-medium text-white text-right">{doc.org_name}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-400">Facility</span>
                  <span className="font-medium text-white text-right">{doc.facility_name}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-400">Submitted</span>
                  <span className="font-medium text-white text-right">{formatDate(doc.created_at)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-400">Status</span>
                  <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded text-xs font-bold uppercase tracking-wider">
                    Pending Review
                  </span>
                </div>
              </div>

              {/* AI metadata if present */}
              {doc.metadata && typeof doc.metadata === 'object' && (
                <div className="bg-violet-950/40 border border-violet-700/30 rounded-lg p-4 space-y-2 text-sm">
                  <p className="text-[10px] font-black uppercase tracking-widest text-violet-400">
                    🤖 AI Metadata
                  </p>
                  {typeof doc.metadata.ai_extracted_expiration === 'string' && (
                    <div className="flex justify-between">
                      <span className="text-violet-300/70">Expiration (AI)</span>
                      <span className="font-semibold text-violet-200">
                        {new Date(doc.metadata.ai_extracted_expiration).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  {typeof doc.metadata.upload_source === 'string' && (
                    <div className="flex justify-between">
                      <span className="text-violet-300/70">Source</span>
                      <span className="font-medium text-violet-200 capitalize">
                        {String(doc.metadata.upload_source).replace(/_/g, ' ')}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="space-y-3 pt-2">
              {/* Approve */}
              <button
                onClick={handleApprove}
                disabled={isApproving || isRejecting || showRejectForm}
                className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl font-bold text-sm uppercase tracking-wider transition-all bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isApproving ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Approving…
                  </>
                ) : (
                  '✅ Approve Document'
                )}
              </button>

              {/* Reject flow */}
              {!showRejectForm ? (
                <button
                  onClick={() => setShowRejectForm(true)}
                  disabled={isApproving || isRejecting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl font-bold text-sm uppercase tracking-wider transition-all bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 border border-rose-600/30 hover:border-rose-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ❌ Reject Document
                </button>
              ) : (
                <div className="rounded-xl border border-rose-700/40 bg-rose-950/30 p-4 space-y-3">
                  <p className="text-sm font-bold text-rose-300">Rejection Reason</p>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Explain why this document is being rejected (required)…"
                    rows={3}
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500 resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setShowRejectForm(false); setRejectionReason(''); }}
                      disabled={isRejecting}
                      className="flex-1 px-3 py-2 rounded-lg bg-slate-700 text-slate-300 font-medium text-sm hover:bg-slate-600 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleReject}
                      disabled={isRejecting || !rejectionReason.trim()}
                      className="flex-1 px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isRejecting ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Rejecting…
                        </span>
                      ) : (
                        'Confirm Rejection'
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function DocumentReviewQueuePage() {
  const [documents, setDocuments] = useState<PendingDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<PendingDocument | null>(null);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getPendingDocuments();
      if (result.success) {
        setDocuments(result.documents);
      } else {
        toast.error(result.error ?? 'Failed to load pending documents');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Mount-time data fetch (external system); loadDocuments owns its own state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDocuments();
  }, [loadDocuments]);

  const handleResolved = (id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-6 md:p-12">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-indigo-600/20 rounded-xl flex items-center justify-center border border-indigo-500/30 text-xl shrink-0">
              🗂️
            </div>
            <div>
              <h1 className="text-2xl md:text-4xl font-black tracking-tight">Document Review Queue</h1>
              <p className="text-slate-400 text-sm mt-1">
                Global queue of facility documents pending human review.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-6">
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-sm font-medium transition-colors text-slate-300 min-h-[44px]"
            >
              ← Admin Home
            </Link>
            <button
              onClick={loadDocuments}
              disabled={loading}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 min-h-[44px]"
            >
              {loading ? 'Refreshing…' : '🔄 Refresh'}
            </button>
            <div className="text-sm text-slate-400">
              <span className="font-bold text-indigo-400">{documents.length}</span>{' '}
              document{documents.length !== 1 ? 's' : ''} awaiting review
            </div>
          </div>
        </div>

        {/* Loading */}
        {loading && documents.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-slate-400 text-sm font-medium">Loading pending documents…</p>
          </div>
        )}

        {/* Empty */}
        {!loading && documents.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 border-2 border-dashed border-slate-800 rounded-2xl">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4 text-2xl">
              ✅
            </div>
            <h3 className="text-xl font-bold text-slate-300 mb-2">Queue is Clear</h3>
            <p className="text-slate-500 text-sm">No documents are currently pending review.</p>
          </div>
        )}

        {/* Table */}
        {!loading && documents.length > 0 && (
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden backdrop-blur-sm">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  <th className="text-left px-6 py-4">Organization</th>
                  <th className="text-left px-6 py-4">Facility</th>
                  <th className="text-left px-6 py-4">Requirement / Document</th>
                  <th className="text-left px-6 py-4">Date Submitted</th>
                  <th className="px-6 py-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {documents.map((doc) => (
                  <tr
                    key={doc.id}
                    className="hover:bg-slate-800/30 transition-colors group"
                  >
                    <td className="px-6 py-4 font-medium text-white whitespace-nowrap">
                      {doc.org_name}
                    </td>
                    <td className="px-6 py-4 text-slate-300 whitespace-nowrap">
                      {doc.facility_name}
                    </td>
                    <td className="px-6 py-4 max-w-xs">
                      <p className="font-semibold text-white leading-snug">{doc.name}</p>
                      {doc.document_type && (
                        <p className="text-[11px] font-mono text-slate-500 mt-0.5 truncate">
                          {doc.document_type}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-400 whitespace-nowrap">
                      {formatDate(doc.created_at)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setSelectedDoc(doc)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 border border-indigo-500/30 hover:border-indigo-500/60 rounded-lg font-bold text-xs uppercase tracking-wider transition-all"
                      >
                        Review →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>

      {/* Review Modal */}
      {selectedDoc && (
        <ReviewModal
          doc={selectedDoc}
          onClose={() => setSelectedDoc(null)}
          onResolved={handleResolved}
        />
      )}
    </div>
  );
}
