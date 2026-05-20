// src/lib/scripts/discover-personnel-roles.ts
import OpenAI from 'openai';
import { createAdminClient } from 'src/app/utils/supabase/admin';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * AI-Powered Personnel Role Discovery Engine.
 * Extracts official personnel titles from regulatory text and stores them in the database.
 */
export async function discoverPersonnelRoles() {
  console.log("🚀 Starting AI-Powered Personnel Role Discovery...");
  const supabase = createAdminClient();

  // 1. Query regulatory_knowledge table for all chunks
  const { data: lawChunks, error: fetchError } = await supabase
    .from('regulatory_knowledge')
    .select('id, content, category, metadata');

  if (fetchError || !lawChunks) {
    console.error("❌ Failed to query regulatory knowledge vault:", fetchError?.message);
    return;
  }

  console.log(`📑 Processing ${lawChunks.length} regulatory text chunks for role extraction...`);

  const discoveredRoles: Array<{
    role_name: string;
    facility_type: string;
    sub_classification: string | null;
  }> = [];

  // 2. Process chunks in batches to extract personnel roles
  for (const chunk of lawChunks) {
    try {
      // Normalize facility type from category
      const facilityType = chunk.category === 'childcare' ? 'childcare' : 'nursing_home';
      const subClassification = chunk.metadata?.sub_classification || null;

      console.log(`🧠 Analyzing Chunk ID [${chunk.id}] for personnel roles...`);

      // 3. Use GPT-4o with JSON schema to extract official personnel titles
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an expert regulatory analyst specializing in healthcare and childcare facility staffing requirements. Your task is to extract ONLY official personnel titles, job roles, or positions that are explicitly mentioned in state licensing regulations.

EXTRACTION RULES:
- Extract ONLY specific job titles mentioned in the text (e.g., "Director of Nursing", "Primary Caregiver", "Administrator", "Licensed Practical Nurse")
- Include roles that have specific regulatory requirements, qualifications, or responsibilities
- DO NOT extract generic terms like "staff", "employee", "personnel", "worker"
- DO NOT extract patient/client roles like "resident", "child", "patient"
- DO NOT invent or infer roles not explicitly stated
- Return an empty array if no specific personnel roles are mentioned

OUTPUT FORMAT:
Return a JSON object with a "roles" array containing unique role names found in this text chunk.`
          },
          {
            role: "user",
            content: `Extract all official personnel roles/titles from this regulatory text:\n\n${chunk.content}`
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "personnel_roles_extraction",
            strict: true,
            schema: {
              type: "object",
              properties: {
                roles: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      role_name: {
                        type: "string",
                        description: "The official personnel title or job role"
                      }
                    },
                    required: ["role_name"],
                    additionalProperties: false
                  }
                }
              },
              required: ["roles"],
              additionalProperties: false
            }
          }
        }
      });

      const result = JSON.parse(response.choices[0].message.content || '{"roles":[]}');
      
      if (result.roles && result.roles.length > 0) {
        console.log(`✅ Found ${result.roles.length} roles in chunk ${chunk.id}`);
        
        // Add facility context to each discovered role
        for (const role of result.roles) {
          discoveredRoles.push({
            role_name: role.role_name,
            facility_type: facilityType,
            sub_classification: subClassification
          });
        }
      }

    } catch (error) {
      console.error(`❌ Error processing chunk ${chunk.id}:`, error);
      continue;
    }
  }

  console.log(`\n📊 Discovery Complete: Found ${discoveredRoles.length} total role mentions`);

  // 4. Deduplicate roles based on role_name + facility_type + sub_classification
  const uniqueRoles = Array.from(
    new Map(
      discoveredRoles.map(role => [
        `${role.role_name}|${role.facility_type}|${role.sub_classification || 'null'}`,
        role
      ])
    ).values()
  );

  console.log(`🔍 Deduplicated to ${uniqueRoles.length} unique roles`);

  // 5. Insert unique roles into regulatory_roles table
  if (uniqueRoles.length > 0) {
    const { data: insertedRoles, error: insertError } = await supabase
      .from('regulatory_roles')
      .upsert(uniqueRoles, {
        onConflict: 'role_name,facility_type,sub_classification',
        ignoreDuplicates: false
      })
      .select();

    if (insertError) {
      console.error("❌ Error inserting roles into database:", insertError);
      return;
    }

    console.log(`✅ Successfully saved ${insertedRoles?.length || 0} roles to regulatory_roles table`);
    
    // Display summary by facility type
    const summary = uniqueRoles.reduce((acc, role) => {
      const key = `${role.facility_type}${role.sub_classification ? ` (${role.sub_classification})` : ''}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log("\n📋 Roles by Facility Type:");
    Object.entries(summary).forEach(([type, count]) => {
      console.log(`   ${type}: ${count} roles`);
    });
  } else {
    console.log("⚠️ No roles discovered from regulatory text");
  }

  console.log("\n✅ Personnel Role Discovery Complete!");
}
