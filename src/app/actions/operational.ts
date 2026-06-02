'use server';

import { createClient } from 'src/app/utils/supabase/server';
import { createAdminClient } from 'src/app/utils/supabase/admin';
import { revalidatePath } from 'next/cache';
import { ruleAppliesToFacility } from '@/lib/reg-monitor';
import { FACILITY_TOGGLE_KEYS } from '@/lib/types';
import type { ComplianceRule, Facility } from '@/lib/types';
import {
  periodKeyFor,
  currentPeriodLabel,
  recurringStatus,
  adherenceRate,
  isRecurringFrequency,
  type RecurringStatus,
} from '@/lib/recurrence';

const FREQUENCY_RANK: Record<string, number> = {
  daily: 0,
  weekly: 1,
  monthly: 2,
  quarterly: 3,
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const HISTORY_WINDOW_MS = 130 * 24 * 60 * 60 * 1000;

export interface OperationalTask {
  criteriaId: string;
  name: string;
  typeKey: string;
  frequency: string;
  severity: 'critical' | 'standard';
  isScored: boolean;
  subClassification: string | null;
  status: RecurringStatus;
  currentPeriodKey: string;
  periodLabel: string;
  lastCompletedAt: string | null;
  lastReading: Record<string, unknown> | null;
  lastNote: string | null;
  lastPerformedBy: string | null;
  assignee: { personnelId: number | null; name: string | null } | null;
  adherence: { completed: number; expected: number; rate: number } | null;
}

export interface OperationalTasksPayload {
  tasks: OperationalTask[];
  roster: Array<{ id: number; name: string }>;
}

async function ctx() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('Unauthorized: please sign in.');
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('org_id, role, full_name, account_status')
    .eq('id', session.user.id)
    .single();
  if (!profile?.org_id && profile?.role !== 'admin') {
    throw new Error('Unauthorized: no organization on profile.');
  }
  if (profile?.account_status === 'deactivated') {
    throw new Error('Access denied: this account has been deactivated.');
  }
  return {
    userId: session.user.id,
    orgId: (profile?.org_id as string) ?? null,
    role: (profile?.role as string) ?? null,
    userName: (profile?.full_name as string) ?? 'Unknown User',
    admin,
  };
}

async function loadFacility(
  admin: ReturnType<typeof createAdminClient>,
  facilityId: string,
  orgId: string | null
): Promise<Facility> {
  const query = admin
    .from('facilities')
    .select(['id', 'org_id', 'facility_type', ...FACILITY_TOGGLE_KEYS].join(', '))
    .eq('id', facilityId);
  if (orgId) query.eq('org_id', orgId);
  const { data, error } = await query.single();
  if (error || !data) throw new Error('Unauthorized: facility not found or not in your organization.');
  return data as unknown as Facility;
}

function canWrite(role: string | null): boolean {
  return role === 'owner' || role === 'admin' || role === 'director';
}

