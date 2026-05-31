'use server';

import { createClient } from 'src/app/utils/supabase/server';

export type ForgotPasswordState = {
  error: string | null;
  success: boolean;
  email: string;
};

/**
 * Resolves the canonical site URL using a priority cascade:
 *  1. NEXT_PUBLIC_SITE_URL  – explicit override (set in Vercel dashboard)
 *  2. VERCEL_PROJECT_PRODUCTION_URL – Vercel auto-injects this for production deployments
 *  3. VERCEL_URL – Vercel auto-injects this for every deployment (preview & production)
 *
 * VERCEL_PROJECT_PRODUCTION_URL / VERCEL_URL are server-side runtime variables,
 * so they are always available regardless of build-time env state.
 */
function resolveSiteUrl(): string | null {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return null;
}

export async function forgotPasswordAction(
  _prevState: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  try {
    const supabase = await createClient();
    const email = formData.get('email') as string;

    if (!email) {
      return { error: 'Email is required.', success: false, email: '' };
    }

    const siteUrl = resolveSiteUrl();
    if (!siteUrl) {
      return {
        error: 'Server misconfiguration: site URL could not be determined.',
        success: false,
        email,
      };
    }

    const redirectTo = `${siteUrl}/auth/callback?next=/auth/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

    if (error) {
      return { error: error.message, success: false, email };
    }

    return { error: null, success: true, email };
  } catch {
    return {
      error: 'An unexpected server error occurred. Please try again.',
      success: false,
      email: '',
    };
  }
}
