/**
 * Recurrence engine for operational tasks.
 *
 * A recurring task is "done once per period". We encode each period as a stable
 * `period_key` (e.g. 2026-06-02 daily, 2026-W23 weekly, 2026-06 monthly,
 * 2026-Q2 quarterly) so completions are idempotent and history is queryable.
 *
 * Status model (intentionally humane so 100% stays achievable):
 *   • done    – the CURRENT period has a completion
 *   • due     – current period not done yet, but still within grace
 *               (the last closed period was done, OR it predates launch / is the
 *               facility's first period). Counts as SATISFIED for scoring.
 *   • overdue – the last closed period was missed AND the current isn't done.
 *               Only this state is a scored gap.
 *
 * Only the current + last-closed periods drive status, and periods that closed
 * before LAUNCH are never penalized — so turning this feature on cannot dump a
 * backlog of overdue tasks on anyone (no day-one score cliff).
 */

export type RecurringStatus = 'done' | 'due' | 'overdue';

/** Clean-slate date: periods closing before this are not held against a facility. */
const LAUNCH = new Date('2026-06-02T00:00:00Z');

function startOfUTCDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** ISO-8601 week-numbering year + week for a date. */
function isoWeek(input: Date): { year: number; week: number } {
  const d = startOfUTCDay(input);
  const dayNum = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // Thursday of this ISO week
  const isoYear = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return { year: isoYear, week };
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Stable key for the period containing `date` at the given frequency. */
export function periodKeyFor(frequency: string, date: Date): string {
  const y = date.getUTCFullYear();
  switch (frequency) {
    case 'daily':
      return `${y}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
    case 'weekly': {
      const { year, week } = isoWeek(date);
      return `${year}-W${pad2(week)}`;
    }
    case 'monthly':
      return `${y}-${pad2(date.getUTCMonth() + 1)}`;
    case 'quarterly':
      return `${y}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
    case 'annual':
      return `${y}`;
    default:
      return `${y}`;
  }
}

/** Shift a date back by `n` periods of the given frequency. */
function shiftBack(frequency: string, date: Date, n: number): Date {
  const d = new Date(date.getTime());
  switch (frequency) {
    case 'daily':
      d.setUTCDate(d.getUTCDate() - n);
      break;
    case 'weekly':
      d.setUTCDate(d.getUTCDate() - 7 * n);
      break;
    case 'monthly':
      d.setUTCMonth(d.getUTCMonth() - n);
      break;
    case 'quarterly':
      d.setUTCMonth(d.getUTCMonth() - 3 * n);
      break;
    default:
      d.setUTCFullYear(d.getUTCFullYear() - n);
      break;
  }
  return d;
}

/** First instant of the period containing `date`. */
export function periodStart(frequency: string, date: Date): Date {
  switch (frequency) {
    case 'daily':
      return startOfUTCDay(date);
    case 'weekly': {
      const d = startOfUTCDay(date);
      const dayNum = (d.getUTCDay() + 6) % 7;
      d.setUTCDate(d.getUTCDate() - dayNum);
      return d;
    }
    case 'monthly':
      return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    case 'quarterly':
      return new Date(Date.UTC(date.getUTCFullYear(), Math.floor(date.getUTCMonth() / 3) * 3, 1));
    default:
      return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  }
}

/** True for the recurrence frequencies the Operational Log tracks. */
export function isRecurringFrequency(frequency: string): boolean {
  return ['daily', 'weekly', 'monthly', 'quarterly'].includes(frequency);
}

/**
 * Resolves the current status for a recurring task given the set of period_keys
 * it has been completed for. See the module docstring for the grace rules.
 */
export function recurringStatus(
  frequency: string,
  completedKeys: Set<string>,
  now: Date = new Date()
): RecurringStatus {
  const currentKey = periodKeyFor(frequency, now);
  if (completedKeys.has(currentKey)) return 'done';

  const prevDate = shiftBack(frequency, now, 1);
  const prevKey = periodKeyFor(frequency, prevDate);
  if (completedKeys.has(prevKey)) return 'due';

  // Clean slate: never penalize for a period that closed before launch.
  if (periodStart(frequency, prevDate) < LAUNCH) return 'due';

  return 'overdue';
}

/** Human label for the current period, e.g. "today", "this week", "June 2026", "Q2 2026". */
export function currentPeriodLabel(frequency: string, now: Date = new Date()): string {
  switch (frequency) {
    case 'daily':
      return 'today';
    case 'weekly':
      return 'this week';
    case 'monthly':
      return now.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    case 'quarterly':
      return `Q${Math.floor(now.getUTCMonth() / 3) + 1} ${now.getUTCFullYear()}`;
    default:
      return 'this period';
  }
}

/** The period keys expected to exist between two dates (inclusive), for adherence rates. */
export function expectedPeriodKeys(frequency: string, from: Date, to: Date): string[] {
  if (!isRecurringFrequency(frequency)) return [];
  const keys: string[] = [];
  const seen = new Set<string>();
  // Walk backward from `to` until before `from`, capped to avoid runaways.
  let cursor = new Date(to.getTime());
  for (let i = 0; i < 400; i++) {
    if (periodStart(frequency, cursor).getTime() < periodStart(frequency, from).getTime()) break;
    const key = periodKeyFor(frequency, cursor);
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
    cursor = shiftBack(frequency, cursor, 1);
  }
  return keys;
}

/**
 * Adherence over a trailing window: fraction of expected periods that were
 * completed. Returns null when there are no expected periods (e.g. a quarterly
 * task inside a 30-day window with no closed period yet).
 */
export function adherenceRate(
  frequency: string,
  completedKeys: Set<string>,
  from: Date,
  to: Date = new Date()
): { completed: number; expected: number; rate: number } | null {
  const expected = expectedPeriodKeys(frequency, from, to);
  if (expected.length === 0) return null;
  const completed = expected.filter((k) => completedKeys.has(k)).length;
  return { completed, expected: expected.length, rate: completed / expected.length };
}
