'use server';

import { syncLiveStateRegulations, CHILDCARE_SUBCLASSIFICATIONS, HEALTHCARE_SUBCLASSIFICATIONS } from '@/lib/scripts/sync-state-rules';
import { discoverAllFacilityCriteria } from '@/lib/scripts/discover-all-facility-criteria';

/**
 * Server Action triggered by the Admin Dashboard button
 * to refresh the app's vector brain from official state portals.
 *
 * @param subClassification - Optional specific sub-classification to sync (e.g., "Licensed Child Care Center (CCC)")
 *                           If not provided, syncs all sub-classifications
 */
export async function triggerStateWebSync(subClassification?: string) {
  try {
    if (subClassification) {
      console.log(`🔒 [Admin] Authenticated web trigger received. Initiating state sync for: ${subClassification}...`);
    } else {
      console.log("🔒 [Admin] Authenticated web trigger received. Initiating state sync for ALL sub-classifications...");
    }
    
    // Fire off our live web scraper engine with optional sub-classification filter
    await syncLiveStateRegulations(subClassification);
    
    // Run the AI compliance criteria discovery agent to extract structured requirements
    console.log("🧠 [Admin] Initiating AI compliance criteria discovery agent...");
    await discoverAllFacilityCriteria();
    console.log("✅ [Admin] AI compliance criteria discovery complete.");
    
    const message = subClassification
      ? `State regulations synchronized and compliance criteria discovered for ${subClassification}.`
      : "State regulations synchronized and compliance criteria discovered for all sub-classifications.";
    
    return { success: true, message };
  } catch (error: any) {
    console.error("❌ [Admin] Web trigger sync failed:", error);
    return { success: false, error: error.message || "Failed to sync live data." };
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