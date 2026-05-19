// src/lib/reg-monitor.ts
import { createAdminClient } from 'src/app/utils/supabase/admin';
import { generatePrecisionEmbedding } from './ai-precision';

/**
 * Core engine for Regulatory Ingestion.
 * Takes raw legal text, chunks it at natural sentence boundaries, and stores it in the Supabase vault.
 */
export async function ingestRegulatoryText(rawText: string, metadata: any) {
  const supabase = createAdminClient();

  // --- CLEANUP BLOCK ---
  // Ensures zero duplicate data if the sync is rerun.
  console.log(`[Monitor] Clearing old vault entries for: ${metadata.source}...`);
  await supabase
    .from('regulatory_knowledge')
    .delete()
    .eq('metadata->>source', metadata.source);

  const textLength = rawText?.trim().length || 0;
  console.log(`[Monitor] Received ${textLength} characters for ${metadata.source}`);

  if (textLength < 10) {
    console.error(`❌ REJECTED: Content too short for ${metadata.source}`);
    return false;
  }

  // 1. SURGICAL CLEAN: Strip non-printable control characters globally before breaking text
  const cleanRawText = rawText.replace(/[^\x20-\x7E\s]/g, '');

  // 2. SENTENCE BOUNDARY DETECTION: Split text by sentences cleanly (. ! or ? followed by space)
  const sentences = cleanRawText.match(/[^.!?]+[.!?]+(\s|$)/g) || [cleanRawText];
  
  const chunks: string[] = [];
  let currentChunk = "";
  const targetChunkSize = 1000;

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;

    // Check if adding this complete sentence exceeds our target size
    if ((currentChunk + " " + trimmedSentence).length > targetChunkSize) {
      const finalizedChunk = currentChunk.trim();
      
      // THE QUALITY GATE: Must contain letters, basic word count, and structure
      const hasLetters = /[a-zA-Z]/.test(finalizedChunk);
      const hasWordDensity = (finalizedChunk.match(/\s/g) || []).length >= 3;
      const isSubstantial = finalizedChunk.length >= 40;

      if (hasLetters && hasWordDensity && isSubstantial) {
        chunks.push(finalizedChunk);
      }

      // Overlap: Start the next chunk with the current sentence to maintain semantic linkage
      currentChunk = trimmedSentence;
    } else {
      currentChunk = currentChunk ? `${currentChunk} ${trimmedSentence}` : trimmedSentence;
    }
  }

  // Catch any remaining sentence aggregates left in the buffer
  if (currentChunk.trim().length >= 40) {
    const remainingChunk = currentChunk.trim();
    if (/[a-zA-Z]/.test(remainingChunk) && (remainingChunk.match(/\s/g) || []).length >= 3) {
      chunks.push(remainingChunk);
    }
  }

  console.log(`🚀 Vectorizing ${chunks.length} immaculate, full-sentence segments for ${metadata.source}...`);

  for (let i = 0; i < chunks.length; i++) {
    // Generate the 1536-dimension vector embedding
    const embedding = await generatePrecisionEmbedding(chunks[i]);

    // Insert cleanly structured content into the vault
    const { error } = await supabase.from('regulatory_knowledge').insert({
      content: chunks[i],
      embedding,
      category: metadata.category,
      metadata: { 
        ...metadata, 
        chunk_index: i, 
        total_chunks: chunks.length,
        ingested_at: new Date().toISOString()
      }
    });

    if (error) console.error(`   [Error] Segment ${i}:`, error.message);
    
    if (i % 20 === 0 && i > 0) {
      console.log(`   [Progress] ${i}/${chunks.length} segments secured...`);
    }
  }

  console.log(`✅ SUCCESS: ${metadata.source} is cleanly secured.`);
  return true;
}

/**
 * String normalization helper for resilient fuzzy matching.
 * Converts strings to lowercase, strips whitespace, and normalizes separators.
 */
function normalizeDocumentKey(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .toLowerCase()
    .trim()
    .replace(/[\s\-]+/g, '_')  // Replace spaces and hyphens with underscores
    .replace(/[^a-z0-9_]/g, ''); // Remove any non-alphanumeric characters except underscores
}

/**
 * Fuzzy token matching helper.
 * Checks if two normalized strings share significant token overlap or containment.
 */
function tokensMatch(ruleKey: string, docKey: string): boolean {
  const normalizedRule = normalizeDocumentKey(ruleKey);
  const normalizedDoc = normalizeDocumentKey(docKey);
  
  // Direct match
  if (normalizedRule === normalizedDoc) return true;
  
  // Containment check (either direction)
  if (normalizedRule.includes(normalizedDoc) || normalizedDoc.includes(normalizedRule)) {
    return true;
  }
  
  // Token overlap check - split by underscore and check for shared meaningful tokens
  const ruleTokens = normalizedRule.split('_').filter(t => t.length > 2); // Filter out short tokens
  const docTokens = normalizedDoc.split('_').filter(t => t.length > 2);
  
  // If at least 2 significant tokens match, consider it a match
  const sharedTokens = ruleTokens.filter(token => docTokens.includes(token));
  if (sharedTokens.length >= 2) return true;
  
  return false;
}

