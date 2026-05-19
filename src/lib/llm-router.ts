// src/lib/llm-router.ts
import { getRelevantRegulations, analyzeCompliance } from './ai-precision';

interface AuditPayload {
  text?: string;
  buffer?: Buffer;
  mimeType?: string;
  facilityId?: string;
}

/**
 * The AI Router.
 * Accepts raw text payloads or binary image buffers and coordinates
 * high-fidelity extraction and compliance matching.
 * Now scoped to facility's specific sub-classification for precise regulatory matching.
 */
export async function routeAndExtract(payload: AuditPayload) {
  console.log("-> Initializing high-fidelity AI document conversion & audit...");

  try {
    let textContentForRAG = payload.text || "";

    // If the file is an image scan, pull the text using vision before running RAG
    if (payload.buffer && payload.mimeType?.startsWith('image/')) {
      console.log("📸 Multimodal Ingestion: Processing image asset via GPT-4o Vision...");
      const base64Image = payload.buffer.toString('base64');
      
      const { analyzeComplianceWithVision } = require('./ai-precision');
      const visionResult = await analyzeComplianceWithVision(base64Image, payload.mimeType);
      
      textContentForRAG = visionResult.extracted_text;
    } else if (payload.buffer && !payload.text) {
      textContentForRAG = payload.buffer.toString('utf-8');
    }

    // 1. RETRIEVAL: Find matching Arkansas legal chunks using the clean text
    // Now scoped to facility's specific sub-classification to eliminate broad classification vulnerabilities
    if (!payload.facilityId) {
      console.error("❌ Missing facilityId - cannot scope RAG retrieval to sub-classification");
      throw new Error("Facility ID required for regulatory scoping");
    }
    
    const relevantLaws = await getRelevantRegulations(textContentForRAG, payload.facilityId);
    console.log(`-> Context Injection: Linked ${relevantLaws.length} matching Arkansas regulations.`);

    // 2. REASONING: Execute the final compliance audit report
    const auditReport = await analyzeCompliance(textContentForRAG, relevantLaws);
    return auditReport;

  } catch (error) {
    console.error("❌ Critical failure inside the AI Routing layer:", error);
    return {
      compliance_status: "Non-Compliant",
      regulatory_code_violated: "AI Extraction Error",
      corrective_action: "The AI engine encountered an issue perfectly converting this file format. Please ensure the file is clear and legible."
    };
  }
}