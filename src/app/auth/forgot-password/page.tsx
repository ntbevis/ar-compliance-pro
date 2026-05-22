'use client';

import { useState } from 'react';
import { createClient } from 'src/app/utils/supabase/client';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=/auth/reset-password`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });
      if (resetError) {
        setError(resetError.message);
      } else {
        setSent(true);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="mb-8">
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mb-4">
              <span className="text-2xl">🔑</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-1">Reset your password</h1>
            <p className="text-slate-500 text-sm">
              Enter your email and we&apos;ll send you a link to set a new password.
            </p>
          </div>

          {sent ? (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                <p className="text-sm font-semibold text-emerald-800">
                  ✅ Reset link sent! Check your inbox for <span className="font-mono">{email}</span>.
                </p>
                <p className="text-xs text-emerald-600 mt-1">
                  The link expires in 1 hour. Check your spam folder if you don&apos;t see it.
                </p>
              </div>
              <Link
                href="/"
                className="block text-center text-sm text-blue-600 hover:text-blue-700 font-semibold"
              >
                ← Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg">
                  <p className="text-sm text-rose-800 font-medium">❌ {error}</p>
                </div>
              )}

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
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-slate-900"
                  placeholder="you@facility.com"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className={`w-full py-3.5 px-6 rounded-lg font-bold text-white transition-all ${
                  submitting
                    ? 'bg-slate-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 shadow-lg hover:shadow-xl'
                }`}
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Sending…
                  </span>
                ) : (
                  'Send Reset Link'
                )}
              </button>

              <Link
                href="/"
                className="block text-center text-sm text-slate-500 hover:text-slate-700 transition-colors"
              >
                ← Back to sign in
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
