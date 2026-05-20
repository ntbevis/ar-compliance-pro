// src/lib/scripts/discover-all-facility-criteria.ts
import OpenAI from 'openai';
import { createAdminClient } from 'src/app/utils/supabase/admin';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Proactive Compliance Discovery Agent.
 * Sweeps through raw ingested regulatory texts using verified database columns,
 * and dynamically extracts structural criteria into the core application layout registry.
 */
export async function discoverAllFacilityCriteria() {
  console.log("🚀 Starting Multi-Sector Regulatory Knowledge Extraction Loop...");
  const supabase = createAdminClient();

  // 1. Query only the explicit columns visible in your schema, including sub_classification metadata
  const { data: lawChunks, error: fetchError } = await supabase
    .from('regulatory_knowledge')
    .select('id, content, category, metadata');

  if (fetchError || !lawChunks) {
    console.error("❌ Failed to query regulatory knowledge vault:", fetchError?.message);
    return;
  }

  console.log(`📑 Ingested Pool Analyzer: Processing ${lawChunks.length} targeted legal text chunks...`);

  for (const chunk of lawChunks) {
    try {
      // Normalize our database category string to align with your application slugs
      const normalizedFacilityType = chunk.category === 'childcare' ? 'childcare' : 'nursing_home';
      
      // Extract sub_classification from metadata if available
      const subClassification = chunk.metadata?.sub_classification || null;

      console.log(`🧠 Analyzing Chunk ID [${chunk.id}] under category [${normalizedFacilityType}] / sub-class [${subClassification || 'GENERAL'}]...`);

      // 2. Pass the legal text block to the intelligence layer for checklist structuring
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an elite systems engineer and state regulatory draftsman. Analyze the provided state licensing rule block and extract any explicit document, record ledger, insurance card, log sheet, certificate, OR personnel/staffing requirement that the facility infrastructure is forced to maintain to pass state inspection."
          },
          {
            role: "user",
            content: `
              Analyze this Arkansas state regulatory requirement block:
              ---
              Target Facility Profile: ${normalizedFacilityType}
              Specific Sub-Classification: ${subClassification || 'General (applies to all)'}
              Legal Content: ${chunk.content}
              ---

              Extract any explicit documentation OR personnel requirements into structured JSON matching this format exactly:
              {
                "requirements": [
                  {
                    "requirement_name": "Clear, descriptive title of the tracked requirement (e.g., 'Commercial General Liability Insurance Certificate' or 'Minimum Staff-to-Child Ratio')",
                    "required_document_type": "lowercase_snake_case_slug_for_system_keys",
                    "severity": "critical" | "standard",
                    "frequency": "string (see guidelines below)",
                    "applies_to_subclass": "Indicate if this requirement is specific to the sub-classification mentioned above, or if it applies generally to all facilities of this type",
                    "is_personnel_requirement": boolean (true if this is a staffing/personnel requirement, false for documents)
                  }
                ]
              }
              
              FREQUENCY EXTRACTION GUIDELINES:
              Determine the exact renewal frequency stated in the regulatory text. Standardize the output to strings like:
              - "one-time": Initial setup documents that never expire (floor plans, facility layouts, initial certifications)
              - "daily": Daily logs, attendance records, operational checklists
              - "weekly": Weekly inspections, checklists, or logs
              - "monthly": Monthly reports, logs, or attestations
              - "quarterly": Quarterly reports or reviews
              - "biannual": Every 6 months
              - "annual": Documents renewed yearly (licenses, certifications, insurance policies)
              - "2_years": Documents renewed every 2 years
              - "3_years": Documents renewed every 3 years
              - "5_years": Documents renewed every 5 years
              - "10_years": Documents renewed every 10 years
              
              If the text implies an initial setup document that never expires, use "one-time".
              If the renewal period is unspecified, default to "annual".
              
              PERSONNEL REQUIREMENT EXTRACTION:
              If the text specifies staffing ratios (e.g., "one staff member per 10 children" or "minimum of 3 nurses per 50 residents"), extract this as a personnel requirement with:
              - requirement_name: Descriptive title like "Minimum Staff-to-Child Ratio (1:10)"
              - required_document_type: Use format "staffing_ratio_{facility_type}" (e.g., "staffing_ratio_childcare")
              - severity: "critical" (staffing requirements are always critical)
              - frequency: "ongoing" (staffing is continuously monitored)
              - is_personnel_requirement: true
              
              If the text describes general behavior and does not mandate a retrievable file asset, document, permit, or staffing requirement, return an empty array.
            `
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.0 // Zero temperature for reproducible data normalization
      });

      const result = JSON.parse(response.choices[0].message.content || '{"requirements": []}');
      
      if (result.requirements && result.requirements.length > 0) {
        for (const req of result.requirements) {
          // Determine if this requirement should be tagged with the specific sub-classification
          const requirementSubClass = subClassification && req.applies_to_subclass?.toLowerCase().includes('specific')
            ? subClassification
            : null;
          
          const displaySubClass = requirementSubClass || 'ALL';
          console.log(`✨ Extracting Rule for [${normalizedFacilityType.toUpperCase()}/${displaySubClass}]: ${req.requirement_name}`);
          
          // 3. Insert the extracted requirement directly into your master tracking schema
          const { error: insertError } = await supabase
            .from('compliance_criteria')
            .insert({
              facility_type: normalizedFacilityType,
              sub_classification: requirementSubClass,
              requirement_name: req.requirement_name,
              required_document_type: req.required_document_type,
              severity: req.severity,
              frequency: req.frequency || 'annual' // Default to annual if not specified
            });

          if (insertError) {
            // Ignore unique constraint exceptions if overlapping rules are extracted
            if (insertError.code !== '23505') {
              console.error(`⚠️ Database insertion failure:`, insertError.message);
            }
          }
        }
      }
    } catch (err) {
      console.error(`❌ Error parsing regulatory chunk ID ${chunk.id}:`, err);
    }
  }

  console.log("\n🏁 Discovery complete. Your master application checklists are completely synchronized with your ingested raw source data.");
}
