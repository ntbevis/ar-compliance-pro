import { createClient } from 'src/app/utils/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';

/**
 * Handles the OAuth / magic-link / invite / password-reset callback from Supabase.
 *
 * Supabase can redirect here in two formats:
 *   1. PKCE flow  — ?code=<auth_code>&next=<destination>
 *   2. OTP/invite — ?token_hash=<hash>&type=invite&next=<destination>
 *
 * Both are exchanged for a server-side session, then the user is forwarded
 * to `next` (defaults to /onboarding for new owner invites).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  // `next` lets the caller specify where to land after auth (defaults to /onboarding for invites)
  const next = searchParams.get('next') ?? '/onboarding';

  const supabase = await createClient();

  if (code) {
    // ── PKCE flow ────────────────────────────────────────────────────────────
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error('❌ Auth callback PKCE exchange failed:', error.message);
  } else if (token_hash && type) {
    // ── OTP / invite token flow ───────────────────────────────────────────────
    // Supabase invite emails may deliver token_hash+type instead of a PKCE code.
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error('❌ Auth callback OTP verification failed:', error.message);
  } else {
    console.error('❌ Auth callback received no code or token_hash:', request.url);
  }

  // Something went wrong — send back to login with a query flag so the page can show a message
  return NextResponse.redirect(`${origin}/?error=auth_callback_failed`);
}
