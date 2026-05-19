// src/lib/document-processor.ts

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
      // Dynamically require pdf-parse to maintain isolated bundle efficiency
      const pdfParse = require('pdf-parse');
      const parsedData = await pdfParse(buffer);
      
      return parsedData.text || "";
    } catch (err: any) {
      console.error(`❌ System PDF Extraction Failure for ${fileName}:`, err.message);
      throw new Error(`Cloud Document Parser Interrupted: ${err.message}`);
    }
  }

  return "";
}