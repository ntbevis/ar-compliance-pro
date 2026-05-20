import { loadEnvConfig } from '@next/env';
import { syncLiveStateRegulations } from './src/lib/scripts/sync-state-rules';
import { discoverAllFacilityCriteria } from './src/lib/scripts/discover-all-facility-criteria';

const projectDir = process.cwd();
loadEnvConfig(projectDir);

async function executeTerminalSync() {
  console.log("🚀 Booting infinite-timeout terminal ingestion pipeline...");
  console.log("📂 Processing local regulatory PDFs from regulatory-docs/\n");
  
  try {
    // Step 1: Process PDFs and vectorize content
    console.log("📄 Step 1: Processing PDFs and generating embeddings...");
    await syncLiveStateRegulations();
    
    // Step 2: Run AI discovery to extract compliance criteria
    console.log("\n🧠 Step 2: Running AI compliance criteria discovery...");
    await discoverAllFacilityCriteria();
    
    console.log("\n✅ All regulations successfully vectorized and saved to Supabase!");
    console.log("✅ Compliance criteria discovered and stored!");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Ingestion crashed:", error);
    process.exit(1);
  }
}

executeTerminalSync();
