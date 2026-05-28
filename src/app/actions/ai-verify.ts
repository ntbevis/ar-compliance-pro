'use server';

import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const VerificationSchema = z.object({
  is_valid_match: z
    .boolean()
    .describe('Does this document fulfill the stated compliance requirement?'),
  detected_document_type: z
    .string()
    .describe('What type of document is this? Be concise (e.g. "CPR Card", "Food Handler Permit").'),
  confidence_score: z
    .number()
    .min(0)
    .max(100)
    .describe('Confidence percentage (0-100) that the document matches the requirement.'),
  expiration_date: z
    .string()
    .nullable()
    .describe(
      'Expiration or renewal date found on the document in YYYY-MM-DD format. Return null if not present.'
    ),
  rejection_reason: z
    .string()
    .nullable()
    .describe(
      'If is_valid_match is false, a concise, practical explanation of why. Return null when valid.'
    ),
});

export type AIVerificationResult = z.infer<typeof VerificationSchema>;

export async function verifyDocumentWithAI(
  formData: FormData
): Promise<
  | { success: true; object: AIVerificationResult }
  | { success: false; error: string }
> {
  try {
    const file = formData.get('file') as File | null;
    const requirementName = (formData.get('requirementName') as string | null) ?? 'Unknown requirement';

    if (!file) {
      return { success: false, error: 'No file provided for verification.' };
    }

    // Convert the uploaded file to a raw buffer for the VLM
    const arrayBuffer = await file.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);
    const mediaType = file.type || 'image/jpeg';

    const systemPrompt = `You are an expert but practical Arkansas Regulatory Compliance Auditor. Analyze the provided image/document. The user claims this document satisfies the requirement: '${requirementName}'. Verify if this is true and extract the requested data.

CRITICAL INSTRUCTION: You must be highly tolerant of real-world upload conditions. Accept photos with glare, angled shots, mobile screenshots, and handwritten forms as long as the core identifying information is reasonably legible. Do not reject a document for poor aesthetic quality. Only return is_valid_match: false if the document is completely unreadable, is missing critical identifying data due to cropping, or is clearly the wrong document type entirely (e.g., an animal photo instead of a CPR card).`;

    const { object } = await generateObject({
      model: openai('gpt-4o'),
      schema: VerificationSchema,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: systemPrompt,
            },
            {
              type: 'image',
              image: imageBuffer,
              mediaType,
            },
          ],
        },
      ],
    });

    return { success: true, object };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown AI verification error';
    console.error('❌ AI document verification failed:', message);
    return { success: false, error: message };
  }
}
