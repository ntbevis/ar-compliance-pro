'use client';

import Image from 'next/image';
import ComplianceScoreWheel from '@/components/ComplianceScoreWheel';
import { PRODUCT_NAME, PRODUCT_TAGLINE } from '@/lib/legal';
import {
  ONE_PAGER_FACILITY_GAPS,
  ONE_PAGER_FACILITY_SCORE,
  ONE_PAGER_PERSONNEL_GAPS,
  ONE_PAGER_PERSONNEL_SCORE,
} from '@/lib/marketing/one-pager-demo-data';

const APP_URL = 'https://app.complianceguardpro.io';

const FEATURES = [
  'Twin-score readiness dashboards for facility operations and personnel licensing',
  'Personnel Vault maps every role to Arkansas regulatory requirements',
  'Primary-source nursing license verification via official Nursys API',
  'AI-assisted document review with expiration tracking and renewal alerts',
  'Operational blueprints, staffing ratios, and scope-aware compliance rules',
  'Built on secure, tenant-isolated infrastructure with row-level security',
] as const;

export default function OnePagerContent() {
  const handlePrint = () => window.print();

  return (
    <>
      {/* Screen-only toolbar */}
      <div className="print:hidden fixed top-4 right-4 z-50 flex gap-2">
        <button
          type="button"
          onClick={handlePrint}
          className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-blue-800"
        >
          Print / Save as PDF
        </button>
      </div>

      <article
        className="one-pager-sheet mx-auto flex w-[8.5in] min-h-[11in] max-w-none flex-col bg-white text-slate-900 shadow-2xl print:shadow-none print:m-0"
        aria-label={`${PRODUCT_NAME} marketing one-pager`}
      >
        {/* Header */}
        <header className="flex items-center gap-4 border-b border-slate-200 px-8 pb-4 pt-6 print:px-6 print:pt-5 print:pb-3">
          <Image
            src="/logo-shield-linkedin.png"
            alt=""
            width={56}
            height={56}
            className="h-14 w-14 shrink-0 print:h-12 print:w-12"
            priority
          />
          <div>
            <p className="text-xl font-bold tracking-tight text-slate-900 print:text-lg">
              {PRODUCT_NAME}
            </p>
            <p className="text-sm font-medium text-blue-700 print:text-xs">{PRODUCT_TAGLINE}</p>
            <p className="text-xs text-slate-500 print:text-[10px]">
              Arkansas Childcare Centers &amp; Nursing Homes
            </p>
          </div>
        </header>

        {/* Hero */}
        <section className="px-8 pt-5 print:px-6 print:pt-4">
          <h1 className="text-[1.65rem] font-black leading-tight tracking-tight text-slate-900 print:text-2xl">
            Simplify Regulatory Compliance Before Your Next Inspection
          </h1>
          <p className="mt-2 max-w-none text-sm leading-snug text-slate-600 print:text-xs print:leading-relaxed">
            {PRODUCT_NAME} gives facility directors a live readiness picture — twin compliance
            scores, automated credential tracking, and Arkansas-specific rules mapped to your
            staff and scope.
          </p>
        </section>

        {/* Score wheels */}
        <section className="one-pager-wheels px-6 pt-4 print:px-4 print:pt-3">
          <div className="grid grid-cols-2 gap-3 print:gap-2">
            <div className="one-pager-wheel-wrap origin-top scale-[0.82] print:scale-[0.72]">
              <ComplianceScoreWheel
                label="Facility Operations Score"
                emoji="🏢"
                score={ONE_PAGER_FACILITY_SCORE}
                gaps={ONE_PAGER_FACILITY_GAPS}
                description="Building, food service, transportation, and structural compliance."
              />
            </div>
            <div className="one-pager-wheel-wrap origin-top scale-[0.82] print:scale-[0.72]">
              <ComplianceScoreWheel
                label="Personnel & Licensing Upkeep"
                emoji="👥"
                score={ONE_PAGER_PERSONNEL_SCORE}
                gaps={ONE_PAGER_PERSONNEL_GAPS}
                description="Staff credentials, background checks, and role-specific certifications."
              />
            </div>
          </div>
        </section>

        {/* Features + founder */}
        <section className="grid flex-1 grid-cols-2 gap-6 px-8 pt-2 print:px-6 print:gap-4 print:pt-1">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-blue-800 print:text-[10px]">
              Key Capabilities
            </h2>
            <ul className="mt-2 space-y-1.5 print:space-y-1">
              {FEATURES.map((feature) => (
                <li key={feature} className="flex gap-2 text-xs leading-snug text-slate-700 print:text-[10px]">
                  <span
                    className="mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500 print:mt-1"
                    aria-hidden
                  />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-blue-800 print:text-[10px]">
              Built in Arkansas, for Arkansas
            </h2>
            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 print:p-2 print:bg-slate-50">
              <p className="text-xs font-semibold text-slate-900 print:text-[10px]">Nolan Bevis, Founder</p>
              <p className="mt-1.5 text-xs leading-snug text-slate-600 print:text-[10px] print:leading-relaxed">
                Financial and healthcare operations leader with 8+ years driving process
                automation for enterprise SaaS and regulated health plans. Nolan founded{' '}
                {PRODUCT_NAME} after seeing how manual binders and spreadsheets leave
                directors unprepared when surveys arrive.
              </p>
              <p className="mt-1.5 text-xs leading-snug text-slate-600 print:text-[10px] print:leading-relaxed">
                His wife is a registered nurse in Arkansas — giving the team firsthand insight
                into the licensing, credentialing, and staffing pressures nursing homes and
                clinical childcare programs face every day.
              </p>
            </div>
          </div>
        </section>

        {/* Footer CTA */}
        <footer className="mt-auto border-t border-blue-900/10 bg-gradient-to-r from-slate-900 via-blue-900 to-slate-900 px-8 py-4 text-white print:px-6 print:py-3 print:bg-blue-900">
          <div className="flex items-center justify-between gap-4 print:flex-col print:items-start print:gap-1">
            <div>
              <p className="text-sm font-bold print:text-xs">Ready to see your facility&apos;s score?</p>
              <p className="text-xs text-blue-100 print:text-[10px]">
                Request access today — onboarding takes minutes, not weeks.
              </p>
            </div>
            <p className="shrink-0 text-right text-sm font-semibold print:text-xs">
              <span className="text-blue-200 print:text-blue-100">→</span>{' '}
              <span className="underline decoration-blue-300 underline-offset-2">
                {APP_URL.replace('https://', '')}
              </span>
            </p>
          </div>
          <p className="mt-2 text-[10px] text-blue-200/80 print:mt-1">
            nolan@complianceguardpro.io · Compliance Guard Pro, LLC · Little Rock, Arkansas
          </p>
        </footer>
      </article>
    </>
  );
}
