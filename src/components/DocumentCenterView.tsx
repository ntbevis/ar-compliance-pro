'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { createClient } from 'src/app/utils/supabase/client';
import {
  deleteDocumentRecord,
  getDocumentsData,
  hashFileBuffer,
  recordDocumentUpload,
} from 'src/app/actions/compliance';

interface Props {
  facilityId: string;
}

interface DocumentRecord {
  id: string;
  name: string;
  document_type: string;
  status: string;
  file_url: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export default function DocumentCenterView({ facilityId }: Props) {
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [uploading, setUploading] = useState<boolean>(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      setLoading(true);
      const data = await getDocumentsData(facilityId);
      setDocs(data as DocumentRecord[]);
      setLoading(false);
    }
    load();
  }, [facilityId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const documentId = crypto.randomUUID();
      const fileExt = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
      const storagePath = `${facilityId}/${documentId}.${fileExt}`;

      const { error: storageError } = await supabase.storage
        .from('facility-documents')
        .upload(storagePath, file);
      if (storageError) throw storageError;

      const { error: insertError } = await supabase.from('facility_documents').insert({
        id: documentId,
        facility_id: facilityId,
        document_type: 'general_compliance_upload',
        status: 'approved',
        file_url: storagePath,
        name: file.name,
        metadata: { upload_source: 'document_center' },
      });
      if (insertError) throw insertError;

      const arrayBuffer = await file.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const fileHash = await hashFileBuffer(base64);

      await recordDocumentUpload({
        facilityId,
        documentId,
        documentType: 'general_compliance_upload',
        fileName: file.name,
        fileSize: file.size,
        fileHash,
        userAttestation: false,
      });

      const refreshed = await getDocumentsData(facilityId);
      setDocs(refreshed as DocumentRecord[]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Upload failed: ${message}`);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (doc: DocumentRecord) => {
    if (!confirm(`Delete "${doc.name}"? This action cannot be undone.`)) return;
    setDeletingId(doc.id);
    try {
      const result = await deleteDocumentRecord(doc.id);
      if (result.success) {
        setDocs((prev) => prev.filter((d) => d.id !== doc.id));
      } else {
        toast.error(result.error ?? 'Delete failed.');
      }
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="bg-white p-5 md:p-8 rounded-xl border border-slate-200 shadow-sm max-w-6xl mx-auto text-slate-800">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-lg font-bold mb-2">Document Center</h2>
          <p className="text-xs text-slate-500">
            All compliance documents and digital attestations on file for this facility.
          </p>
        </div>
        <label
          className={`cursor-pointer px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 shrink-0 min-h-[44px] justify-center ${
            uploading ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'
          }`}
        >
          {uploading ? 'Uploading…' : '📤 Upload Document'}
          <input
            type="file"
            accept=".pdf,.txt,.png,.jpg,.jpeg"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
        </label>
      </div>

      {loading ? (
        <p className="text-slate-500 italic">Loading documents…</p>
      ) : docs.length === 0 ? (
        <div className="border border-dashed border-slate-200 rounded-xl p-12 text-center italic text-slate-400 text-xs bg-slate-50">
          No documents yet. Upload compliance documents to begin tracking.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left py-3 px-4 font-semibold text-slate-700">Document Name</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-700">Type</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-700">Status</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-700">Uploaded</th>
                <th className="text-right py-3 px-4 font-semibold text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {docs.map((doc) => (
                <tr key={doc.id} className="hover:bg-slate-50/50">
                  <td className="py-3 px-4 font-medium text-slate-800">{doc.name}</td>
                  <td className="py-3 px-4">
                    <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-1 rounded">
                      {doc.document_type}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        doc.status === 'approved'
                          ? 'bg-emerald-100 text-emerald-800'
                          : doc.status === 'pending'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {doc.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-600 text-xs">
                    {new Date(doc.created_at).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => handleDelete(doc)}
                      disabled={deletingId === doc.id}
                      className="text-rose-600 hover:text-rose-800 disabled:opacity-50 text-sm font-medium"
                    >
                      {deletingId === doc.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
