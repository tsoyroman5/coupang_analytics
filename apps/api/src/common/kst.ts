/**
 * Calendar-date helpers for Korea Standard Time (UTC+9, no daylight saving).
 *
 * Dates are plain `yyyy-mm-dd` strings, never `Date` objects, so they can't drift
 * across time zones. Strings in this format also compare correctly with `<` / `>`.
 */

const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 3_600_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** An inclusive range of calendar days. */
export interface DateWindow {
  /** First day, `yyyy-mm-dd` (inclusive). */
  from: string;
  /** Last day, `yyyy-mm-dd` (inclusive). */
  to: string;
}

/**
 * Returns the KST calendar date of an instant.
 * @example kstDate(new Date('2026-11-07T16:00:00Z')) // '2026-11-08'
 */
export function kstDate(instant: Date = new Date()): string {
  return new Date(instant.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** True for a real calendar date in `yyyy-mm-dd` form (rejects `2026-02-30`). */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed) && new Date(parsed).toISOString().startsWith(value);
}

/** Adds (or subtracts, if negative) whole days to a `yyyy-mm-dd` date. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Number of days in an inclusive window; `1` when `from === to`. */
export function daysInclusive(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1;
}

/**
 * Splits an inclusive window into consecutive chunks of at most `maxDays` days.
 * Used because every Coupang list endpoint caps the query range (7–31 days).
 *
 * @example splitWindow('2026-01-01', '2026-03-06', 31)
 * // [{2026-01-01..2026-01-31}, {2026-02-01..2026-03-03}, {2026-03-04..2026-03-06}]
 * @throws Error on invalid dates, `from > to`, or `maxDays < 1`
 */
export function splitWindow(from: string, to: string, maxDays: number): DateWindow[] {
  if (!isIsoDate(from) || !isIsoDate(to)) throw new Error(`Invalid date window ${from}..${to}`);
  if (from > to) throw new Error(`Window start ${from} is after end ${to}`);
  if (!Number.isInteger(maxDays) || maxDays < 1) throw new Error(`maxDays must be a positive integer, got ${maxDays}`);

  const windows: DateWindow[] = [];
  for (let start = from; start <= to; ) {
    const candidateEnd = addDays(start, maxDays - 1);
    const end = candidateEnd < to ? candidateEnd : to;
    windows.push({ from: start, to: end });
    start = addDays(end, 1);
  }
  return windows;
}
