/**
 * Shared date utilities for PointHub.
 * All date handling uses Bangkok timezone (Asia/Bangkok).
 *
 * Key issue: node-postgres (pg) returns DATE columns as JS Date objects set to
 * LOCAL midnight (e.g. "Sat Sep 12 2026 00:00:00 GMT+0700"). Using UTC getters
 * or .toISOString() rolls the date back one day in UTC+7. Local getters return
 * the correct calendar date.
 *
 * Preferred approach: cast to text in SQL (date::text) so no Date object is
 * constructed. formatPgDate() exists as a safety net when that isn't practical.
 */

/**
 * Format a PostgreSQL DATE value (Date object or string) as "YYYY-MM-DD"
 * without any timezone shift.
 *
 * If the input is a JS Date, we extract year/month/day using LOCAL getters
 * (getFullYear, getMonth, getDate) because node-postgres constructs DATE
 * values at local midnight — NOT UTC midnight.
 *
 * If it's already a string, we take the first 10 characters.
 */
export function formatPgDate(value: Date | string): string {
  if (typeof value === 'string') {
    return value.substring(0, 10);
  }
  // pg returns DATE as Date at LOCAL midnight — use local getters
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get the current Bangkok month as a date string (first day of month).
 * e.g. "2026-08-01"
 */
export function getCurrentBangkokMonth(): string {
  const now = new Date();
  const bangkokDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const year = bangkokDate.getFullYear();
  const month = String(bangkokDate.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}
