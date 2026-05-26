'use server';

import { createClient } from 'src/app/utils/supabase/server';

export type ForgotPasswordState = {
  error: string | null;
  success: boolean;
  email: string;
};

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

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!siteUrl) {
      return {
        error: 'Server misconfiguration: NEXT_PUBLIC_SITE_URL is not set.',
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
  } catch (err) {
    return {
      error: 'An unexpected server error occurred. Please try again.',
      success: false,
      email: '',
    };
  }
}
