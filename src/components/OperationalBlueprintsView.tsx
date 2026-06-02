'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  getOperationalBlueprints,
  signOperationalAcknowledgment,
  getLatestOperationalAcknowledgment,
  type BlueprintRule,
} from 'src/app/actions/compliance';
import {
  getOperationalTasks,
  markOperationalTaskComplete,
  setOperationalTaskAssignee,
  getOperationalTaskHistory,
  getOperationalLogExport,
  type OperationalTask,
  type CompletionHistoryRow,
} from 'src/app/actions/operational';

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

const CADENCE_LABEL: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
};

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

function shortDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

function readingText(reading: Record<string, unknown> | null): string | null {
  if (!reading) return null;
  if (typeof reading.value !== 'undefined') {
    return `${reading.value}${reading.unit ? ` ${reading.unit}` : ''}`;
  }
  return JSON.stringify(reading);
}

const STATUS_META: Record<OperationalTask['status'], { label: string; cls: string; icon: string }> = {
  done: { label: 'Logged', cls: 'bg-emerald-100 text-emerald-700', icon: '✅' },
  due: { label: 'Due', cls: 'bg-amber-100 text-amber-700', icon: '🕘' },
  overdue: { label: 'Overdue', cls: 'bg-rose-100 text-rose-700', icon: '🔴' },
};

