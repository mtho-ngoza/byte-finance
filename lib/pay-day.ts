import type { UserProfile } from '@/types';

// Fixed SA public holidays as MM-DD strings
const SA_FIXED_HOLIDAYS: string[] = [
  '01-01', // New Year's Day
  '03-21', // Human Rights Day
  '04-27', // Freedom Day
  '05-01', // Workers' Day
  '06-16', // Youth Day
  '08-09', // National Women's Day
  '09-24', // Heritage Day
  '12-16', // Day of Reconciliation
  '12-25', // Christmas Day
  '12-26', // Day of Goodwill
];

/**
 * Computes Easter Sunday for a given year using the Anonymous Gregorian
 * algorithm (Butcher's algorithm).
 */
export function computeEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 1-based
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Returns true if the given date is a South African public holiday.
 * Covers all fixed statutory holidays plus Good Friday and Easter Monday.
 */
export function isPublicHoliday(date: Date): boolean {
  const mmdd = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  if (SA_FIXED_HOLIDAYS.includes(mmdd)) return true;

  const year = date.getFullYear();
  const easter = computeEaster(year);

  const goodFriday = new Date(easter);
  goodFriday.setDate(easter.getDate() - 2);

  const easterMonday = new Date(easter);
  easterMonday.setDate(easter.getDate() + 1);

  return isSameDay(date, goodFriday) || isSameDay(date, easterMonday);
}

/**
 * Returns the pay day Date for the given year and month based on user preferences.
 *
 * - 'fixed': returns the configured day-of-month
 * - 'last_working_day': walks backwards from the last calendar day until a
 *   weekday that is not a SA public holiday is found
 */
export function getPayDay(
  year: number,
  month: number,
  prefs: UserProfile['preferences']
): Date {
  if (prefs.payDayType === 'fixed') {
    return new Date(year, month - 1, prefs.payDayFixed!);
  }

  // Last working day: start from last calendar day of month (day 0 of next month)
  const candidate = new Date(year, month, 0);
  while (
    candidate.getDay() === 0 || // Sunday
    candidate.getDay() === 6 || // Saturday
    isPublicHoliday(candidate)
  ) {
    candidate.setDate(candidate.getDate() - 1);
  }
  return candidate;
}

/**
 * Returns the pay cycle boundaries for the given year and month.
 *
 * - start: previous month's pay day (inclusive)
 * - end:   day before current month's pay day (inclusive)
 * - payDay: current month's pay day
 */
export function getPayCycleBoundaries(
  year: number,
  month: number,
  prefs: UserProfile['preferences']
): { start: Date; end: Date; payDay: Date } {
  const currentPayDay = getPayDay(year, month, prefs);

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevPayDay = getPayDay(prevYear, prevMonth, prefs);

  const cycleEnd = new Date(currentPayDay);
  cycleEnd.setDate(cycleEnd.getDate() - 1);

  return { start: prevPayDay, end: cycleEnd, payDay: currentPayDay };
}
