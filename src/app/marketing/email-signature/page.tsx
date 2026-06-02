import type { Metadata } from 'next';
import {
  buildEmailSignatureHtml,
  EMAIL_SIGNATURE_HEADSHOT_URL,
  EMAIL_SIGNATURE_LOGO_URL,
} from '@/lib/marketing/email-signature';
import { PRODUCT_NAME } from '@/lib/legal';

export const metadata: Metadata = {
  title: `${PRODUCT_NAME} — Email Signature`,
  description: 'Copy-ready HTML email signature for Nolan Bevis.',
  robots: { index: false, follow: false },
};

const PREVIEW_HTML = buildEmailSignatureHtml();
const PRODUCTION_HTML = buildEmailSignatureHtml('https://app.complianceguardpro.io');

export default function EmailSignaturePage() {
  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-xl font-bold text-slate-900">Email Signature</h1>
        <p className="mt-2 text-sm text-slate-600">
          Preview uses local assets from <code className="rounded bg-slate-200 px-1 text-xs">public/</code>.
          For outgoing email, deploy first — then copy the production HTML so recipients can load images
          from <code className="rounded bg-slate-200 px-1 text-xs">app.complianceguardpro.io</code>.
        </p>

        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Preview (localhost)
          </p>
          <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: PREVIEW_HTML }} />
        </div>

        <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50/50 p-8">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-blue-800">
            Production copy (after deploy)
          </p>
          <p className="mb-4 text-xs text-blue-900/80">
            Image URLs: {EMAIL_SIGNATURE_HEADSHOT_URL} · {EMAIL_SIGNATURE_LOGO_URL}
          </p>
          <div className="overflow-x-auto rounded-lg bg-white p-4" dangerouslySetInnerHTML={{ __html: PRODUCTION_HTML }} />
        </div>

        <details className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">
            Raw production HTML
          </summary>
          <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-900 p-4 text-xs text-slate-100">
            {PRODUCTION_HTML}
          </pre>
        </details>
      </div>
    </div>
  );
}