export default function OperationalBlueprintsView({ facilityId }: Props) {
  const router = useRouter();

  // Reference manual + acknowledgment (existing)
  const [items, setItems] = useState<BlueprintRule[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastAck, setLastAck] = useState<LastAcknowledgment | null>(null);
  const [acknowledged, setAcknowledged] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [manualOpen, setManualOpen] = useState<boolean>(false);

  // Operational Log (new)
  const [tasks, setTasks] = useState<OperationalTask[]>([]);
  const [roster, setRoster] = useState<Array<{ id: number; name: string }>>([]);
  const [tasksLoading, setTasksLoading] = useState<boolean>(true);

  // Mark-done modal
  const [markTask, setMarkTask] = useState<OperationalTask | null>(null);
  const [readingValue, setReadingValue] = useState('');
  const [readingUnit, setReadingUnit] = useState('');
  const [markNote, setMarkNote] = useState('');
  const [performedById, setPerformedById] = useState<string>('');
  const [performedByName, setPerformedByName] = useState('');
  const [savingMark, setSavingMark] = useState(false);

  // History expander
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [history, setHistory] = useState<CompletionHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [exporting, setExporting] = useState(false);

  const loadTasks = useCallback(async () => {
    setTasksLoading(true);
    try {
      const payload = await getOperationalTasks(facilityId);
      setTasks(payload.tasks);
      setRoster(payload.roster);
    } catch (err) {
      console.error('Failed to load operational tasks:', err);
    } finally {
      setTasksLoading(false);
    }
  }, [facilityId]);

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
    loadTasks();
    return () => {
      cancelled = true;
    };
  }, [facilityId, loadTasks]);

  const handleSign = async () => {
    if (!acknowledged || submitting) return;
    setSubmitting(true);
    try {
      const result = await signOperationalAcknowledgment(facilityId);
      if (result.success) {
        setLastAck(result.acknowledgment);
        setAcknowledged(false);
      } else {
        toast.error(result.error ?? 'Failed to save acknowledgment.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const openMark = (task: OperationalTask) => {
    setMarkTask(task);
    setReadingValue('');
    setReadingUnit('');
    setMarkNote('');
    setPerformedById(task.assignee?.personnelId ? String(task.assignee.personnelId) : '');
    setPerformedByName('');
  };

  const submitMark = async () => {
    if (!markTask || savingMark) return;
    setSavingMark(true);
    try {
      const reading = readingValue.trim()
        ? { value: readingValue.trim(), ...(readingUnit.trim() ? { unit: readingUnit.trim() } : {}) }
        : null;
      const result = await markOperationalTaskComplete({
        facilityId,
        criteriaId: markTask.criteriaId,
        reading,
        note: markNote.trim() || null,
        performedByPersonnelId: performedById ? Number(performedById) : null,
        performedByName: performedByName.trim() || null,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`Logged: ${markTask.name}`);
      setMarkTask(null);
      await loadTasks();
      router.refresh();
    } finally {
      setSavingMark(false);
    }
  };

  const handleAssign = async (task: OperationalTask, value: string) => {
    const personnelId = value ? Number(value) : null;
    // Optimistic update
    const previous = tasks;
    const name = personnelId ? roster.find((r) => r.id === personnelId)?.name ?? null : null;
    setTasks((prev) =>
      prev.map((t) => (t.criteriaId === task.criteriaId ? { ...t, assignee: { personnelId, name } } : t))
    );
    const result = await setOperationalTaskAssignee({ facilityId, criteriaId: task.criteriaId, personnelId });
    if (!result.success) {
      toast.error(result.error);
      setTasks(previous);
    }
  };

  const toggleHistory = async (task: OperationalTask) => {
    if (historyFor === task.criteriaId) {
      setHistoryFor(null);
      return;
    }
    setHistoryFor(task.criteriaId);
    setHistoryLoading(true);
    try {
      setHistory(await getOperationalTaskHistory(facilityId, task.criteriaId));
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const to = new Date();
      const from = new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);
      const rows = await getOperationalLogExport(facilityId, from.toISOString(), to.toISOString());
      if (rows.length === 0) {
        toast('No completions logged in the last 90 days yet.', { icon: '📭' });
        return;
      }
      const header = ['Task', 'Frequency', 'Period', 'Completed At', 'Performed By', 'Recorded By', 'Reading', 'Note'];
      const esc = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`;
      const lines = [header.join(',')];
      for (const r of rows) {
        lines.push(
          [r.task, r.frequency, r.periodKey, r.completedAt, r.performedBy, r.recordedBy, r.reading, r.note]
            .map(esc)
            .join(',')
        );
      }
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `operational-log-${to.toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const grouped = items.reduce<Record<string, BlueprintRule[]>>((acc, item) => {
    const key = (item.frequency || 'unscheduled').toLowerCase();
    (acc[key] ??= []).push(item);
    return acc;
  }, {});

  // Operational Log groupings + headline metrics
  const tasksByCadence = tasks.reduce<Record<string, OperationalTask[]>>((acc, t) => {
    (acc[t.frequency] ??= []).push(t);
    return acc;
  }, {});
  const cadenceOrder = ['daily', 'weekly', 'monthly', 'quarterly'].filter((c) => tasksByCadence[c]?.length);

  const dailyTasks = tasksByCadence['daily'] ?? [];
  const dailyDone = dailyTasks.filter((t) => t.status === 'done').length;
  const overdueCount = tasks.filter((t) => t.status === 'overdue').length;
  const openTodayCount = tasks.filter((t) => t.status !== 'done').length;

  // Acknowledgment is an ANNUAL liability sign-off. It greys out once signed and
  // re-opens only when the next annual one is due.
  const ackDate = lastAck ? new Date(lastAck.created_at) : null;
  const ackNextDue = ackDate ? new Date(ackDate.getTime() + 365 * 24 * 60 * 60 * 1000) : null;
  const ackCurrent = !!(ackNextDue && Date.now() < ackNextDue.getTime());

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* ── Liability & Operations Acknowledgment ─────────────────────────── */}
      <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-900 to-indigo-700 px-5 py-4 md:px-8 md:py-5">
          <p className="text-indigo-300 text-xs font-bold uppercase tracking-widest mb-1">Facility Director</p>
          <h2 className="text-2xl font-bold text-white">Liability &amp; Operations Acknowledgment</h2>
          <p className="text-indigo-300 text-sm mt-1">
            A formal, timestamped record that the director accepts responsibility for upholding these operational
            standards. Renews <span className="font-semibold text-white">annually</span>.
          </p>
        </div>

        <div className="p-5 md:p-8">
          {ackCurrent && lastAck ? (
            // Completed for the current annual period — greyed out until the next is due.
            <div className="space-y-4">
              <div className="flex items-start gap-4 bg-emerald-50 border border-emerald-200 rounded-xl p-5">
                <span className="text-2xl mt-0.5">✅</span>
                <div>
                  <p className="font-bold text-slate-800">Acknowledged by {lastAck.user_name}</p>
                  <p className="text-sm text-slate-500 mt-0.5">{formatAckDate(lastAck.created_at)}</p>
                  <p className="text-xs text-emerald-700 mt-2 italic">
                    &ldquo;I acknowledge that maintaining these operational standards is my responsibility as the
                    facility director.&rdquo;
                  </p>
                </div>
              </div>

              {/* Greyed-out, disabled control until the next annual acknowledgment is due. */}
              <div className="flex items-center justify-between gap-4 bg-slate-50 border border-slate-200 rounded-xl p-4 opacity-70">
                <label className="flex items-start gap-3 cursor-not-allowed">
                  <input type="checkbox" checked disabled className="mt-0.5 w-4 h-4 accent-slate-400" />
                  <span className="text-sm text-slate-500">Annual acknowledgment complete</span>
                </label>
                {ackNextDue && (
                  <span className="text-xs font-medium text-slate-400 shrink-0">
                    Next due {ackNextDue.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div
                className={`border rounded-xl p-5 ${
                  lastAck ? 'bg-amber-50 border-amber-200' : 'bg-indigo-50 border-indigo-200'
                }`}
              >
                <p className={`text-sm leading-relaxed ${lastAck ? 'text-amber-900' : 'text-indigo-900'}`}>
                  {lastAck
                    ? `This year's acknowledgment is due (last signed by ${lastAck.user_name} on ${formatAckDate(
                        lastAck.created_at
                      )}). Please re-sign to keep the facility's record current.`
                    : 'Review the operational standards below, then sign this acknowledgment. Your name and timestamp will be recorded in the facility\u2019s compliance audit trail.'}
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
                  I acknowledge that maintaining these operational standards is my responsibility as the facility
                  director.
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
                {submitting ? 'Signing…' : lastAck ? 'Re-sign Acknowledgment' : 'Sign Operational Acknowledgment'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Operational Log (recurring task tracker) ──────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-800 to-teal-700 px-5 py-4 md:px-8 md:py-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-emerald-200 text-xs font-bold uppercase tracking-widest mb-1">Recurring Tasks</p>
            <h2 className="text-2xl font-bold text-white">🗓️ Operational Log</h2>
            <p className="text-emerald-100 text-sm mt-1">
              Track the day-to-day logs that are impractical to upload — temperature checks, attendance, sanitation,
              postings — and keep a defensible, timestamped record for inspectors.
            </p>
          </div>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="shrink-0 px-3 py-2 rounded-lg text-xs font-bold bg-white/15 hover:bg-white/25 text-white transition-colors disabled:opacity-50"
            title="Export the last 90 days of completions as CSV"
          >
            {exporting ? 'Exporting…' : '⬇ Export (90d)'}
          </button>
        </div>

        {/* Headline metrics */}
        {!tasksLoading && tasks.length > 0 && (
          <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-200">
            <div className="px-4 py-3 text-center">
              <p className="text-2xl font-bold text-slate-800">
                {dailyDone}
                <span className="text-base text-slate-400">/{dailyTasks.length}</span>
              </p>
              <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Daily logged today</p>
            </div>
            <div className="px-4 py-3 text-center">
              <p className={`text-2xl font-bold ${openTodayCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {openTodayCount}
              </p>
              <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Open this period</p>
            </div>
            <div className="px-4 py-3 text-center">
              <p className={`text-2xl font-bold ${overdueCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {overdueCount}
              </p>
              <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Overdue</p>
            </div>
          </div>
        )}

        {tasksLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex items-center gap-3 text-emerald-600">
              <div className="w-6 h-6 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
              <span className="font-medium text-sm">Loading tasks…</span>
            </div>
          </div>
        ) : tasks.length === 0 ? (
          <div className="py-16 text-center italic text-slate-400 text-sm">
            No recurring operational tasks apply to this facility profile.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {cadenceOrder.map((cadence) => (
              <div key={cadence}>
                <div className="bg-slate-50 px-4 py-3 md:px-8 flex items-center gap-3">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                    {CADENCE_LABEL[cadence] ?? cadence}
                  </span>
                  <span className="text-xs text-slate-400 bg-slate-200 rounded-full px-2 py-0.5 font-medium">
                    {tasksByCadence[cadence].length}
                  </span>
                </div>

                <ul className="divide-y divide-slate-100">
                  {tasksByCadence[cadence].map((task) => {
                    const meta = STATUS_META[task.status];
                    const lastReading = readingText(task.lastReading);
                    return (
                      <li key={task.criteriaId} className="px-4 py-4 md:px-8">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-slate-800">{task.name}</p>
                              {task.severity === 'critical' && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700">
                                  CRITICAL
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              Last logged {shortDate(task.lastCompletedAt)}
                              {lastReading ? ` · ${lastReading}` : ''}
                              {task.lastPerformedBy ? ` · by ${task.lastPerformedBy}` : ''}
                              {task.adherence ? ` · ${Math.round(task.adherence.rate * 100)}% (30d)` : ''}
                            </p>

                            {/* Assignee */}
                            <div className="mt-2 flex items-center gap-2">
                              <span className="text-[11px] text-slate-400">Responsible:</span>
                              <select
                                value={task.assignee?.personnelId ? String(task.assignee.personnelId) : ''}
                                onChange={(e) => handleAssign(task, e.target.value)}
                                className="text-[11px] border border-slate-200 rounded-md px-2 py-1 bg-white text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                              >
                                <option value="">— Unassigned —</option>
                                {roster.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                                {task.assignee?.name && !task.assignee.personnelId && (
                                  <option value="">{task.assignee.name}</option>
                                )}
                              </select>
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${meta.cls}`}
                              title={`${meta.label} for ${task.periodLabel}`}
                            >
                              {meta.icon} {task.status === 'done' ? `Logged ${task.periodLabel}` : `${meta.label} · ${task.periodLabel}`}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => toggleHistory(task)}
                                className="text-[11px] font-medium text-slate-500 hover:text-slate-700 underline decoration-dotted"
                              >
                                History
                              </button>
                              <button
                                onClick={() => openMark(task)}
                                className={`px-2.5 py-1.5 rounded-md text-xs font-bold shadow-sm transition-all ${
                                  task.status === 'done'
                                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                }`}
                              >
                                {task.status === 'done' ? 'Update' : '✓ Mark done'}
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* History panel */}
                        {historyFor === task.criteriaId && (
                          <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
                            {historyLoading ? (
                              <p className="text-xs text-slate-400 italic">Loading history…</p>
                            ) : history.length === 0 ? (
                              <p className="text-xs text-slate-400 italic">No completions logged yet.</p>
                            ) : (
                              <ul className="space-y-1.5">
                                {history.map((h, i) => {
                                  const r = readingText(h.reading);
                                  return (
                                    <li key={i} className="text-[11px] text-slate-600 flex flex-wrap gap-x-2">
                                      <span className="font-mono text-slate-400">{h.periodKey}</span>
                                      <span>{shortDate(h.completedAt)}</span>
                                      {h.performedBy && <span>· {h.performedBy}</span>}
                                      {r && <span className="font-semibold">· {r}</span>}
                                      {h.note && <span className="italic text-slate-500">· {h.note}</span>}
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}

        <div className="px-4 py-3 md:px-8 bg-slate-50 border-t border-slate-200">
          <p className="text-[11px] text-slate-400 leading-relaxed">
            These logs are for operational tracking and inspector-ready records — they don&apos;t affect your compliance
            score. Anything that produces an artifact (drills, inspections, receipts, policies) is handled by document
            upload in the Executive Overview so the score always reflects real, verifiable evidence.
          </p>
        </div>
      </div>

      {/* ── Full Standards Reference (collapsible) ────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <button
          onClick={() => setManualOpen((v) => !v)}
          className="w-full bg-gradient-to-r from-slate-800 to-slate-700 px-5 py-4 md:px-8 md:py-5 flex items-center justify-between text-left"
        >
          <div>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Reference Manual</p>
            <h2 className="text-2xl font-bold text-white">📖 Operational Standards</h2>
            <p className="text-slate-400 text-sm mt-1">
              Every compliance standard for this facility. Bold standards are scored; the rest are guidelines.
            </p>
          </div>
          <span className="text-white/70 text-2xl shrink-0">{manualOpen ? '▾' : '▸'}</span>
        </button>

        {manualOpen &&
          (loading ? (
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
                  <div className="bg-slate-50 px-4 py-3 md:px-8 flex items-center gap-3">
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                      {frequency.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs text-slate-400 bg-slate-200 rounded-full px-2 py-0.5 font-medium">
                      {group.length}
                    </span>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {group.map((item) => (
                      <li key={item.id} className="px-4 py-4 md:px-8 flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className={`text-sm text-slate-800 ${item.is_scored ? 'font-semibold' : 'font-normal'}`}>
                            {item.name}
                          </p>
                          <p className="text-[11px] font-mono text-slate-400 mt-0.5 truncate">{item.typeKey}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              item.severity === 'critical' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
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
          ))}
      </div>

      {/* ── Mark-done modal ───────────────────────────────────────────────── */}
      {markTask && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-700 to-teal-600 px-6 py-4 flex items-center justify-between">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-white">Log Task</h2>
                <p className="text-emerald-100 text-xs mt-0.5 truncate">
                  {markTask.name} · {markTask.periodLabel}
                </p>
              </div>
              <button
                onClick={() => setMarkTask(null)}
                className="ml-4 shrink-0 text-white/70 hover:text-white text-2xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Reading / value <span className="text-slate-400">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={readingValue}
                    onChange={(e) => setReadingValue(e.target.value)}
                    placeholder="e.g. 38, 3 min, OK"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Unit</label>
                  <input
                    type="text"
                    value={readingUnit}
                    onChange={(e) => setReadingUnit(e.target.value)}
                    placeholder="°F"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Performed by <span className="text-slate-400">(optional)</span>
                </label>
                <select
                  value={performedById}
                  onChange={(e) => {
                    setPerformedById(e.target.value);
                    if (e.target.value) setPerformedByName('');
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">— Select staff —</option>
                  {roster.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {!performedById && (
                  <input
                    type="text"
                    value={performedByName}
                    onChange={(e) => setPerformedByName(e.target.value)}
                    placeholder="…or type a name (staff without an account)"
                    className="mt-2 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Note <span className="text-slate-400">(optional)</span>
                </label>
                <textarea
                  value={markNote}
                  onChange={(e) => setMarkNote(e.target.value)}
                  rows={2}
                  placeholder="Anything notable for the record…"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setMarkTask(null)}
                  className="flex-1 px-4 py-2.5 rounded-lg text-sm font-bold bg-slate-100 hover:bg-slate-200 text-slate-700"
                >
                  Cancel
                </button>
                <button
                  onClick={submitMark}
                  disabled={savingMark}
                  className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-bold ${
                    savingMark
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                  }`}
                >
                  {savingMark ? 'Saving…' : 'Log completion'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
