import { createClient } from 'src/app/utils/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Handles the OAuth / magic-link / invite / password-reset callback from Supabase.
 * Supabase redirects here with ?code=... after the user clicks an email link.
 * We exchange the code for a session and forward the user to the intended destination.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // `next` lets the caller specify where to land after auth (defaults to /onboarding for invites)
  const next = searchParams.get('next') ?? '/onboarding';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error('❌ Auth callback code exchange failed:', error.message);
  }

  // Something went wrong — send back to login with a query flag so the page can show a message
  return NextResponse.redirect(`${origin}/?error=auth_callback_failed`);
}
