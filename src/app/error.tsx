'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled application error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-10 text-center space-y-5">
        <div className="text-5xl">⚠️</div>
        <h1 className="text-2xl font-bold text-slate-900">Something went wrong</h1>
        <p className="text-slate-500 text-sm leading-relaxed">
          An unexpected error occurred. Our team has been notified. You can try refreshing the page,
          or contact support if the problem persists.
        </p>
        {error.digest && (
          <p className="text-[10px] font-mono text-slate-400">Error ID: {error.digest}</p>
        )}
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="px-6 py-2.5 bg-slate-200 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-300 transition-colors"
          >
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
