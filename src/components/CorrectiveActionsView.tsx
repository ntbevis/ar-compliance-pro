'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  getCorrectiveActions,
  createCorrectiveAction,
  updateCorrectiveActionStatus,
  type CorrectiveAction,
  type CorrectiveActionStatus,
} from 'src/app/actions/compliance';

interface CorrectiveActionsViewProps {
  facilityId: string;
}

const STATUS_META: Record<CorrectiveActionStatus, { label: string; cls: string }> = {
  open: { label: 'Open', cls: 'bg-rose-100 text-rose-700 border-rose-200' },
  in_progress: { label: 'In Progress', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  resolved: { label: 'Resolved', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function ActionCard({
  action,
  nowMs,
  onAdvance,
}: {
  action: CorrectiveAction;
  nowMs: number;
  onAdvance: (id: string, status: CorrectiveActionStatus) => void;
}) {
  const overdue =
    action.status !== 'resolved' &&
    action.due_date != null &&
    new Date(action.due_date).getTime() < nowMs;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-[200px] flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-bold text-slate-900 text-sm">{action.title}</h4>
            {action.severity === 'critical' && (
              <span className="text-[10px] font-black uppercase tracking-wider text-rose-600">Critical</span>
            )}
          </div>
          {action.related_requirement && (
            <p className="text-xs text-slate-500 mt-0.5">Addresses: {action.related_requirement}</p>
          )}
          {action.description && <p className="text-sm text-slate-600 mt-2">{action.description}</p>}
          <div className="flex items-center gap-4 mt-3 text-xs text-slate-500 flex-wrap">
            {action.assigned_to && <span>👤 {action.assigned_to}</span>}
            <span className={overdue ? 'text-rose-600 font-bold' : ''}>
              📅 Due {fmtDate(action.due_date)}{overdue ? ' (overdue)' : ''}
            </span>
          </div>
          {action.status === 'resolved' && action.resolution_note && (
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-2 mt-3">
              Resolution: {action.resolution_note}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold border ${STATUS_META[action.status].cls}`}>
            {STATUS_META[action.status].label}
          </span>
          {action.status === 'open' && (
            <button
              onClick={() => onAdvance(action.id, 'in_progress')}
              className="text-xs font-bold px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
            >
              Start →
            </button>
          )}
          {action.status === 'in_progress' && (
            <button
              onClick={() => onAdvance(action.id, 'resolved')}
              className="text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
            >
              Mark Resolved ✓
            </button>
          )}
          {action.status === 'resolved' && (
            <button
              onClick={() => onAdvance(action.id, 'open')}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg text-slate-500 border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              Reopen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const EMPTY_FORM = {
  title: '',
  description: '',
  related_requirement: '',
  severity: 'standard' as 'critical' | 'standard',
  assigned_to: '',
  due_date: '',
};

export default function CorrectiveActionsView({ facilityId }: CorrectiveActionsViewProps) {
  const [actions, setActions] = useState<CorrectiveAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  // Capture "now" once so the render stays pure (no Date.now() during render).
  const [nowMs] = useState(() => Date.now());

  const load = async () => {
    const data = await getCorrectiveActions(facilityId);
    setActions(data);
    setLoading(false);
  };

  useEffect(() => {
    // Re-fetch when the facility changes (external data sync).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilityId]);

  const handleCreate = async () => {
    if (!form.title.trim()) {
      toast.error('Please enter a title.');
      return;
    }
    setSaving(true);
    const res = await createCorrectiveAction({
      facilityId,
      title: form.title,
      description: form.description,
      relatedRequirement: form.related_requirement,
      severity: form.severity,
      assignedTo: form.assigned_to,
      dueDate: form.due_date || null,
    });
    setSaving(false);
    if (res.success) {
      toast.success('Action plan created.');
      setForm(EMPTY_FORM);
      setShowForm(false);
      void load();
    } else {
      toast.error(res.error ?? 'Failed to create action plan.');
    }
  };

  const handleAdvance = async (id: string, status: CorrectiveActionStatus) => {
    let note: string | null = null;
    if (status === 'resolved') {
      note = window.prompt('Optional: how was this resolved?') ?? null;
    }
    const res = await updateCorrectiveActionStatus(id, status, note);
    if (res.success) {
      toast.success('Action plan updated.');
      void load();
    } else {
      toast.error(res.error ?? 'Failed to update.');
    }
  };

  const open = actions.filter((a) => a.status === 'open');
  const inProgress = actions.filter((a) => a.status === 'in_progress');
  const resolved = actions.filter((a) => a.status === 'resolved');

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="text-sm text-slate-600 max-w-2xl">
          Track remediation for compliance gaps and survey findings. Open a plan, assign an owner and
          due date, and mark it resolved when the corrective action is complete — every change is logged
          to your audit trail.
        </p>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="shrink-0 px-4 py-2.5 rounded-xl font-bold text-sm bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          {showForm ? 'Cancel' : '+ New Action Plan'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Title *</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Renew Center Director CPR certification"
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              placeholder="What needs to happen to close this gap?"
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Related requirement</label>
              <input
                value={form.related_requirement}
                onChange={(e) => setForm({ ...form, related_requirement: e.target.value })}
                placeholder="e.g. CPR / First Aid Certification"
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Assigned to</label>
              <input
                value={form.assigned_to}
                onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
                placeholder="Owner name"
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Severity</label>
              <select
                value={form.severity}
                onChange={(e) => setForm({ ...form, severity: e.target.value as 'critical' | 'standard' })}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="standard">Standard</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Due date</label>
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleCreate}
              disabled={saving}
              className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-colors ${
                saving ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {saving ? 'Saving…' : 'Create Action Plan'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400 text-sm animate-pulse">
          Loading action plans…
        </div>
      ) : actions.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-200 p-12 text-center">
          <p className="text-2xl mb-2">📋</p>
          <p className="text-slate-600 font-semibold">No action plans yet.</p>
          <p className="text-slate-400 text-sm mt-1">
            Create one to track remediation of a compliance gap or survey finding.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {[
            { label: 'Open', list: open },
            { label: 'In Progress', list: inProgress },
            { label: 'Resolved', list: resolved },
          ]
            .filter((g) => g.list.length > 0)
            .map((group) => (
              <section key={group.label} className="space-y-3">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">
                  {group.label} ({group.list.length})
                </h3>
                {group.list.map((a) => (
                  <ActionCard key={a.id} action={a} nowMs={nowMs} onAdvance={handleAdvance} />
                ))}
              </section>
            ))}
        </div>
      )}
    </div>
  );
}
