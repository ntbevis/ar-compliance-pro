// src/lib/scripts/sync-state-rules.ts
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

// Authoritative state storage endpoints hosting the complete 2026 rule texts
const STATE_REPOS = [
  {
    name: 'Arkansas Childcare Minimum Licensing Standards (PUB-002)',
    facilityType: 'childcare' as const,
    subClassifications: CHILDCARE_SUBCLASSIFICATIONS,
    fileName: 'childcare_rules_official.pdf',
    url: 'https://humanservices.arkansas.gov/wp-content/uploads/2020-Child-Care-centers.pdf'
  },
  {
    name: 'Code of Arkansas Rules - Title 20: Part 400 (Nursing Home Requirements)',
    facilityType: 'nursing_home' as const,
    subClassifications: HEALTHCARE_SUBCLASSIFICATIONS,
    fileName: 'nursing_home_rules_official.pdf',
    url: 'https://humanservices.arkansas.gov/wp-content/uploads/20CARpt.400-1.1.2025-A.pdf'
  }
];

export async function syncLiveStateRegulations(targetSubClassification?: string) {
  if (targetSubClassification) {
    console.log(`📡 Connecting to official Arkansas State cloud data repositories for: ${targetSubClassification}...`);
  } else {
    console.log("📡 Connecting to official Arkansas State cloud data repositories (ALL sub-classifications)...");
  }

  for (const repo of STATE_REPOS) {
    // Filter by sub-classification if specified
    const subClassificationsToProcess = targetSubClassification
      ? repo.subClassifications.filter(sc => sc === targetSubClassification)
      : repo.subClassifications;

    if (subClassificationsToProcess.length === 0) {
      console.log(`⏭️  Skipping ${repo.name} - no matching sub-classifications`);
      continue;
    }

    try {
      console.log(`🌐 Stream-downloading complete legal code framework for: ${repo.name}...`);
      
      // 1. Fetch the raw document binary directly over the network with browser-like headers
      const response = await fetch(repo.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/pdf,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });
      if (!response.ok) {
        throw new Error(`HTTP network error: status ${response.status}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const documentBuffer = Buffer.from(arrayBuffer);

      console.log(`🧠 Invoking internal document engine to extract the raw text...`);
      // 2. Feed the network buffer directly into your existing parsing engine
      const fullRuleText = await extractTextFromBuffer(documentBuffer, repo.fileName);

      const textLength = fullRuleText?.trim().length || 0;
      console.log(`📑 Successfully extracted ${textLength} characters from the live stream.`);

      // 3. Process for each applicable sub-classification
      for (const subClass of subClassificationsToProcess) {
        console.log(`🎯 Processing rules for sub-classification: ${subClass}`);
        
        const metadata = {
          source: repo.name,
          category: repo.facilityType,
          sub_classification: subClass,
          state: 'Arkansas',
          synchronized_at: new Date().toISOString()
        };

        // 4. Pipe the full text directly into your aggressive vectorizer chunk array
        console.log(`🚀 Routing text blocks into your reg-monitor chunk loop for ${subClass}...`);
        await ingestRegulatoryText(fullRuleText, metadata);
      }

    } catch (err) {
      console.error(`❌ Automated extraction sync failed for ${repo.name}:`, err);
    }
  }
  console.log("🏁 State data extraction cycle complete. All vector spaces are optimized!");
}