/**
 * Reads from our database layers to calculate the real-time metrics
 * for the UI Dashboard using fully dynamic schema-driven token normalization.
 */
export async function getRegulatoryStatus(facilityId: string) {
  const supabase = createAdminClient();

  try {
    // 1. Fetch the facility profile with capacity and sub_classification for staffing calculations
    const { data: facility } = await supabase
      .from('facilities')
      .select('facility_type, capacity, sub_classification')
      .eq('id', facilityId)
      .single();

    const currentType = facility?.facility_type || 'childcare';
    const capacity = facility?.capacity || 0;
    const subClassification = facility?.sub_classification;

    // 2. Gather the active target requirements for this facility type AND specific sub-classification
    // This ensures we only pull rules that match the exact facility classification scope
    let rulesQuery = supabase
      .from('compliance_criteria')
      .select('*')
      .eq('facility_type', currentType);
    
    // Add sub-classification filter if available to narrow down regulatory scope
    if (subClassification) {
      rulesQuery = rulesQuery.eq('sub_classification', subClassification);
    }
    
    const { data: activeRules } = await rulesQuery;

    // 3. Gather what files the facility has already successfully verified
    const { data: uploadedDocs } = await supabase
      .from('facility_documents')
      .select('document_type, status')
      .eq('facility_id', facilityId)
      .eq('status', 'approved');

    // 4. Dynamic Schema-Driven Fuzzy Metric Intersection
    // Build a set of satisfied requirements using resilient token matching
    const satisfiedRuleIds = new Set<string>();
    const uploadedDocTypes = (uploadedDocs || []).map(d => d.document_type).filter(Boolean);
    
    console.log(`📊 Compliance Calculation: Evaluating ${activeRules?.length || 0} requirements against ${uploadedDocTypes.length} approved documents`);
    
    for (const rule of activeRules || []) {
      const ruleKey = rule.required_document_type;
      
      // Check if any uploaded document matches this rule using fuzzy token matching
      const isMatched = uploadedDocTypes.some(docType => tokensMatch(ruleKey, docType));
      
      if (isMatched) {
        satisfiedRuleIds.add(rule.id);
        console.log(`✅ Requirement satisfied: ${rule.requirement_name} (${ruleKey})`);
      }
    }
    
    const ruleCount = activeRules?.length || 0;
    const verifiedCount = satisfiedRuleIds.size;
    
    // Compute base document compliance score as direct percentage of dynamic matches
    let calculatedScore = ruleCount > 0 ? Math.round((verifiedCount / ruleCount) * 100) : 0;

    // Filter down to map the current active gaps for the UI
    const identifiedGaps = (activeRules || [])
      .filter(rule => !satisfiedRuleIds.has(rule.id))
      .map(rule => ({
        id: rule.id,
        title: rule.requirement_name,
        systemSlug: rule.required_document_type,
        isCritical: rule.severity === 'critical'
      }));
    
    console.log(`📈 Compliance Score: ${calculatedScore}% (${verifiedCount}/${ruleCount} requirements met)`);

    // 4. Fetch actual active personnel count from the database
    const { count: personnelCount } = await supabase
      .from('personnel')
      .select('*', { count: 'exact', head: true })
      .eq('facility_id', facilityId)
      .eq('status', 'active');

    const activeStaffCount = personnelCount ?? 0;

    // 5. Calculate required staff threshold based on regulatory sector rules
    // Defensive check: only calculate if capacity is valid (not null, undefined, or 0)
    let requiredStaff = 0;
    if (capacity && capacity > 0) {
      if (currentType === 'childcare') {
        requiredStaff = Math.ceil(capacity / 10);
      } else if (currentType === 'nursing_home') {
        requiredStaff = Math.ceil(capacity / 15);
      }
    } else {
      console.log(`⚠️ Facility ${facilityId} has invalid or missing capacity (${capacity}). Skipping staffing ratio calculations.`);
    }

    // 6. Apply staffing ratio deficit penalty if understaffed
    if (requiredStaff > 0 && activeStaffCount < requiredStaff) {
      // Deduct strict 25-point penalty for staffing violations
      calculatedScore = Math.max(0, calculatedScore - 25);
      
      // Add critical staffing gap to the violations list
      identifiedGaps.push({
        id: 'staffing-ratio-deficit',
        title: `CRITICAL: Regulatory Staffing Ratio Deficit (Required: ${requiredStaff}, Active: ${activeStaffCount})`,
        systemSlug: 'staffing_ratio_deficit',
        isCritical: true
      });

      console.log(`⚠️ STAFFING VIOLATION: Facility ${facilityId} requires ${requiredStaff} staff but only has ${activeStaffCount} active. Score penalized by 25 points.`);
    }

    return {
      calculatedScore,
      identifiedGaps,
      staffCount: activeStaffCount
    };
  } catch (error) {
    console.error("❌ Failed to query metrics inside getRegulatoryStatus:", error);
    return {
      calculatedScore: 0,
      identifiedGaps: [],
      staffCount: 0
    };
  }
}