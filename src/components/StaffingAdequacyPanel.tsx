import type { StaffingAdequacy, StaffingStatus } from '@/lib/types';

// =============================================================================
// STAFFING ADEQUACY PANEL
// Presentational. Renders the baseline staffing-adequacy estimate produced by
// computeStaffingAdequacy(). Derived from baseline enrollment + active personnel
// — no daily input required. Fully responsive; no hover-only affordances.
// =============================================================================

interface StatusTheme {
  icon: string;
  headline: string;
  accent: string; // left border accent
  pill: string; // status pill bg/text
  bar: string; // progress fill color
  track: string; // progress track color
}

function themeFor(staffing: StaffingAdequacy): StatusTheme {
  const status: StaffingStatus = staffing.status;
  switch (status) {
    case 'adequate':
      return {
        icon: '✅',
        headline: 'Staffing looks adequate',
        accent: 'border-l-emerald-500',
        pill: 'bg-emerald-100 text-emerald-700',
        bar: 'bg-emerald-500',
        track: 'bg-emerald-100',
      };
    case 'tight':
      return {
        icon: '⚠️',
        headline: 'Staffing is tight — no margin for call-outs',
        accent: 'border-l-amber-500',
        pill: 'bg-amber-100 text-amber-700',
        bar: 'bg-amber-500',
        track: 'bg-amber-100',
      };
    case 'understaffed':
      return {
        icon: '🚨',
        headline: `Understaffed by ${staffing.shortfall}`,
        accent: 'border-l-rose-500',
        pill: 'bg-rose-100 text-rose-700',
        bar: 'bg-rose-500',
        track: 'bg-rose-100',
      };
    case 'unknown':
    default:
      return {
        icon: '📋',
        headline: 'Set a baseline to estimate staffing',
        accent: 'border-l-slate-300',
        pill: 'bg-slate-100 text-slate-600',
        bar: 'bg-slate-400',
        track: 'bg-slate-100',
      };
  }
}

const STATUS_LABEL: Record<StaffingStatus, string> = {
  adequate: 'Adequate',
  tight: 'Tight',
  understaffed: 'Understaffed',
  unknown: 'Not set',
};

export default function StaffingAdequacyPanel({ staffing }: { staffing: StaffingAdequacy }) {
  const theme = themeFor(staffing);
  const known = staffing.status !== 'unknown' && staffing.requiredStaff != null;

  // Progress fill: how much of the requirement the current headcount covers.
  const coverage =
    known && staffing.requiredStaff! > 0
      ? Math.min(100, Math.round((staffing.actualStaff / staffing.requiredStaff!) * 100))
      : 0;

  return (
    <div className={`mt-4 pt-4 border-t border-slate-100`}>
      <div className={`rounded-lg border border-slate-200 border-l-4 ${theme.accent} bg-slate-50/60 p-4`}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2.5 min-w-0">
            <span className="text-lg leading-none shrink-0 mt-0.5" aria-hidden>
              {theme.icon}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-800">Baseline Staffing Adequacy</p>
              <p className="text-xs text-slate-600 mt-0.5">{theme.headline}</p>
            </div>
          </div>
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0 ${theme.pill}`}
          >
            {STATUS_LABEL[staffing.status]}
          </span>
        </div>

        {known ? (
          <>
            {/* Required vs. on-record figures */}
            <div className="flex items-end gap-6 mt-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Required (min)
                </p>
                <p className="text-2xl font-black text-slate-900 tabular-nums leading-tight">
                  {staffing.requiredStaff}
                </p>
              </div>
              <div className="text-slate-300 text-xl pb-1">vs</div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  On record
                </p>
                <p
                  className={`text-2xl font-black tabular-nums leading-tight ${
                    staffing.status === 'understaffed' ? 'text-rose-600' : 'text-slate-900'
                  }`}
                >
                  {staffing.actualStaff}
                </p>
              </div>
              {staffing.shortfall > 0 && (
                <div className="ml-auto text-right">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-rose-400">
                    Shortfall
                  </p>
                  <p className="text-2xl font-black text-rose-600 tabular-nums leading-tight">
                    +{staffing.shortfall}
                  </p>
                </div>
              )}
            </div>

            {/* Coverage bar */}
            <div className="mt-3" aria-hidden>
              <div className={`h-2 w-full rounded-full overflow-hidden ${theme.track}`}>
                <div
                  className={`h-full rounded-full ${theme.bar} transition-[width] duration-700 ease-out`}
                  style={{ width: `${coverage}%` }}
                />
              </div>
            </div>

            <p className="text-[11px] text-slate-500 mt-3 font-mono">{staffing.basisLabel}</p>
          </>
        ) : (
          <p className="text-xs text-slate-500 mt-3">{staffing.note}</p>
        )}

        {known && <p className="text-[11px] text-slate-400 mt-2 leading-snug">{staffing.note}</p>}
      </div>
    </div>
  );
}
