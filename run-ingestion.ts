import { loadEnvConfig } from '@next/env';

// 1. Load environment variables FIRST
const projectDir = process.cwd();
loadEnvConfig(projectDir);

async function executeTerminalSync() {
  console.log("🚀 Booting infinite-timeout terminal ingestion pipeline...");
  try {
    // 2. Dynamically import the sync script AFTER the environment is fully loaded
    const { syncLiveStateRegulations } = await import('./src/lib/scripts/sync-state-rules');
    
    await syncLiveStateRegulations();
    console.log("✅ All regulations successfully vectorized and saved to Supabase!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Ingestion crashed:", error);
    process.exit(1);
  }
}

executeTerminalSync();