'use client';
import { useState } from 'react';
import { createClient } from 'src/app/utils/supabase/client';

interface UploadButtonProps {
  facilityId: string;
  requirementType: string;
  onUploadSuccess: () => void;
}

export default function UploadButton({ facilityId, requirementType, onUploadSuccess }: UploadButtonProps) {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const supabase = createClient();

    try {
      // 1. Pathing: Organization / Facility / RequirementName-RandomID.pdf
      const fileExt = file.name.split('.').pop();
      const fileName = `${facilityId}/${requirementType}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      
      // 2. Upload to Storage
      const { error: storageError } = await supabase.storage
        .from('facility-documents')
        .upload(fileName, file);

      if (storageError) throw storageError;

      // 3. Insert metadata into the database — operator-confirmed, no AI verification.
      const { error: dbError } = await supabase
        .from('facility_documents')
        .insert([{
          facility_id: facilityId,
          document_type: requirementType,
          file_url: fileName,
          status: 'approved',
        }]);

      if (dbError) throw dbError;

      onUploadSuccess();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      alert('Error: ' + message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <label className="cursor-pointer group">
      <div className={`px-4 py-2 rounded-xl border transition-all flex items-center gap-2 ${
        uploading ? 'bg-gray-800 border-gray-700' : 'bg-blue-600 border-blue-500 hover:bg-blue-500'
      }`}>
        <span className="text-[10px] font-black uppercase tracking-widest text-white">
          {uploading ? 'Syncing...' : 'Upload Evidence'}
        </span>
        {!uploading && <span className="text-white opacity-50">↑</span>}
      </div>
      <input 
        type="file" 
        className="hidden" 
        onChange={handleUpload} 
        disabled={uploading} 
        accept=".pdf,.jpg,.jpeg,.png"
      />
    </label>
  );
}