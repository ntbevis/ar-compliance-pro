'use server';

import { createClient } from 'src/app/utils/supabase/server';
import { headers } from 'next/headers';

export type ForgotPasswordState = {
  error: string | null;
  success: boolean;
  email: string;
};

export async function forgotPasswordAction(
  _prevState: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  const email = formData.get('email') as string;

  if (!email) {
    return { error: 'Email is required.', success: false, email: '' };
  }

  const headersList = await headers();
  const origin =
    headersList.get('origin') ??
    `${headersList.get('x-forwarded-proto') ?? 'https'}://${headersList.get('host')}`;

  const redirectTo = `${origin}/auth/callback?next=/auth/reset-password`;

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

  if (error) {
    return { error: error.message, success: false, email };
  }

  return { error: null, success: true, email };
}
