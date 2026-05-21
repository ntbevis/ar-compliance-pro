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
  // Ensures zero duplicate data if the sync is rerun for this specific sub-classification.
  // Only delete entries matching BOTH source AND sub_classification to preserve other sub-classifications.
  const subClassification = metadata.sub_classification || null;
  console.log(`[Monitor] Clearing old vault entries for: ${metadata.source} (sub_classification: ${subClassification})...`);
  
  let deleteQuery = supabase
    .from('regulatory_knowledge')
    .delete()
    .eq('metadata->>source', metadata.source);
  
  if (subClassification) {
    deleteQuery = deleteQuery.eq('metadata->>sub_classification', subClassification);
  } else {
    deleteQuery = deleteQuery.is('metadata->>sub_classification', null);
  }
  
  await deleteQuery;

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

    // Insert cleanly structured content into the vault with explicit schema alignment
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

    if (error) {
      console.error(`   [Error] Segment ${i}:`, error.message);
      console.error(`   [Error Details]:`, error.details);
      console.error(`   [Error Hint]:`, error.hint);
      throw new Error(`Database Write Rejected: ${error.message} - Details: ${error.details || 'No additional details'}`);
    }
    
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
    // 1. Fetch the facility profile with capacity, active_enrollment, and sub_classification for staffing calculations
    const { data: facility } = await supabase
      .from('facilities')
      .select('facility_type, capacity, active_enrollment, sub_classification')
      .eq('id', facilityId)
      .single();

    const currentType = facility?.facility_type || 'childcare';
    const subClassification = facility?.sub_classification;
    
    // Use active_enrollment if available and > 0, otherwise fall back to capacity
    const enrollmentCount = facility?.active_enrollment && facility.active_enrollment > 0
      ? facility.active_enrollment
      : (facility?.capacity || 0);
    
    console.log(`📊 Enrollment: ${enrollmentCount} (active: ${facility?.active_enrollment || 'N/A'}, capacity: ${facility?.capacity || 0})`);

    // 2. Gather the active target requirements for this facility type
    // SIMPLIFIED QUERY: Only filter by facility_type and is_personnel_requirement
    // All sub-classification logic removed to avoid PostgREST .or() issues
    const { data: activeRules, error: rulesError } = await supabase
      .from('compliance_criteria')
      .select('*')
      .eq('facility_type', currentType)
      .eq('is_personnel_requirement', false);
    
    if (rulesError) {
      console.error('❌ Error fetching compliance rules:', rulesError);
      throw new Error(`Failed to fetch compliance criteria: ${rulesError.message}`);
    }
    
    console.log(`📋 Loaded ${activeRules?.length || 0} compliance rules for facility type: ${currentType}`);
    

    // 4. Gather what files the facility has already successfully verified
    const { data: uploadedDocs } = await supabase
      .from('facility_documents')
      .select('document_type, status')
      .eq('facility_id', facilityId)
      .eq('status', 'approved');

    // 5. Dynamic Schema-Driven Fuzzy Metric Intersection
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
    
    // 6. NEW SCORING LOGIC: Exclude daily and weekly frequency rules from the score calculation
    // Score should ONLY be based on monthly, annual, one-time, or undefined frequency critical requirements
    const scorableFrequencies = ['monthly', 'annual', 'one-time', 'one_time', '2_years', '5_years', undefined, null];
    
    // Filter to only critical rules that should be scored (exclude daily and weekly)
    const scorableCriticalRules = (activeRules || []).filter(rule => {
      if (rule.severity !== 'critical') return false;
      const freq = rule.frequency?.toLowerCase();
      return !freq || !['daily', 'weekly'].includes(freq);
    });
    
    const criticalRuleCount = scorableCriticalRules.length;
    const verifiedCriticalCount = scorableCriticalRules.filter(rule => satisfiedRuleIds.has(rule.id)).length;
    
    console.log(`📊 Score Calculation: ${verifiedCriticalCount}/${criticalRuleCount} scorable critical requirements met (daily/weekly excluded)`);
    
    // Compute audit readiness score based ONLY on scorable critical requirements
    let calculatedScore = criticalRuleCount > 0
      ? Math.round((verifiedCriticalCount / criticalRuleCount) * 100)
      : 100; // Default to 100 if no critical rules exist

    // 7. Filter down to map the current active gaps for the UI, passing through severity and frequency
    // Exclude staffing ratio rules as they are handled by the dynamic staffing-ratio-deficit logic
    const identifiedGaps = (activeRules || [])
      .filter(rule => !satisfiedRuleIds.has(rule.id))
      .filter(rule => {
        const typeKey = rule.required_document_type?.toLowerCase() || '';
        const name = rule.requirement_name?.toLowerCase() || '';
        return !typeKey.includes('ratio') && !name.includes('ratio');
      })
      .map(rule => ({
        id: rule.id,
        title: rule.requirement_name,
        systemSlug: rule.required_document_type,
        isCritical: rule.severity === 'critical',
        severity: rule.severity, // Pass through severity for frontend filtering
        frequency: rule.frequency || null // Pass through frequency for frontend display (ensure it's always defined)
      }));
    
    console.log(`📈 Audit Readiness Score: ${calculatedScore}% (${verifiedCriticalCount}/${criticalRuleCount} critical requirements met)`);
    console.log(`📋 Total Requirements: ${activeRules?.length || 0} (${criticalRuleCount} scorable critical, ${(activeRules?.length || 0) - criticalRuleCount} other)`);

    // 8. Fetch actual active personnel count from the database
    const { count: personnelCount } = await supabase
      .from('personnel')
      .select('*', { count: 'exact', head: true })
      .eq('facility_id', facilityId)
      .eq('status', 'active');

    const activeStaffCount = personnelCount ?? 0;

    // 9. Calculate required staff threshold based on regulatory sector rules
    // Defensive check: only calculate if enrollment count is valid (not null, undefined, or 0)
    let requiredStaff = 0;
    if (enrollmentCount && enrollmentCount > 0) {
      if (currentType === 'childcare') {
        requiredStaff = Math.ceil(enrollmentCount / 10);
      } else if (currentType === 'nursing_home') {
        requiredStaff = Math.ceil(enrollmentCount / 15);
      }
    } else {
      console.log(`⚠️ Facility ${facilityId} has invalid or missing enrollment count (${enrollmentCount}). Skipping staffing ratio calculations.`);
    }

    // 10. Apply staffing ratio deficit penalty if understaffed
    if (requiredStaff > 0 && activeStaffCount < requiredStaff) {
      // Deduct strict 25-point penalty for staffing violations
      calculatedScore = Math.max(0, calculatedScore - 25);
      
      // Add critical staffing gap to the violations list
      identifiedGaps.push({
        id: 'staffing-ratio-deficit',
        title: `CRITICAL: Regulatory Staffing Ratio Deficit (Required: ${requiredStaff}, Active: ${activeStaffCount})`,
        systemSlug: 'staffing_ratio_deficit',
        isCritical: true,
        severity: 'critical',
        frequency: 'ongoing'
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