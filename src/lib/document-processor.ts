// src/lib/document-processor.ts
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

export async function extractTextFromBuffer(buffer: Buffer, fileName: string): Promise<string> {
  const extension = fileName.split('.').pop()?.toLowerCase();
  
  console.log(`[Parser] Analyzing ${fileName}`);

  // 1. TEXT FILES (.txt) - Verified Success
  if (extension === 'txt') {
    return buffer.toString('utf-8').trim();
  }

  // 2. PDF FILES - Direct System Call
  if (extension === 'pdf') {
    // Create a temporary file to hold the PDF bytes
    const tempDir = os.tmpdir();
    const tempInput = path.join(tempDir, `input_${Date.now()}.pdf`);
    
    try {
      // Write the buffer to a real file so the system tool can read it
      fs.writeFileSync(tempInput, buffer);

      // Call the 'pdftotext' command directly (installed via brew install poppler)
      // The '-' at the end tells it to output to the console (stdout)
      const output = execSync(`pdftotext "${tempInput}" -`, { encoding: 'utf8' });

      // Clean up the temp file
      if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);

      return output || "";
    } catch (err: any) {
      console.error(`❌ System PDF Error for ${fileName}:`, err.message);
      
      // Cleanup on failure
      if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
      
      return "";
    }
  }

  return "";
}