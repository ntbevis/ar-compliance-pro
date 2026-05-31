'use client';

import { useEffect, useState } from 'react';
import { getUpcomingRenewals } from 'src/app/actions/compliance';
import type { RenewalItem, RenewalStatus } from '@/lib/renewals';

interface RenewalsViewProps {
  facilityId: string;
}

const WINDOW_DAYS = 60;

function daysLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Today';
  return `${days}d left`;
}

function StatusPill({ status }: { status: RenewalStatus }) {
  const map: Record<RenewalStatus, string> = {
    expired: 'bg-rose-100 text-rose-700 border-rose-200',
    due_soon: 'bg-amber-100 text-amber-700 border-amber-200',
    upcoming: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  const label: Record<RenewalStatus, string> = {
    expired: 'Expired',
    due_soon: 'Due Soon',
    upcoming: 'Upcoming',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border ${map[status]}`}>
      {label[status]}
    </span>
  );
}

function RenewalRow({ item }: { item: RenewalItem }) {
  return (
    <div className="flex flex-wrap items-center gap-3 py-3 px-4 border-b border-slate-100 last:border-0">
      <div className="flex-1 min-w-[180px]">
        <p className="font-bold text-slate-900 text-sm">
          {item.requirementName ?? item.documentName}
        </p>
        <p className="text-xs text-slate-500">
          {item.personnelName ? (
            <>👤 {item.personnelName}</>
          ) : (
            <>🏢 Facility document</>
          )}
          {item.documentType ? ` • ${item.documentType.replace(/_/g, ' ')}` : ''}
        </p>
      </div>
      {item.severity === 'critical' && (
        <span className="text-[10px] font-black uppercase tracking-wider text-rose-600">
          Critical
        </span>
      )}
      <div className="text-right">
        <p className="text-sm font-semibold text-slate-700">
          {new Date(item.expiration).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })}
        </p>
        <p
          className={`text-xs font-bold ${
            item.daysUntil < 0 ? 'text-rose-600' : item.daysUntil <= 30 ? 'text-amber-600' : 'text-slate-400'
          }`}
        >
          {daysLabel(item.daysUntil)}
        </p>
      </div>
      <StatusPill status={item.status} />
    </div>
  );
}

export default function RenewalsView({ facilityId }: RenewalsViewProps) {
  const [items, setItems] = useState<RenewalItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // Re-fetch when the facility changes (external data sync).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    getUpcomingRenewals(facilityId, WINDOW_DAYS)
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [facilityId]);

  const expired = items.filter((i) => i.status === 'expired');
  const dueSoon = items.filter((i) => i.status === 'due_soon');
  const upcoming = items.filter((i) => i.status === 'upcoming');

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400 text-sm animate-pulse max-w-5xl mx-auto">
        Scanning credentials and documents for upcoming renewals…
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <p className="text-sm text-slate-600">
        Documents and staff credentials expiring within the next {WINDOW_DAYS} days, plus anything
        already expired. Renew these before your next inspection to keep your readiness score high.
      </p>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-3xl font-black text-rose-600">{expired.length}</p>
          <p className="text-[11px] uppercase tracking-wider font-bold text-slate-500 mt-1">Expired</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-3xl font-black text-amber-600">{dueSoon.length}</p>
          <p className="text-[11px] uppercase tracking-wider font-bold text-slate-500 mt-1">Due ≤ 30 days</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-3xl font-black text-slate-700">{upcoming.length}</p>
          <p className="text-[11px] uppercase tracking-wider font-bold text-slate-500 mt-1">
            Upcoming ≤ {WINDOW_DAYS}d
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-200 p-12 text-center">
          <p className="text-2xl mb-2">✅</p>
          <p className="text-slate-600 font-semibold">Nothing expiring soon.</p>
          <p className="text-slate-400 text-sm mt-1">
            No documents or credentials expire within the next {WINDOW_DAYS} days.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {expired.length > 0 && (
            <section className="bg-white rounded-xl border border-rose-200 overflow-hidden">
              <header className="bg-rose-50 px-4 py-2.5 border-b border-rose-200">
                <h3 className="text-sm font-bold text-rose-800">Expired — resolve immediately</h3>
              </header>
              <div>{expired.map((i) => <RenewalRow key={i.documentId} item={i} />)}</div>
            </section>
          )}

          {dueSoon.length > 0 && (
            <section className="bg-white rounded-xl border border-amber-200 overflow-hidden">
              <header className="bg-amber-50 px-4 py-2.5 border-b border-amber-200">
                <h3 className="text-sm font-bold text-amber-800">Due within 30 days</h3>
              </header>
              <div>{dueSoon.map((i) => <RenewalRow key={i.documentId} item={i} />)}</div>
            </section>
          )}

          {upcoming.length > 0 && (
            <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <header className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
                <h3 className="text-sm font-bold text-slate-700">Upcoming (31–{WINDOW_DAYS} days)</h3>
              </header>
              <div>{upcoming.map((i) => <RenewalRow key={i.documentId} item={i} />)}</div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
