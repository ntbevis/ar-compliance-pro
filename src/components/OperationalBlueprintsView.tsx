'use client';

import { useEffect, useState } from 'react';
import {
  getOperationalBlueprints,
  signOperationalAcknowledgment,
  getLatestOperationalAcknowledgment,
  type BlueprintRule,
} from 'src/app/actions/compliance';

interface Props {
  facilityId: string;
}

interface LastAcknowledgment {
  created_at: string;
  user_name: string;
}

const FREQUENCY_ORDER = [
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'biannual',
  'annual',
  '2_years',
  '3_years',
  '5_years',
  '10_years',
  'one-time',
  'ongoing',
];

function sortedFrequencyEntries(
  grouped: Record<string, BlueprintRule[]>
): [string, BlueprintRule[]][] {
  return Object.entries(grouped).sort(([a], [b]) => {
    const ia = FREQUENCY_ORDER.indexOf(a);
    const ib = FREQUENCY_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

function formatAckDate(isoString: string): string {
  try {
    return new Date(isoString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

export default function OperationalBlueprintsView({ facilityId }: Props) {
  const [items, setItems] = useState<BlueprintRule[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastAck, setLastAck] = useState<LastAcknowledgment | null>(null);
  const [acknowledged, setAcknowledged] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [rules, ack] = await Promise.all([
          getOperationalBlueprints(facilityId),
          getLatestOperationalAcknowledgment(facilityId),
        ]);
        if (!cancelled) {
          setItems(rules);
          setLastAck(ack);
        }
      } catch (err) {
        console.error('Failed to load operational blueprints:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [facilityId]);

  const handleSign = async () => {
    if (!acknowledged || submitting) return;
    setSubmitting(true);
    try {
      const result = await signOperationalAcknowledgment(facilityId);
      if (result.success) {
        setLastAck(result.acknowledgment);
        setAcknowledged(false);
      } else {
        alert(`❌ ${result.error}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const grouped = items.reduce<Record<string, BlueprintRule[]>>((acc, item) => {
    const key = (item.frequency || 'unscheduled').toLowerCase();
    (acc[key] ??= []).push(item);
    return acc;
  }, {});

  return (
    <div className="space-y-8 max-w-6xl mx-auto">

      {/* ── Liability & Operations Acknowledgment ─────────────────────────── */}
      <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-900 to-indigo-700 px-8 py-5">
          <p className="text-indigo-300 text-xs font-bold uppercase tracking-widest mb-1">
            Facility Director
          </p>
          <h2 className="text-2xl font-bold text-white">
            Liability &amp; Operations Acknowledgment
          </h2>
          <p className="text-indigo-300 text-sm mt-1">
            A formal, timestamped record that the director accepts responsibility for
            upholding these operational standards.
          </p>
        </div>

        <div className="p-8">
          {lastAck ? (
            <div className="space-y-5">
              {/* Current acknowledgment status */}
              <div className="flex items-start gap-4 bg-emerald-50 border border-emerald-200 rounded-xl p-5">
                <span className="text-2xl mt-0.5">✅</span>
                <div>
                  <p className="font-bold text-slate-800">
                    Acknowledged by {lastAck.user_name}
                  </p>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {formatAckDate(lastAck.created_at)}
                  </p>
                  <p className="text-xs text-emerald-700 mt-2 italic">
                    &ldquo;I acknowledge that maintaining these operational standards is my
                    responsibility as the facility director.&rdquo;
                  </p>
                </div>
              </div>

              {/* Re-sign option */}
              <div className="border-t border-slate-100 pt-5">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                  Update Acknowledgment
                </p>
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-indigo-600 cursor-pointer"
                  />
                  <span className="text-sm text-slate-700 group-hover:text-slate-900">
                    I acknowledge that maintaining these operational standards is my
                    responsibility as the facility director.
                  </span>
                </label>
                {acknowledged && (
                  <button
                    onClick={handleSign}
                    disabled={submitting}
                    className={`mt-4 px-5 py-2 rounded-lg font-bold text-sm transition-all ${
                      submitting
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
                    }`}
                  >
                    {submitting ? 'Signing…' : 'Update Acknowledgment'}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5">
                <p className="text-sm text-indigo-900 leading-relaxed">
                  Review the operational standards below, then sign this acknowledgment.
                  Your name and timestamp will be recorded in the facility&apos;s compliance
                  audit trail.
                </p>
              </div>

              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-indigo-600 cursor-pointer"
                />
                <span className="text-sm text-slate-700 group-hover:text-slate-900">
                  I acknowledge that maintaining these operational standards is my
                  responsibility as the facility director.
                </span>
              </label>

              <button
                onClick={handleSign}
                disabled={!acknowledged || submitting}
                className={`px-6 py-2.5 rounded-lg font-bold text-sm transition-all ${
                  !acknowledged || submitting
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md'
                }`}
              >
                {submitting ? 'Signing…' : 'Sign Operational Acknowledgment'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Reference Manual ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5">
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">
            Reference Manual
          </p>
          <h2 className="text-2xl font-bold text-white">📖 Operational Standards</h2>
          <p className="text-slate-400 text-sm mt-1">
            All compliance requirements for this facility. Standards shown in bold are scored;
            operational guidelines are informational.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex items-center gap-3 text-indigo-600">
              <div className="w-6 h-6 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <span className="font-medium text-sm">Loading standards…</span>
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center italic text-slate-400 text-sm">
            No compliance standards are configured for this facility profile.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {sortedFrequencyEntries(grouped).map(([frequency, group]) => (
              <div key={frequency}>
                {/* Frequency group header */}
                <div className="bg-slate-50 px-8 py-3 flex items-center gap-3">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                    {frequency.replace(/_/g, ' ')}
                  </span>
                  <span className="text-xs text-slate-400 bg-slate-200 rounded-full px-2 py-0.5 font-medium">
                    {group.length}
                  </span>
                </div>

                {/* Rule cards */}
                <ul className="divide-y divide-slate-100">
                  {group.map((item) => (
                    <li key={item.id} className="px-8 py-4 flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p
                          className={`text-sm text-slate-800 ${
                            item.is_scored ? 'font-semibold' : 'font-normal'
                          }`}
                        >
                          {item.name}
                        </p>
                        <p className="text-[11px] font-mono text-slate-400 mt-0.5 truncate">
                          {item.typeKey}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            item.severity === 'critical'
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {item.severity.toUpperCase()}
                        </span>
                        {!item.is_scored && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                            OPERATIONAL
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {!loading && items.length > 0 && (
          <div className="px-8 py-4 bg-slate-50 border-t border-slate-200 text-right">
            <p className="text-xs text-slate-400">
              {items.length} standard{items.length !== 1 ? 's' : ''} •{' '}
              {items.filter((i) => i.severity === 'critical').length} critical
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
