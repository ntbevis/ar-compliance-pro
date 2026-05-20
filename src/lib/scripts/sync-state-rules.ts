// src/lib/scripts/sync-state-rules.ts
import fs from 'fs';
import path from 'path';
import { ingestRegulatoryText } from '../reg-monitor';
import { extractTextFromBuffer } from '../document-processor';

// 4-Tier Sub-Classification System
export const CHILDCARE_SUBCLASSIFICATIONS = [
  'Licensed Child Care Center (CCC)',
  'Licensed Family Child Care Home (FCCH)'
] as const;

export const HEALTHCARE_SUBCLASSIFICATIONS = [
  'Skilled Nursing Facility (SNF)',
  'Assisted Living Facility (Tier I/II)'
] as const;

// Local regulatory document repository for AI-based ingestion
const STATE_REPOS = [
  {
    name: 'Arkansas Childcare Centers Regulations',
    facilityType: 'childcare' as const,
    subClassifications: CHILDCARE_SUBCLASSIFICATIONS,
    fileName: 'childcare_centers_regulations.pdf'
  },
  {
    name: 'Arkansas Nursing Home Regulations',
    facilityType: 'nursing_home' as const,
    subClassifications: HEALTHCARE_SUBCLASSIFICATIONS,
    fileName: 'nursing_home_regulations.pdf'
  },
  {
    name: 'Arkansas Nursing Home Administrators Licensing Rules',
    facilityType: 'nursing_home' as const,
    subClassifications: HEALTHCARE_SUBCLASSIFICATIONS,
    fileName: 'nursing_home_administrators_licensing_rules.pdf'
  }
];

export async function syncLiveStateRegulations(targetSubClassification?: string) {
  if (targetSubClassification && targetSubClassification !== 'all') {
    console.log(`📡 Connecting to official Arkansas State cloud data repositories for: ${targetSubClassification}...`);
  } else {
    console.log("📡 Connecting to official Arkansas State cloud data repositories (ALL sub-classifications)...");
  }

  for (const repo of STATE_REPOS) {
    // Filter by sub-classification if specified (and not 'all')
    const subClassificationsToProcess = (targetSubClassification && targetSubClassification !== 'all')
      ? repo.subClassifications.filter(sc => sc === targetSubClassification)
      : repo.subClassifications;

    if (subClassificationsToProcess.length === 0) {
      console.log(`⏭️  Skipping ${repo.name} - no matching sub-classifications`);
      continue;
    }

    try {
      console.log(`📂 Ingesting local regulatory document: ${repo.name}...`);
      
      // 1. Read the local file from the regulatory-docs directory
      const localFilePath = path.join(process.cwd(), 'regulatory-docs', repo.fileName);
      console.log(`📂 Loading file from: ${localFilePath}`);

      if (!fs.existsSync(localFilePath)) {
        throw new Error(`File missing locally: ${localFilePath}. Please ensure the PDF is placed in regulatory-docs/`);
      }

      // 2. Load the file buffer
      const buffer = fs.readFileSync(localFilePath);
      console.log(`✅ File loaded successfully (${buffer.length} bytes)`);

      console.log(`🧠 Invoking internal document engine to extract the raw text...`);
      // 3. Feed the buffer directly into your existing parsing engine
      const fullRuleText = await extractTextFromBuffer(buffer, repo.fileName);

      const textLength = fullRuleText?.trim().length || 0;
      console.log(`📑 Successfully extracted ${textLength} characters from the live stream.`);

      // 4. Process for each applicable sub-classification
      for (const subClass of subClassificationsToProcess) {
        console.log(`🎯 Processing rules for sub-classification: ${subClass}`);
        
        const metadata = {
          source: repo.name,
          category: repo.facilityType,
          sub_classification: subClass,
          state: 'Arkansas',
          synchronized_at: new Date().toISOString()
        };

        // 5. Pipe the full text directly into your aggressive vectorizer chunk array
        console.log(`🚀 Routing text blocks into your reg-monitor chunk loop for ${subClass}...`);
        const ingestionSuccess = await ingestRegulatoryText(fullRuleText, metadata);
        
        if (!ingestionSuccess) {
          throw new Error(`Failed to ingest regulatory text for ${subClass}`);
        }
      }

    } catch (err: any) {
      console.error(`❌ Automated extraction sync failed for ${repo.name}:`, err);
      // Bubble up the error to the admin action layer for UI visibility
      throw new Error(`Repository sync failed for ${repo.name}: ${err.message}`);
    }
  }
  console.log("🏁 State data extraction cycle complete. All vector spaces are optimized!");
}
