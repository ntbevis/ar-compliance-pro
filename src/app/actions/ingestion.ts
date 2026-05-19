'use server';

import { createClient } from 'src/app/utils/supabase/server';
import { routeAndExtract } from 'src/lib/llm-router';
import { extractTextFromBuffer } from 'src/lib/document-processor'; // Fixed path
// import { runComprehensiveIngestion } from 'src/lib/scripts/ingest-real-data'; // File doesn't exist - commented out
import { z } from 'zod';

const ComplianceSchema = z.object({
  fullName: z.string(),
  role: z.string(),
  licenseExpiry: z.string().nullable(),
  isCompliant: z.boolean(),
  confidenceScore: z.number()
});

export async function uploadComplianceDoc(formData: FormData) {
  const supabase = await createClient();
  const file = formData.get('file') as File;
  const personnelId = formData.get('personnelId') as string;

  if (!file) return { success: false, message: 'No file provided' };

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const extractedText = await extractTextFromBuffer(buffer, file.name);
  if (!extractedText) return { success: false, message: 'Parsing failed' };

  const aiResult = await routeAndExtract({ text: extractedText });
  const validation = ComplianceSchema.safeParse(aiResult);

  if (!validation.success) {
    return { success: false, message: 'AI validation failed' };
  }

  await supabase.from('compliance_docs').insert([{
    personnel_id: personnelId,
    status: 'verified',
    ai_data: aiResult
  }]);

  return { success: true };
}

// --- NEW ACTION FOR MASTER SEEDING ---
export async function triggerIngestionAction() {
  try {
    console.log("🔔 [Action] Initializing Master Regulatory Ingestion...");
    // TODO: Implement runComprehensiveIngestion when ingest-real-data.ts is created
    // await runComprehensiveIngestion();
    return { success: true, message: 'Ingestion function not yet implemented' };
  } catch (error: any) {
    console.error("❌ [Action] Ingestion Failed:", error.message);
    return { success: false, error: error.message };
  }
}