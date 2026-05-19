// src/lib/ai-precision.ts
import OpenAI from 'openai';
import { createAdminClient } from 'src/app/utils/supabase/admin';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Turns text into a 1536-dimension vector using the latest model.
 * This is the "Maximum Precision" way to vectorize legal text.
 */
export async function generatePrecisionEmbedding(text: string) {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-large",
    input: text.replace(/\n/g, ' '),
    dimensions: 1536,
  });

  return response.data[0].embedding;
}

/**
 * RAG Retrieval: Finds the specific Arkansas laws relevant to the audit.
 * Now scoped to facility's specific sub-classification to eliminate broad classification vulnerabilities.
 */
export async function getRelevantRegulations(documentText: string, facilityId: string) {
  const supabase = createAdminClient();
  
  // 1. Fetch facility's specific sub-classification for precise regulatory scoping
  const { data: facility, error: facilityError } = await supabase
    .from('facilities')
    .select('sub_classification, facility_type')
    .eq('id', facilityId)
    .single();
  
  if (facilityError || !facility) {
    console.error("❌ Failed to fetch facility for RAG scoping:", facilityError);
    return [];
  }
  
  const subClassification = facility.sub_classification;
  const facilityType = facility.facility_type;
  
  // 2. Generate query embedding
  const queryEmbedding = await generatePrecisionEmbedding(documentText);

  // 3. Execute vector search with RPC
  const { data: regulations, error } = await supabase.rpc('match_regulations', {
    query_embedding: queryEmbedding,
    match_threshold: 0.4,
    match_count: 5,
  });

  if (error) {
    console.error("❌ Supabase RAG Error:", error);
    return [];
  }
  
  // 4. Post-filter results to only include regulations matching the facility's specific sub-classification
  // This ensures we only return regulatory_knowledge rows where metadata matches the exact classification scope
  const filteredRegulations = (regulations || []).filter((reg: any) => {
    const metadata = reg.metadata || {};
    
    // Match on sub_classification if available in metadata
    if (subClassification && metadata.sub_classification) {
      return metadata.sub_classification === subClassification;
    }
    
    // Fallback to facility_type matching if sub_classification not in metadata
    if (metadata.facility_type) {
      return metadata.facility_type === facilityType;
    }
    
    // Include regulations without specific classification metadata (general rules)
    return true;
  });
  
  console.log(`🎯 RAG Scoping: Retrieved ${regulations?.length || 0} regulations, filtered to ${filteredRegulations.length} matching sub-classification: ${subClassification}`);
  
  return filteredRegulations;
}

/**
 * The "Auditor Brain": Compares the document against retrieved regulations.
 * Balanced to avoid false positives on fully cleared documents.
 * Now accepts dynamic schema keys from the database for precise document type classification.
 */
export async function analyzeCompliance(
  documentText: string,
  regulations: any[],
  allowedSystemKeys: string[],
  facilityType: string,
  subClassification: string | null
) {
  const currentCalendarDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const prompt = `
    You are an expert Senior Regulatory Auditor for the Arkansas Department of Human Services (DHS).
    Your job is to cross-reference the uploaded operational personnel document text against the official state regulations provided.
    
    FACILITY CLASSIFICATION SCOPE:
    This document is being audited for a facility classified as: ${facilityType}${subClassification ? ` (${subClassification})` : ''}
    
    CRITICAL AUDIT REFERENCE TIME:
    Today's Current Date is: ${currentCalendarDate}
    Use this date as your definitive baseline frame of reference to calculate all temporal compliance thresholds, expiration boundaries, and renewal timelines.
    
    OFFICIAL STATE CODES RETRIEVED FROM VECTOR REGISTRY:
    ${regulations.map((r) => `[Source: ${r.metadata?.source || 'State Registry'}] ${r.content}`).join('\n\n')}
    
    UPLOADED DOCUMENT TEXT TO AUDIT:
    ${documentText}
    
    CRITICAL INSTRUCTIONS:
    1. Assess whether the uploaded document text satisfies the parameters outlined in the state codes.
    2. Evaluate all printed validity dates against the CRITICAL AUDIT REFERENCE TIME provided above. If an expiration date is older than today's date, the document is automatically Non-Compliant.
    3. AVOID FALSE POSITIVES: If the document text explicitly states that a requirement has been successfully passed, completed, or cleared (e.g., "DETERMINATION: ELIGIBLE", "PASSED", "officially cleared for unrestricted employment"), and it is not expired, it must be marked as "Compliant".
    4. Do not misinterpret general protective rules in the state code (like "staff must be supervised pending completion of checks") as active violations if the document text proves that the check is already fully completed and cleared.
    5. If there are genuinely missing certifications, clear expiration violations, or insufficient parameters, set compliance_status to "Non-Compliant". Otherwise, set it to "Compliant".
    6. PERSONNEL EXTRACTION: If this document pertains to a specific employee or staff member, extract their name information. Parse the name into separate first and last name components. Handle various formats like "Last, First", "First Last", "First Middle Last", etc.
    7. DOCUMENT TYPE CLASSIFICATION: You must classify this document by returning an exact string match in the field 'extracted_document_type'. This string MUST be chosen exclusively from this allowed array of system keys defined in the database for this facility's regulatory framework: ${JSON.stringify(allowedSystemKeys)}. If the document matches none of these specific regulatory metrics, fallback to 'general_compliance_upload'.

    You must output valid JSON matching this schema precisely:
    {
      "compliance_status": "Compliant" | "Non-Compliant",
      "regulatory_code_violated": "Identify specific sections, headers, or rules, or write 'None' if compliant.",
      "corrective_action": "Clear, step-by-step resolution details for the facility director, or 'None' if compliant.",
      "extracted_personnel_name": "Full name as it appears in the document, or null if not a personnel document",
      "extracted_first_name": "First name only, or null if not extractable",
      "extracted_last_name": "Last name only, or null if not extractable",
      "extracted_document_type": "Must be one of the allowed system keys from the array above, or 'general_compliance_upload' if no match"
    }
  `;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: "You are an unyielding, high-precision legal auditor. You speak exclusively in structured JSON compliance reports." }, 
      { role: "user", content: prompt }
    ],
    response_format: { type: "json_object" },
    temperature: 0.1
  });

  return JSON.parse(response.choices[0].message.content || '{}');
}

/**
 * Uses GPT-4o Vision to convert un-mapped customer image layouts into pristine textual data streams.
 */
export async function analyzeComplianceWithVision(base64Image: string, mimeType: string) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "You are an elite document digitizer. Extract every single word, date, name, and metric from this document image perfectly. Maintain logical document structure. Output raw JSON only."
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Extract all text elements from this facility compliance document precisely.
            
            If this document pertains to a specific employee or staff member, also extract their name information:
            - Parse the name into separate first and last name components
            - Handle various formats like "Last, First", "First Last", "First Middle Last", etc.
            
            Return JSON with these keys:
            - extracted_text: Full document text
            - extracted_personnel_name: Full name as it appears, or null if not a personnel document
            - extracted_first_name: First name only, or null
            - extracted_last_name: Last name only, or null`
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`,
            },
          },
        ],
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.0,
  });

  return JSON.parse(response.choices[0].message.content || '{"extracted_text": ""}');
}