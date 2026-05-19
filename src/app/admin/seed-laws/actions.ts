'use server';

import { syncLiveStateRegulations, CHILDCARE_SUBCLASSIFICATIONS, HEALTHCARE_SUBCLASSIFICATIONS } from '@/lib/scripts/sync-state-rules';
import { discoverAllFacilityCriteria } from '@/lib/scripts/discover-all-facility-criteria';

/**
 * Server Action triggered by the Admin Dashboard button
 * to process local regulatory documents and extract compliance criteria.
 *
 * IMPORTANT: This processes documents sequentially to avoid Vercel timeout limits.
 * Each PDF is processed individually with its own AI extraction and vectorization.
 *
 * @param subClassification - Optional specific sub-classification to sync (e.g., "Licensed Child Care Center (CCC)")
 *                           If not provided, syncs all sub-classifications
 */
export async function triggerStateWebSync(subClassification?: string) {
  try {
    if (subClassification) {
      console.log(`🔒 [Admin] Processing local documents for: ${subClassification}...`);
    } else {
      console.log("🔒 [Admin] Processing all local regulatory documents...");
    }
    
    // Process local PDFs and vectorize content
    await syncLiveStateRegulations(subClassification);
    
    // Run the AI compliance criteria discovery agent to extract structured requirements
    console.log("🧠 [Admin] Initiating AI compliance criteria discovery agent...");
    await discoverAllFacilityCriteria();
    console.log("✅ [Admin] AI compliance criteria discovery complete.");
    
    const message = subClassification
      ? `Successfully processed regulatory documents and discovered compliance criteria for ${subClassification}.`
      : "Successfully processed all regulatory documents and discovered compliance criteria.";
    
    return { success: true, message };
  } catch (error: any) {
    console.error("❌ [Admin] Document processing failed:", error);
    return { success: false, error: error.message || "Failed to process documents." };
  }
}

/**
 * Returns the available sub-classifications for the admin UI
 */
export async function getAvailableSubClassifications() {
  return {
    childcare: Array.from(CHILDCARE_SUBCLASSIFICATIONS),
    healthcare: Array.from(HEALTHCARE_SUBCLASSIFICATIONS)
  };
}