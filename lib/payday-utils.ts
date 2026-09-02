/**
 * South African Public Holidays (fixed dates)
 * Note: Some holidays move if they fall on Sunday (observed Monday)
 */
const SA_PUBLIC_HOLIDAYS: Array<{ month: number; day: number; name: string }> = [
  { month: 1, day: 1, name: "New Year's Day" },
  { month: 3, day: 21, name: 'Human Rights Day' },
  { month: 4, day: 27, name: 'Freedom Day' },
  { month: 5, day: 1, name: "Workers' Day" },
  { month: 6, day: 16, name: 'Youth Day' },
  { month: 8, day: 9, name: "National Women's Day" },
  { month: 9, day: 24, name: 'Heritage Day' },
  { month: 12, day: 16, name: 'Day of Reconciliation' },
  { month: 12, day: 25, name: 'Christmas Day' },
  { month: 12, day: 26, name: 'Day of Goodwill' },
];

/**
 * Get Easter-based holidays for a year (Good Friday, Family Day)
 */
function getEasterHolidays(year: number): Date[] {
  // Calculate Easter Sunday using Anonymous Gregorian algorithm
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
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  const easterSunday = new Date(year, month - 1, day);

  // Good Friday = 2 days before Easter
  const goodFriday = new Date(easterSunday);
  goodFriday.setDate(goodFriday.getDate() - 2);

  // Family Day = day after Easter (Easter Monday)
  const familyDay = new Date(easterSunday);
  familyDay.setDate(familyDay.getDate() + 1);

  return [goodFriday, familyDay];
}

/**
 * Check if a date is a SA public holiday
 */
export function isPublicHoliday(date: Date): boolean {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const dayOfWeek = date.getDay(); // 0 = Sunday

  // Check fixed holidays
  for (const holiday of SA_PUBLIC_HOLIDAYS) {
    if (holiday.month === month && holiday.day === day) {
      return true;
    }
    // If holiday falls on Sunday, Monday is observed
    if (dayOfWeek === 1) {
      // Monday
      const sunday = new Date(date);
      sunday.setDate(sunday.getDate() - 1);
      if (sunday.getMonth() + 1 === holiday.month && sunday.getDate() === holiday.day) {
        return true; // Observed holiday
      }
    }
  }

  // Check Easter-based holidays
  const easterHolidays = getEasterHolidays(year);
  for (const holiday of easterHolidays) {
    if (
      holiday.getMonth() === date.getMonth() &&
      holiday.getDate() === date.getDate()
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a date is a working day (not weekend, not public holiday)
 */
export function isWorkingDay(date: Date): boolean {
  const dayOfWeek = date.getDay();
  // Weekend
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }
  // Public holiday
  if (isPublicHoliday(date)) {
    return false;
  }
  return true;
}

/**
 * Get the last working day of a month
 */
export function getLastWorkingDayOfMonth(year: number, month: number): Date {
  // Start from the last day of the month
  const lastDay = new Date(year, month, 0); // Day 0 of next month = last day of this month

  // Work backwards until we find a working day
  while (!isWorkingDay(lastDay)) {
    lastDay.setDate(lastDay.getDate() - 1);
  }

  return lastDay;
}

/**
 * Get payday for a specific month based on user preferences
 */
export function getPaydayForMonth(
  year: number,
  month: number, // 1-12
  payDayType: 'last_working_day' | 'fixed' = 'last_working_day',
  payDayFixed?: number
): Date {
  if (payDayType === 'fixed' && payDayFixed) {
    // Fixed day of month
    const date = new Date(year, month - 1, payDayFixed);
    // If it falls on weekend/holiday, move to previous working day
    while (!isWorkingDay(date)) {
      date.setDate(date.getDate() - 1);
    }
    return date;
  }

  // Last working day of the month
  return getLastWorkingDayOfMonth(year, month);
}

/**
 * Calculate cycle date range based on payday
 *
 * For "October Budget":
 * - Start: Payday of September (when you get paid)
 * - End: Day before payday of October (last day before next paycheck)
 *
 * Cycle starts ON the payday when you receive money.
 */
export function getCycleDateRange(
  cycleYear: number,
  cycleMonth: number, // 1-12, the month this budget is FOR
  payDayType: 'last_working_day' | 'fixed' = 'last_working_day',
  payDayFixed?: number
): { startDate: Date; endDate: Date; payDay: Date } {
  // Previous month's payday = start of this cycle
  const prevMonth = cycleMonth === 1 ? 12 : cycleMonth - 1;
  const prevYear = cycleMonth === 1 ? cycleYear - 1 : cycleYear;
  const startDate = getPaydayForMonth(prevYear, prevMonth, payDayType, payDayFixed);

  // This month's payday - 1 day = end of this cycle
  const payDay = getPaydayForMonth(cycleYear, cycleMonth, payDayType, payDayFixed);
  const endDate = new Date(payDay);
  endDate.setDate(endDate.getDate() - 1);

  return { startDate, endDate, payDay };
}

/**
 * Format a date range for display
 */
export function formatCycleDateRange(startDate: Date, endDate: Date): string {
  const formatDate = (d: Date) =>
    d.toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' });

  const startYear = startDate.getFullYear();
  const endYear = endDate.getFullYear();

  if (startYear === endYear) {
    return `${formatDate(startDate)} → ${formatDate(endDate)}`;
  }
  return `${formatDate(startDate)} ${startYear} → ${formatDate(endDate)} ${endYear}`;
}

/**
 * Get cycle ID from a date (which cycle does this date belong to?)
 *
 * Cycles run from payday to day before next payday.
 * On payday, you're in the NEXT month's cycle (it just started).
 */
export function getCycleIdForDate(
  date: Date,
  payDayType: 'last_working_day' | 'fixed' = 'last_working_day',
  payDayFixed?: number
): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;

  // Get this month's payday
  const thisMonthPayday = getPaydayForMonth(year, month, payDayType, payDayFixed);

  // Compare dates only (ignore time)
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const paydayOnly = new Date(thisMonthPayday.getFullYear(), thisMonthPayday.getMonth(), thisMonthPayday.getDate());

  // If date is before this month's payday, it belongs to this month's cycle
  // If date is on or after payday, it belongs to next month's cycle
  if (dateOnly < paydayOnly) {
    return `${year}-${String(month).padStart(2, '0')}`;
  } else {
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
  }
}
