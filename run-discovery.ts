import { loadEnvConfig } from '@next/env';

// Load environment variables FIRST
const projectDir = process.cwd();
loadEnvConfig(projectDir);

async function executeDiscovery() {
  console.log("🚀 Booting extraction and discovery pipeline...");
  try {
    const { discoverAllFacilityCriteria } = await import('./src/lib/scripts/discover-all-facility-criteria');
    await discoverAllFacilityCriteria();
    console.log("✅ All criteria successfully extracted and saved to Supabase!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Extraction crashed:", error);
    process.exit(1);
  }
}

executeDiscovery();
