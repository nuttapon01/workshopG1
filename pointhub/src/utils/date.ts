/**
 * Shared date utilities for PointHub.
 * All date handling uses Bangkok timezone (Asia/Bangkok).
 *
 * Key issue: PostgreSQL DATE columns are returned as JS Date objects set to
 * midnight UTC. When formatted with .toISOString() in UTC+7, the date shifts
 * one day earlier. These helpers avoid that pitfall.
 */

/**
 * Format a PostgreSQL DATE value (Date object or string) as "YYYY-MM-DD"
 * without any timezone shift.
 *
 * If the input is a JS Date, we extract year/month/day in UTC (which is how
 * pg returns DATE columns — midnight UTC). If it's already a string, we take
 * the first 10 characters.
 */
export function formatPgDate(value: Date | string): string {
  if (typeof value === 'string') {
    return value.substring(0, 10);
  }
  // pg returns DATE as Date at midnight UTC — use UTC getters to avoid shift
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get the current Bangkok month as a date string (first day of month).
 * e.g. "2026-08-01"
 */
export function getCurrentBangkokMonth(): string {
  const now = new Date();
  const bangkokDate = new Date(
    now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })
  );
  const year = bangkokDate.getFullYear();
  const month = String(bangkokDate.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}
