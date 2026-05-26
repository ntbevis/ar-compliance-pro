'use client';

import { Suspense, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from 'src/app/utils/supabase/client';
import type { EmailOtpType } from '@supabase/supabase-js';

/**
 * Auth callback page — handles ALL invite / magic-link / OAuth flows.
 *
 * Supabase invite emails redirect here in one of three formats:
 *
 *   1. Implicit / hash  — #access_token=…&refresh_token=…&type=invite
 *   2. PKCE code        — ?code=<auth_code>
 *   3. OTP token        — ?token_hash=<hash>&type=invite
 *
 * The @supabase/ssr browser client has detectSessionInUrl disabled, so we
 * parse window.location.hash explicitly for case 1 and call setSession()
 * directly. Cases 2 and 3 are handled via the standard SDK methods.
 */
function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    // Invite links no longer carry a ?next= param — default to password setup.
    const next = searchParams.get('next') ?? '/auth/reset-password?next=/onboarding';
    const supabase = createClient();

    const handleCallback = async () => {
      const code = searchParams.get('code');
      const token_hash = searchParams.get('token_hash');
      const type = searchParams.get('type') as EmailOtpType | null;

      const fail = (reason: string, detail = '') => {
        console.error(`❌ Auth callback failed [${reason}]:`, detail);
        router.replace(`/?error=${encodeURIComponent(reason)}&detail=${encodeURIComponent(detail)}`);
      };

      // ── 1. PKCE code flow ─────────────────────────────────────────────────
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) { router.replace(next); return; }
        fail('pkce_failed', error.message);
        return;
      }

      // ── 2. OTP / invite token flow ────────────────────────────────────────
      if (token_hash && type) {
        const { error } = await supabase.auth.verifyOtp({ token_hash, type });
        if (!error) { router.replace(next); return; }
        fail('otp_failed', error.message);
        return;
      }

      // ── 3. Implicit / hash flow ───────────────────────────────────────────
      const hash = window.location.hash.substring(1);
      const hashParams = new URLSearchParams(hash);
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (!error) { router.replace(next); return; }
        fail('hash_failed', error.message);
        return;
      }

      // No token found in any format — expose what the URL actually contained
      fail('no_tokens', `search=${window.location.search} hash=${window.location.hash.substring(0, 80)}`);
    };

    handleCallback();
  }, [router, searchParams]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-400 border-t-transparent mx-auto" />
        <p className="text-blue-200 text-sm">Authenticating, please wait…</p>
      </div>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-400 border-t-transparent" />
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
