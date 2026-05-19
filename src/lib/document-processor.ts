// src/lib/document-processor.ts
const pdf = require('pdf-parse');

export async function extractTextFromBuffer(buffer: Buffer, fileName: string): Promise<string> {
  const extension = fileName.split('.').pop()?.toLowerCase();
  
  console.log(`[Parser] Analyzing ${fileName}`);

  // 1. TEXT FILES (.txt) - Verified Success
  if (extension === 'txt') {
    return buffer.toString('utf-8').trim();
  }

  // 2. PDF FILES - Native JavaScript Parser (Serverless-Compatible)
  if (extension === 'pdf') {
    try {
      console.log(`[Parser] Using native pdf-parse library for ${fileName}...`);
      const data = await pdf(buffer);
      const extractedText = data.text || "";
      
      console.log(`[Parser] Successfully extracted ${extractedText.length} characters from PDF`);
      return extractedText.trim();
    } catch (err: any) {
      console.error(`❌ Native PDF Parsing Error for ${fileName}:`, err.message);
      throw new Error(`PDF Parsing Failed: ${err.message}`);
    }
  }

  return "";
}