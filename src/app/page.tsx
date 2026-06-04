'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from 'src/app/utils/supabase/client';
import Link from 'next/link';
import BrandLogo from '@/components/BrandLogo';

function LandingPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const errorParam = searchParams.get('error');
  const [error, setError] = useState<string | null>(
    errorParam === 'auth_callback_failed'
      ? 'Your sign-in link has expired or is invalid. Please try again.'
      : errorParam === 'session_required'
        ? 'Your invitation link was not recognized. Please contact support or request a new invite.'
        : null
  );

  useEffect(() => {
    // Check if user is already authenticated
    const checkAuth = async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        // User is authenticated, redirect to dashboard
        router.replace('/dashboard');
      } else {
        setLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSigningIn(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        setError(error.message);
      } else if (data.session) {
        router.replace('/dashboard');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(message);
    } finally {
      setSigningIn(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-400 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex flex-col">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <BrandLogo size="md" showWordmark showTagline wordmarkClassName="text-white text-base sm:text-xl" />
            <Link
              href="/request-access"
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-3 sm:px-6 py-2 sm:py-2.5 rounded-lg transition-colors shadow-lg text-sm sm:text-base min-h-[44px] flex items-center justify-center whitespace-nowrap text-center shrink-0"
            >
              Request Access
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 items-center justify-center px-4 pt-28 sm:pt-24 lg:pt-32 pb-8">
        <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* Left Side - Marketing Content */}
          <div className="text-white space-y-6">
            <div className="inline-block bg-blue-500/20 border border-blue-400/30 rounded-full px-4 py-2 mb-4">
              <span className="text-blue-300 text-sm font-medium">Built for Regulated Care Facilities</span>
            </div>
            
            <h2 className="text-3xl md:text-5xl font-bold leading-tight">
              Inspection-Ready Compliance for Childcare &amp; Long-Term Care
            </h2>
            
            <p className="text-lg md:text-xl text-blue-200 leading-relaxed">
              Compliance Guard Pro scores your facility and staff against the exact Arkansas
              requirements your license demands &mdash; with AI document verification and
              primary-source nurse-license monitoring.
            </p>

            <div className="space-y-4 pt-4">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-lg">Twin-Score Readiness</h3>
                  <p className="text-blue-200 text-sm">Live facility and staff compliance scores against the precise rules your license requires &mdash; so you see gaps before an inspector does.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-lg">AI-Verified Document Vault</h3>
                  <p className="text-blue-200 text-sm">Upload a license or certificate and AI extracts expiration dates, validates it against the requirement, and preserves a full audit trail.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-lg">Nursys Nurse License Verification</h3>
                  <p className="text-blue-200 text-sm">Automated, primary-source RN and LPN license checks through Nursys &mdash; no manual Board of Nursing lookups.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-lg">Staffing Ratio Enforcement</h3>
                  <p className="text-blue-200 text-sm">Continuous monitoring of staff-to-resident and staff-to-child ratios for your exact license type.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side - Login Form */}
          <div className="bg-white rounded-2xl shadow-2xl p-8 lg:p-10">
            <div className="mb-8">
              <h3 className="text-2xl font-bold text-slate-900 mb-2">Sign In to Your Account</h3>
              <p className="text-slate-600">Access your compliance dashboard</p>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-lg">
                <p className="text-sm text-rose-800 font-medium">❌ {error}</p>
              </div>
            )}

            <form onSubmit={handleSignIn} className="space-y-6">
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-slate-700 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  placeholder="you@facility.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-slate-700 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={signingIn}
                className={`w-full py-3.5 px-6 rounded-lg font-bold text-white transition-all ${
                  signingIn
                    ? 'bg-slate-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 shadow-lg hover:shadow-xl'
                }`}
              >
                {signingIn ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    Signing In...
                  </span>
                ) : (
                  'Sign In'
                )}
              </button>

              <div className="text-right">
                <Link
                  href="/auth/forgot-password"
                  className="text-sm text-slate-500 hover:text-blue-600 transition-colors"
                >
                  Forgot your password?
                </Link>
              </div>
            </form>

            <div className="mt-8 pt-6 border-t border-slate-200">
              <p className="text-center text-sm text-slate-600">
                Don&apos;t have an account?{' '}
                <Link href="/request-access" className="text-blue-600 hover:text-blue-700 font-semibold">
                  Request Access
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-blue-300 text-sm">
            © 2026 Compliance Guard Pro. Strictly-typed regulatory intelligence.
          </p>
          <div className="mt-3 flex items-center justify-center gap-4 text-xs text-blue-300">
            <Link href="/terms" className="hover:text-white">Terms</Link>
            <span aria-hidden="true">·</span>
            <Link href="/privacy" className="hover:text-white">Privacy</Link>
            <span aria-hidden="true">·</span>
            <Link href="/disclaimer" className="hover:text-white">Disclaimer</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function LandingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-400 border-t-transparent" />
      </div>
    }>
      <LandingPageInner />
    </Suspense>
  );
}
