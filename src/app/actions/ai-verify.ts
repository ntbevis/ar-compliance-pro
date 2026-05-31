'use server';

import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { createClient } from 'src/app/utils/supabase/server';

// --- Abuse controls for the (paid) vision model endpoint ---------------------
// This is a public server action, so without these guards anyone could invoke it
// and run up OpenAI spend. We require an authenticated session, cap file size /
// type, and apply a best-effort per-user rate limit.
//
// NOTE: the rate limiter is in-memory and therefore per-server-instance. It is a
// pragmatic first line of defense; for horizontally-scaled production traffic,
// move this to a shared store (e.g. Upstash Redis / Vercel KV).
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const RATE_LIMIT_MAX = 20; // requests
const RATE_LIMIT_WINDOW_MS = 60_000; // per minute, per user

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(userId);
  if (!bucket || now > bucket.resetAt) {
    // Opportunistically prune stale buckets to bound memory growth.
    if (rateBuckets.size > 5000) {
      for (const [key, value] of rateBuckets) {
        if (now > value.resetAt) rateBuckets.delete(key);
      }
    }
    rateBuckets.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_LIMIT_MAX) return false;
  bucket.count += 1;
  return true;
}

function isAllowedDocumentFile(file: File): boolean {
  const type = (file.type || '').toLowerCase();
  return type.startsWith('image/') || type === 'application/pdf';
}

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
    // 1. Require an authenticated session. This endpoint calls a paid model, so
    //    it must never run for anonymous callers.
    const supabase = await createClient();
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();
    if (sessionError || !session) {
      return { success: false, error: 'Unauthorized: please sign in to verify documents.' };
    }

    // 2. Best-effort per-user rate limit.
    if (!checkRateLimit(session.user.id)) {
      return {
        success: false,
        error: 'Too many verification requests. Please wait a moment and try again.',
      };
    }

    const file = formData.get('file') as File | null;
    const requirementName = (formData.get('requirementName') as string | null) ?? 'Unknown requirement';

    if (!file) {
      return { success: false, error: 'No file provided for verification.' };
    }

    // 3. Validate file type and size before paying for a model call.
    if (!isAllowedDocumentFile(file)) {
      return { success: false, error: 'Unsupported file type. Please upload an image or PDF.' };
    }
    if (file.size > MAX_FILE_BYTES) {
      return { success: false, error: 'File is too large. Please upload a file under 10 MB.' };
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
