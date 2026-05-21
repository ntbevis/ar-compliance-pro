'use client';

import { useEffect, useState } from 'react';
import { attestDailyBlueprints, getFacilityComplianceData } from 'src/app/actions/compliance';
import type { IdentifiedGap } from '@/lib/types';

interface Props {
  facilityId: string;
}

interface BlueprintItem {
  id: string;
  name: string;
  typeKey: string;
  severity: 'critical' | 'standard';
  frequency: string;
  is_scored: boolean;
}

export default function OperationalBlueprintsView({ facilityId }: Props) {
  const [items, setItems] = useState<BlueprintItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [comment, setComment] = useState<string>('');
  const [lastAttestation, setLastAttestation] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await getFacilityComplianceData(facilityId);
        const gaps = (data.gaps ?? []) as IdentifiedGap[];
        // Operational blueprints = unscored rules OR rules whose frequency is daily/weekly.
        const blueprint = gaps.filter(
          (g) =>
            g.is_scored === false ||
            ['daily', 'weekly'].includes(String(g.frequency).toLowerCase())
        );
        setItems(
          blueprint.map((g) => ({
            id: g.id,
            name: g.name,
            typeKey: g.typeKey,
            severity: g.severity,
            frequency: String(g.frequency ?? ''),
            is_scored: g.is_scored,
          }))
        );
      } catch (err) {
        console.error('Failed to load blueprints:', err);
        setItems([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [facilityId]);

  const handleAttest = async () => {
    if (!confirm('Confirm that today\'s operational guidelines have been physically verified?')) return;
    setSubmitting(true);
    try {
      const result = await attestDailyBlueprints(facilityId, comment.trim() || null);
      if (result.success) {
        setLastAttestation(new Date().toLocaleString());
        setComment('');
        alert(`✅ ${result.message}`);
      } else {
        alert(`❌ Attestation failed: ${result.error}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const grouped = items.reduce<Record<string, BlueprintItem[]>>((acc, item) => {
    const key = (item.frequency || 'unscheduled').toLowerCase();
    (acc[key] ??= []).push(item);
    return acc;
  }, {});

  return (
    <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm max-w-6xl mx-auto text-slate-800 space-y-6">
      <header className="space-y-2">
        <h2 className="text-2xl font-bold">📖 Operational Blueprints &amp; Daily Guidelines</h2>
        <p className="text-sm text-slate-600">
          This is your digital manual. The items below are non-scored guidelines and daily/weekly checks.
          They are not graded — but they must be physically verified each day for survey readiness.
        </p>
      </header>

      <section className="bg-indigo-50 border-2 border-indigo-300 rounded-xl p-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-indigo-700 mb-2">
          ✓ Daily Operational Attestation
        </h3>
        <p className="text-sm text-indigo-900 mb-4">
          Once you have physically verified the daily guidelines below, log a timestamped attestation.
        </p>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Optional notes about today's verification (incidents, deviations, etc.)"
          className="w-full px-3 py-2 border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm bg-white"
          rows={3}
        />
        <div className="flex items-center justify-between gap-4 mt-4 flex-wrap">
          <p className="text-xs text-indigo-700">
            {lastAttestation
              ? `✅ Last attestation logged: ${lastAttestation}`
              : 'No attestation logged yet this session.'}
          </p>
          <button
            onClick={handleAttest}
            disabled={submitting}
            className={`px-6 py-2.5 rounded-lg font-bold text-sm transition-all ${
              submitting
                ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md'
            }`}
          >
            {submitting ? 'Logging…' : 'Attest Daily Guidelines Met'}
          </button>
        </div>
      </section>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3 text-indigo-600">
            <div className="w-6 h-6 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            <span className="font-medium">Loading blueprints…</span>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="border border-dashed border-slate-200 rounded-xl p-12 text-center italic text-slate-400 text-sm bg-slate-50">
          No unscored or daily/weekly guidelines apply to this facility profile.
        </div>
      ) : (
        Object.entries(grouped).map(([frequency, group]) => (
          <section key={frequency} className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-100 px-6 py-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                {frequency.toUpperCase()} ({group.length})
              </h3>
            </div>
            <ul className="divide-y divide-slate-100">
              {group.map((item) => (
                <li key={item.id} className="px-6 py-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-sm text-slate-800">{item.name}</p>
                    <p className="text-[11px] font-mono text-slate-400 mt-0.5">{item.typeKey}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                        item.severity === 'critical'
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {item.severity.toUpperCase()}
                    </span>
                    {!item.is_scored && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                        UNSCORED
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
