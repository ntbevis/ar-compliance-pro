import { loadEnvConfig } from '@next/env';

// Load environment variables FIRST
const projectDir = process.cwd();
loadEnvConfig(projectDir);

async function executeRoleDiscovery() {
  console.log("🚀 Booting AI-powered personnel role discovery pipeline...");
  try {
    const { discoverPersonnelRoles } = await import('./src/lib/scripts/discover-personnel-roles');
    await discoverPersonnelRoles();
    console.log("✅ All personnel roles successfully extracted and saved to Supabase!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Role discovery crashed:", error);
    process.exit(1);
  }
}

executeRoleDiscovery();
