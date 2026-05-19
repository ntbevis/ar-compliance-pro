// src/lib/scripts/test-action-integration.ts
import { createAdminClient } from '../../app/utils/supabase/admin';
import { handleDocumentUploadSuccess } from '../../app/actions/compliance';

const MOCK_SARAH_CLEARANCE = `
ARKANSAS DEPARTMENT OF HUMAN SERVICES
DIVISION OF CHILD CARE AND EARLY CHILDHOOD EDUCATION (DCCECE)
CENTRAL REGISTRY BACKGROUND CHECK UNIT

OFFICIAL DETERMINATION REPORT
Date: March 12, 2026
Case ID: CR-2026-88492
Subject Personnel: Sarah Jenkins
DOB: 11/14/1992

Pursuant to the Code of Arkansas Rules (CAR) Title 9, a full multi-state criminal history fingerprint sweep and central registry background check has been completed for the subject individual. 

DETERMINATION: ELIGIBLE
The screening results indicate NO disqualifying criminal offenses or founded histories of maltreatment or neglect as defined under Arkansas state licensing parameters. This individual is officially cleared for unrestricted employment inside an Arkansas licensed childcare environment.

Authorized Signatory:
Director of Licensing Verification, Arkansas DHS
`;

async function runIntegrationVerification() {
  console.log("🚀 Starting Live Server Action Integration Test...");
  const supabase = createAdminClient();

  // Target values matching our seeded database rows exactly
  const facilityId = '22222222-2222-2222-2222-222222222222';
  const documentId = '77777777-7777-7777-7777-77777777777a'; 
  const storagePath = `${facilityId}/${documentId}.txt`;

  try {
    // 1. Ensure the 'facility-documents' storage bucket exists
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(b => b.name === 'facility-documents');
    
    if (!bucketExists) {
      console.log("📁 Creating 'facility-documents' storage bucket...");
      await supabase.storage.createBucket('facility-documents', { public: false });
    }

    // 2. Upload the raw document bytes straight into the Supabase Storage Bucket
    console.log("📤 Uploading text file to Supabase Storage Bucket...");
    const fileBuffer = Buffer.from(MOCK_SARAH_CLEARANCE.trim(), 'utf-8');
    
    const { error: storageError } = await supabase.storage
      .from('facility-documents')
      .upload(storagePath, fileBuffer, { contentType: 'text/plain', upsert: true });

    if (storageError) throw new Error(`Storage Upload Failed: ${storageError.message}`);

    // 3. Clean up any pre-existing test row to allow clean reruns
    await supabase.from('facility_documents').delete().eq('id', documentId);

    // 4. Insert the initial tracking row matching your exact schema layout
    console.log("📝 Inserting initial 'pending' record into facility_documents table...");
    const { error: insertError } = await supabase
      .from('facility_documents')
      .insert({
        id: documentId,
        facility_id: facilityId,
        document_type: 'dccece_background_check',
        status: 'pending',
        file_url: storagePath,
        name: 'sarah_clearance.txt',
        metadata: { original_upload_method: 'automated_test_runner' }
      });

    if (insertError) throw insertError;

    // 5. Fire your Next.js Server Action!
    console.log("\n⚡ Triggering Server Action: handleDocumentUploadSuccess()...");
    const actionResult = await handleDocumentUploadSuccess(facilityId, documentId);
    console.log("📥 Action Execution Complete. Result returned:", actionResult);

    // 6. Fetch the updated row directly from the database to verify persistence
    console.log("\n🔍 Querying database for final persisted state...");
    const { data: finalRecord } = await supabase
      .from('facility_documents')
      .select('*')
      .eq('id', documentId)
      .single();

    console.log("\n==================================================");
    console.log("📊 FINAL PERSISTED DATABASE ROW VIEW:");
    console.log(`Document ID:   ${finalRecord.id}`);
    console.log(`Status State:  ${finalRecord.status.toUpperCase()} (Expected: APPROVED)`);
    console.log("Persisted Metadata Audit Trail:");
    console.log(JSON.stringify(finalRecord.metadata, null, 2));
    console.log("==================================================");

  } catch (error: any) {
    console.error("\n❌ Critical Integration Test Failure:", error.message);
  }
}

runIntegrationVerification();