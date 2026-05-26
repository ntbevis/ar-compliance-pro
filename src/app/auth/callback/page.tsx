'use client';

import { Suspense, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from 'src/app/utils/supabase/client';
import type { EmailOtpType } from '@supabase/supabase-js';

/**
 * Auth callback page — handles ALL invite / magic-link / OAuth flows.
 *
 * Running client-side is intentional: Supabase invite emails often redirect
 * here with hash fragments (#access_token=…) which are invisible to the
 * server. The Supabase browser client auto-detects those hash tokens when
 * getSession() is called, so all three formats are handled in one place:
 *
 *   1. PKCE code   — ?code=<auth_code>
 *   2. OTP token   — ?token_hash=<hash>&type=invite
 *   3. Implicit    — #access_token=<token>&type=invite  (auto-detected by SDK)
 */
function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const next = searchParams.get('next') ?? '/onboarding';
    const supabase = createClient();

    const handleCallback = async () => {
      const code = searchParams.get('code');
      const token_hash = searchParams.get('token_hash');
      const type = searchParams.get('type') as EmailOtpType | null;

      if (code) {
        // ── PKCE code flow ─────────────────────────────────────────────────
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          router.replace(next);
          return;
        }
        console.error('❌ PKCE exchange failed:', error.message);
      } else if (token_hash && type) {
        // ── OTP / invite token flow ────────────────────────────────────────
        const { error } = await supabase.auth.verifyOtp({ token_hash, type });
        if (!error) {
          router.replace(next);
          return;
        }
        console.error('❌ OTP verification failed:', error.message);
      } else {
        // ── Implicit / hash flow ───────────────────────────────────────────
        // The Supabase browser client detects #access_token= in the URL hash
        // automatically. A short delay lets the SDK parse it before we check.
        await new Promise((resolve) => setTimeout(resolve, 100));
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          router.replace(next);
          return;
        }
        console.error('❌ No session found after hash token detection');
      }

      router.replace('/?error=auth_callback_failed');
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
