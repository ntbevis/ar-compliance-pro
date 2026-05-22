'use client';

import { useEffect } from 'react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard error:', error);
  }, [error]);

  return (
    <div className="p-12 min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-10 text-center space-y-5">
        <div className="text-5xl">🛡️</div>
        <h2 className="text-xl font-bold text-slate-900">Dashboard Error</h2>
        <p className="text-slate-500 text-sm leading-relaxed">
          An error occurred while loading the compliance dashboard. Your data is safe — try
          refreshing, or navigate to a different section.
        </p>
        {error.digest && (
          <p className="text-[10px] font-mono text-slate-400">Error ID: {error.digest}</p>
        )}
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
          <a
            href="/dashboard"
            className="px-5 py-2.5 bg-slate-200 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-300 transition-colors"
          >
            Reload Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
