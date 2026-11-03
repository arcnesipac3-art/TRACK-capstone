/**
 * TRACK — one place that turns API numbers and dates into text.
 *
 * Twelve screens each carried their own peso or date formatter, so the same
 * amount printed as `₱5,000`, `5000.00 PHP` and `5,000` three rows apart, and a
 * due date shifted between `6/30/26` and `Jun 30, 2026` depending on which
 * screen showed it. These are the house rules: peso amounts grouped by
 * thousands, centavos only where a balance is itemised, and dates spelled so a
 * parent reading them never has to guess the order. A date the server never
 * sent prints as `—` rather than silently becoming today.
 */

const DATE_OPTS: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
const MONTH_DAY_OPTS: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
const TIME_OPTS: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };

/** What the API sends for a date column: an ISO string, or nothing at all. */
export type DateValue = string | Date | null | undefined;

/**
 * A date-only value from the API (`2026-06-30`) read as a local calendar day.
 * Suffixing midnight keeps it from sliding a day earlier in negative timezones,
 * which is what `new Date('2026-06-30')` does when it parses as UTC.
 */
function toDate(value: DateValue): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T00:00:00` : trimmed;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Shown wherever a date the server never sent would otherwise print as today. */
const NO_DATE = '—';

/** `₱5,000` — for totals and lists where centavos are noise. */
export function formatPeso(amount: number | string): string {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(value)) return '₱0';
  return `₱${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/** `₱5,000.00` — for the itemised balances a bursar reconciles. */
export function formatPesoExact(amount: number | string): string {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(value)) return '₱0.00';
  return `₱${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** `1 child` / `3 children` — counts spelled out instead of `child(ren)`. */
export function countNoun(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** `Jun 30, 2026` */
export function formatDate(value: DateValue): string {
  const d = toDate(value);
  return d === null ? NO_DATE : d.toLocaleDateString(undefined, DATE_OPTS);
}

/** `Jun 30` — for lists that already sit under a dated header. */
export function formatMonthDay(value: DateValue): string {
  const d = toDate(value);
  return d === null ? NO_DATE : d.toLocaleDateString(undefined, MONTH_DAY_OPTS);
}

/** `Mon, Jun 30, 2026` — attendance days, where the weekday is the point. */
export function formatDateWithWeekday(value: DateValue): string {
  const d = toDate(value);
  return d === null ? NO_DATE : d.toLocaleDateString(undefined, { ...DATE_OPTS, weekday: 'short' });
}

/** `9:14 AM` — the time under a message, or after a date. */
export function formatClock(value: DateValue): string {
  const d = toDate(value);
  return d === null ? NO_DATE : d.toLocaleTimeString(undefined, TIME_OPTS);
}

/** `Jun 30, 9:14 AM` — audit and activity stamps. */
export function formatDateTime(value: DateValue): string {
  const d = toDate(value);
  return d === null
    ? NO_DATE
    : `${d.toLocaleDateString(undefined, MONTH_DAY_OPTS)}, ${d.toLocaleTimeString(undefined, TIME_OPTS)}`;
}

/** `Jun 30, 2026, 9:14 AM` — a history list that can span school years. */
export function formatDateTimeFull(value: DateValue): string {
  const d = toDate(value);
  return d === null ? NO_DATE : `${formatDate(d)}, ${d.toLocaleTimeString(undefined, TIME_OPTS)}`;
}

/**
 * `Just now` / `14m ago` / `3h ago` / `2d ago`, then the plain date past a week —
 * how recent enough to matter reads on a notification or an audit line.
 */
export function formatRelativeTime(value: DateValue): string {
  const d = toDate(value);
  if (d === null) return NO_DATE;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 6e4);
  const hours = Math.floor(diff / 36e5);
  const days = Math.floor(diff / 864e5);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return formatDate(d);
}

/**
 * `Today` / `Yesterday` / `4 days ago`, then the plain date past a week.
 * Deliberately day-granular where `formatRelativeTime` is minute-granular:
 * someone scanning when a requirement was submitted cares which day, not how
 * many minutes ago, and a future-dated row prints as `Today` rather than as a
 * negative count.
 */
export function formatRelativeDay(value: DateValue): string {
  const d = toDate(value);
  if (d === null) return NO_DATE;
  const days = Math.floor((Date.now() - d.getTime()) / 864e5);
  if (days < 1) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return formatDate(d);
}