/** Lists the facility's recurring operational tasks with current-period status. */
export async function getOperationalTasks(facilityId: string): Promise<OperationalTasksPayload> {
  try {
    const { orgId, admin } = await ctx();
    const facility = await loadFacility(admin, facilityId, orgId);

    const { data: allRules } = await admin
      .from('compliance_criteria')
      .select('*')
      .eq('task_kind', 'recurring_log');

    const rules = (allRules ?? []).filter(
      (rule: Record<string, unknown>) =>
        isRecurringFrequency(String(rule.frequency ?? '')) &&
        ruleAppliesToFacility(rule as unknown as ComplianceRule, facility)
    );
    const ruleIds = rules.map((r: Record<string, unknown>) => r.id as string);

    const now = new Date();
    const sinceIso = new Date(now.getTime() - HISTORY_WINDOW_MS).toISOString();

    const [{ data: completions }, { data: assignments }, { data: roster }] = await Promise.all([
      ruleIds.length
        ? admin
            .from('operational_task_completions')
            .select('criteria_id, period_key, completed_at, reading, note, performed_by_name')
            .eq('facility_id', facilityId)
            .in('criteria_id', ruleIds)
            .gte('completed_at', sinceIso)
            .order('completed_at', { ascending: false })
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      ruleIds.length
        ? admin
            .from('operational_task_assignments')
            .select('criteria_id, assigned_personnel_id, assigned_to_name')
            .eq('facility_id', facilityId)
            .in('criteria_id', ruleIds)
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      admin
        .from('personnel')
        .select('id, name')
        .eq('facility_id', facilityId)
        .eq('status', 'active')
        .order('name', { ascending: true }),
    ]);

    // Index completions per rule (already newest-first).
    const keysByRule = new Map<string, Set<string>>();
    const latestByRule = new Map<string, Record<string, unknown>>();
    for (const c of (completions ?? []) as Record<string, unknown>[]) {
      const rid = c.criteria_id as string;
      const set = keysByRule.get(rid) ?? new Set<string>();
      set.add(c.period_key as string);
      keysByRule.set(rid, set);
      if (!latestByRule.has(rid)) latestByRule.set(rid, c);
    }

    const assignByRule = new Map<string, { personnelId: number | null; name: string | null }>();
    for (const a of (assignments ?? []) as Record<string, unknown>[]) {
      assignByRule.set(a.criteria_id as string, {
        personnelId: (a.assigned_personnel_id as number) ?? null,
        name: (a.assigned_to_name as string) ?? null,
      });
    }

    const tasks: OperationalTask[] = rules.map((rule: Record<string, unknown>) => {
      const id = rule.id as string;
      const frequency = String(rule.frequency ?? '');
      const keys = keysByRule.get(id) ?? new Set<string>();
      const latest = latestByRule.get(id);
      return {
        criteriaId: id,
        name: (rule.requirement_name as string) ?? '',
        typeKey: (rule.required_document_type as string) ?? '',
        frequency,
        severity: (rule.severity as 'critical' | 'standard') ?? 'standard',
        isScored: rule.is_scored === true,
        subClassification: (rule.sub_classification as string) ?? null,
        status: recurringStatus(frequency, keys, now),
        currentPeriodKey: periodKeyFor(frequency, now),
        periodLabel: currentPeriodLabel(frequency, now),
        lastCompletedAt: latest ? (latest.completed_at as string) : null,
        lastReading: latest ? ((latest.reading as Record<string, unknown>) ?? null) : null,
        lastNote: latest ? ((latest.note as string) ?? null) : null,
        lastPerformedBy: latest ? ((latest.performed_by_name as string) ?? null) : null,
        assignee: assignByRule.get(id) ?? null,
        adherence: adherenceRate(frequency, keys, new Date(now.getTime() - THIRTY_DAYS_MS), now),
      };
    });

    tasks.sort((a, b) => {
      const ra = FREQUENCY_RANK[a.frequency] ?? 9;
      const rb = FREQUENCY_RANK[b.frequency] ?? 9;
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name);
    });

    const rosterList = ((roster ?? []) as Array<{ id: number; name: string }>).map((p) => ({
      id: p.id,
      name: p.name,
    }));

    return { tasks, roster: rosterList };
  } catch (error) {
    console.error('❌ getOperationalTasks failure:', error);
    return { tasks: [], roster: [] };
  }
}

/** Marks a recurring task complete for its current period (idempotent per period). */
export async function markOperationalTaskComplete(params: {
  facilityId: string;
  criteriaId: string;
  reading?: Record<string, unknown> | null;
  note?: string | null;
  performedByPersonnelId?: number | null;
  performedByName?: string | null;
}): Promise<{ success: true; status: RecurringStatus; completedAt: string } | { success: false; error: string }> {
  try {
    const { userId, orgId, role, userName, admin } = await ctx();
    if (!canWrite(role)) {
      return { success: false, error: 'Only owners, administrators, or directors may log tasks.' };
    }
    await loadFacility(admin, params.facilityId, orgId);

    const { data: rule } = await admin
      .from('compliance_criteria')
      .select('id, frequency, task_kind, requirement_name')
      .eq('id', params.criteriaId)
      .single();
    if (!rule || rule.task_kind !== 'recurring_log') {
      return { success: false, error: 'That requirement is not a trackable recurring task.' };
    }

    const frequency = String(rule.frequency ?? '');
    const now = new Date();
    const periodKey = periodKeyFor(frequency, now);
    const completedAt = now.toISOString();

    // Resolve the performer's name (snapshot) from the roster when an id is given.
    let performedByName = params.performedByName ?? null;
    if (params.performedByPersonnelId && !performedByName) {
      const { data: person } = await admin
        .from('personnel')
        .select('name')
        .eq('id', params.performedByPersonnelId)
        .eq('facility_id', params.facilityId)
        .maybeSingle();
      performedByName = (person?.name as string) ?? null;
    }

    const { error } = await admin.from('operational_task_completions').upsert(
      {
        facility_id: params.facilityId,
        criteria_id: params.criteriaId,
        period_key: periodKey,
        frequency,
        completed_at: completedAt,
        completed_by: userId,
        completed_by_name: userName,
        performed_by_personnel_id: params.performedByPersonnelId ?? null,
        performed_by_name: performedByName,
        reading: params.reading ?? null,
        note: params.note ?? null,
      },
      { onConflict: 'facility_id,criteria_id,period_key' }
    );
    if (error) return { success: false, error: 'Could not record the completion.' };

    // Best-effort audit trail.
    try {
      await admin.from('audit_logs').insert({
        facility_id: params.facilityId,
        user_id: userId,
        action_type: 'operational_task_completed',
        metadata: {
          criteria_id: params.criteriaId,
          requirement_name: rule.requirement_name,
          frequency,
          period_key: periodKey,
          performed_by: performedByName,
          has_reading: params.reading != null,
        },
      });
    } catch {
      /* ignore audit failure */
    }

    revalidatePath('/dashboard');
    return { success: true, status: 'done', completedAt };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error.' };
  }
}

