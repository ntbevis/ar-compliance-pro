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
      const PDFParser = require('pdf2json');
      
      return await new Promise<string>((resolve, reject) => {
        // Initialize with '1' as the second argument to enable raw text extraction mode (skips heavy UI rendering)
        const pdfParser = new PDFParser(null, 1);
        
        pdfParser.on("pdfParser_dataError", (errData: any) => {
          reject(new Error(errData.parserError));
        });
        
        pdfParser.on("pdfParser_dataReady", () => {
          const text = pdfParser.getRawTextContent();
          resolve(text || "");
        });
        
        pdfParser.parseBuffer(buffer);
      });
    } catch (err: any) {
      console.error(`❌ System PDF Extraction Failure for ${fileName}:`, err.message);
      throw new Error(`Cloud Document Parser Interrupted: ${err.message}`);
    }
  }

  return "";
}