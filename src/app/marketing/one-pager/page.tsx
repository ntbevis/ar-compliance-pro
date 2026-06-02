import type { Metadata } from 'next';
import OnePagerContent from '@/components/marketing/OnePagerContent';
import { PRODUCT_NAME } from '@/lib/legal';

export const metadata: Metadata = {
  title: `${PRODUCT_NAME} — Marketing One-Pager`,
  description: 'Printable one-page overview for facility owners.',
  robots: { index: false, follow: false },
};

export default function MarketingOnePagerPage() {
  return (
    <>
      <style>{`
        @page {
          size: letter;
          margin: 0;
        }

        @media print {
          html,
          body {
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .one-pager-print-root {
            padding: 0 !important;
            background: white !important;
          }

          /* Hide wheel legend + footnotes to keep the sheet on one page */
          .one-pager-wheels .one-pager-wheel-wrap > div > div[class*="space-y-1.5"],
          .one-pager-wheels .one-pager-wheel-wrap > div > p.text-xs {
            display: none !important;
          }

          .one-pager-wheels .one-pager-wheel-wrap > div {
            padding: 0.75rem !important;
            box-shadow: none !important;
            border-width: 1px !important;
          }

          * {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>

      <div className="one-pager-print-root min-h-screen bg-slate-200 py-8 print:min-h-0 print:bg-white print:py-0">
        <OnePagerContent />
      </div>
    </>
  );
}