/** Sets (or clears) the standing assignee for a recurring task. */
export async function setOperationalTaskAssignee(params: {
  facilityId: string;
  criteriaId: string;
  personnelId?: number | null;
  name?: string | null;
}): Promise<{ success: true; assignee: { personnelId: number | null; name: string | null } } | { success: false; error: string }> {
  try {
    const { userId, orgId, role, admin } = await ctx();
    if (!canWrite(role)) {
      return { success: false, error: 'Only owners, administrators, or directors may assign tasks.' };
    }
    await loadFacility(admin, params.facilityId, orgId);

    let name = params.name ?? null;
    if (params.personnelId && !name) {
      const { data: person } = await admin
        .from('personnel')
        .select('name')
        .eq('id', params.personnelId)
        .eq('facility_id', params.facilityId)
        .maybeSingle();
      name = (person?.name as string) ?? null;
    }

    const { error } = await admin.from('operational_task_assignments').upsert(
      {
        facility_id: params.facilityId,
        criteria_id: params.criteriaId,
        assigned_personnel_id: params.personnelId ?? null,
        assigned_to_name: name,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'facility_id,criteria_id' }
    );
    if (error) return { success: false, error: 'Could not save the assignment.' };

    return { success: true, assignee: { personnelId: params.personnelId ?? null, name } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error.' };
  }
}

export interface CompletionHistoryRow {
  periodKey: string;
  completedAt: string;
  recordedBy: string | null;
  performedBy: string | null;
  reading: Record<string, unknown> | null;
  note: string | null;
}

/** Recent completion history for one recurring task. */
export async function getOperationalTaskHistory(
  facilityId: string,
  criteriaId: string,
  limit = 60
): Promise<CompletionHistoryRow[]> {
  try {
    const { orgId, admin } = await ctx();
    await loadFacility(admin, facilityId, orgId);
    const { data } = await admin
      .from('operational_task_completions')
      .select('period_key, completed_at, completed_by_name, performed_by_name, reading, note')
      .eq('facility_id', facilityId)
      .eq('criteria_id', criteriaId)
      .order('completed_at', { ascending: false })
      .limit(limit);
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      periodKey: r.period_key as string,
      completedAt: r.completed_at as string,
      recordedBy: (r.completed_by_name as string) ?? null,
      performedBy: (r.performed_by_name as string) ?? null,
      reading: (r.reading as Record<string, unknown>) ?? null,
      note: (r.note as string) ?? null,
    }));
  } catch {
    return [];
  }
}

export interface OperationalExportRow {
  task: string;
  frequency: string;
  periodKey: string;
  completedAt: string;
  performedBy: string;
  recordedBy: string;
  reading: string;
  note: string;
}

/** Flat completion rows for an inspector-ready export over a date range. */
export async function getOperationalLogExport(
  facilityId: string,
  fromIso: string,
  toIso: string
): Promise<OperationalExportRow[]> {
  try {
    const { orgId, admin } = await ctx();
    await loadFacility(admin, facilityId, orgId);

    const { data: rows } = await admin
      .from('operational_task_completions')
      .select('criteria_id, frequency, period_key, completed_at, completed_by_name, performed_by_name, reading, note')
      .eq('facility_id', facilityId)
      .gte('completed_at', fromIso)
      .lte('completed_at', toIso)
      .order('completed_at', { ascending: false })
      .limit(5000);

    const ids = [...new Set(((rows ?? []) as Record<string, unknown>[]).map((r) => r.criteria_id as string))];
    const nameById = new Map<string, string>();
    if (ids.length) {
      const { data: crit } = await admin
        .from('compliance_criteria')
        .select('id, requirement_name')
        .in('id', ids);
      for (const c of (crit ?? []) as Record<string, unknown>[]) {
        nameById.set(c.id as string, (c.requirement_name as string) ?? '');
      }
    }

    const readingToText = (reading: Record<string, unknown> | null): string => {
      if (!reading) return '';
      if (typeof reading.value !== 'undefined') {
        return `${reading.value}${reading.unit ? ` ${reading.unit}` : ''}`;
      }
      return JSON.stringify(reading);
    };

    return ((rows ?? []) as Record<string, unknown>[]).map((r) => ({
      task: nameById.get(r.criteria_id as string) ?? '',
      frequency: (r.frequency as string) ?? '',
      periodKey: (r.period_key as string) ?? '',
      completedAt: (r.completed_at as string) ?? '',
      performedBy: (r.performed_by_name as string) ?? '',
      recordedBy: (r.completed_by_name as string) ?? '',
      reading: readingToText((r.reading as Record<string, unknown>) ?? null),
      note: (r.note as string) ?? '',
    }));
  } catch {
    return [];
  }
}
