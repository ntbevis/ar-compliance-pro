import Link from 'next/link';
import { LEGAL_LAST_UPDATED } from '@/lib/legal';

/**
 * Shared readable layout for the Terms / Privacy / Disclaimer pages.
 * Renders a prominent "draft pending attorney review" banner so these are never
 * mistaken for finalized, counsel-approved documents.
 */
export default function LegalPageShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <Link
          href="/"
          className="text-sm text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-1"
        >
          ← Back to home
        </Link>

        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong className="font-semibold">Draft — pending attorney review.</strong>{' '}
          This document is a working template and is not yet finalized legal text. It must be
          reviewed and approved by a licensed attorney before being relied upon.
        </div>

        <h1 className="mt-8 text-3xl font-bold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">Last updated: {LEGAL_LAST_UPDATED}</p>

        <div className="legal-body mt-8 space-y-6 leading-relaxed text-[15px] text-slate-700">
          {children}
        </div>
      </div>
    </div>
  );
}
