// src/lib/scripts/sync-state-rules.ts
import https from 'https';
import fs from 'fs';
import path from 'path';
import os from 'os';
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
      console.log(`🌐 Stream-downloading complete legal code framework for: ${repo.name}...`);
      
      // 1. Download the raw document binary using native Node.js https streaming for memory safety
      const tempInputPath = path.join(os.tmpdir(), `state_law_${Date.now()}.pdf`);
      const fileStream = fs.createWriteStream(tempInputPath);

      await new Promise<void>((resolve, reject) => {
        const requestOptions = {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/pdf'
          }
        };

        https.get(repo.url, requestOptions, (res) => {
          if (res.statusCode !== 200) {
            reject(new Error(`DHS Portal returned HTTP Status Code: ${res.statusCode}`));
            return;
          }
          
          console.log(`📥 Streaming ${repo.fileName} to temporary workspace...`);
          res.pipe(fileStream);
          
          fileStream.on('finish', () => {
            fileStream.close();
            resolve();
          });
        }).on('error', (err) => {
          if (fs.existsSync(tempInputPath)) {
            fs.unlinkSync(tempInputPath);
          }
          reject(err);
        });
      });

      console.log(`✅ Download complete. Loading file into memory for text extraction...`);
      
      // 2. Load the downloaded bytes straight into our extraction tool safely
      const documentBuffer = fs.readFileSync(tempInputPath);

      console.log(`🧠 Invoking internal document engine to extract the raw text...`);
      // 3. Feed the buffer directly into your existing parsing engine
      const fullRuleText = await extractTextFromBuffer(documentBuffer, repo.fileName);
      
      // 4. Clean up temporary local workspace asset
      if (fs.existsSync(tempInputPath)) {
        fs.unlinkSync(tempInputPath);
        console.log(`🗑️  Temporary file cleaned up: ${tempInputPath}`);
      }

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
