import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { computeEaster, isPublicHoliday, getPayDay, getPayCycleBoundaries } from '../../lib/pay-day';
import type { UserProfile } from '../../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const lastWorkingDayPrefs: UserProfile['preferences'] = {
  payDayType: 'last_working_day',
  currency: 'ZAR',
  theme: 'dark',
  notificationsEnabled: false,
};

function fixedPrefs(day: number): UserProfile['preferences'] {
  return {
    payDayType: 'fixed',
    payDayFixed: day,
    currency: 'ZAR',
    theme: 'dark',
    notificationsEnabled: false,
  };
}

function isWeekend(d: Date): boolean {
  return d.getDay() === 0 || d.getDay() === 6;
}

// ---------------------------------------------------------------------------
// computeEaster — sanity checks for known years
// ---------------------------------------------------------------------------

describe('computeEaster', () => {
  const knownEasters: [number, number, number][] = [
    [2024, 3, 31], // March 31
    [2025, 4, 20], // April 20
    [2026, 4, 5],  // April 5
    [2027, 3, 28], // March 28
  ];

  it.each(knownEasters)('year %i → %i/%i', (year, month, day) => {
    const easter = computeEaster(year);
    expect(easter.getFullYear()).toBe(year);
    expect(easter.getMonth() + 1).toBe(month);
    expect(easter.getDate()).toBe(day);
  });
});

// ---------------------------------------------------------------------------
// isPublicHoliday — fixed holidays
// ---------------------------------------------------------------------------

describe('isPublicHoliday — fixed holidays', () => {
  it('New Year\'s Day (Jan 1)', () => {
    expect(isPublicHoliday(new Date(2026, 0, 1))).toBe(true);
  });

  it('Human Rights Day (Mar 21)', () => {
    expect(isPublicHoliday(new Date(2026, 2, 21))).toBe(true);
  });

  it('Freedom Day (Apr 27)', () => {
    expect(isPublicHoliday(new Date(2026, 3, 27))).toBe(true);
  });

  it('Workers\' Day (May 1)', () => {
    expect(isPublicHoliday(new Date(2026, 4, 1))).toBe(true);
  });

  it('Youth Day (Jun 16)', () => {
    expect(isPublicHoliday(new Date(2026, 5, 16))).toBe(true);
  });

  it('National Women\'s Day (Aug 9)', () => {
    expect(isPublicHoliday(new Date(2026, 7, 9))).toBe(true);
  });

  it('Heritage Day (Sep 24)', () => {
    expect(isPublicHoliday(new Date(2026, 8, 24))).toBe(true);
  });

  it('Day of Reconciliation (Dec 16)', () => {
    expect(isPublicHoliday(new Date(2026, 11, 16))).toBe(true);
  });

  it('Christmas Day (Dec 25)', () => {
    expect(isPublicHoliday(new Date(2026, 11, 25))).toBe(true);
  });

  it('Day of Goodwill (Dec 26)', () => {
    expect(isPublicHoliday(new Date(2026, 11, 26))).toBe(true);
  });

  it('non-holiday date returns false', () => {
    expect(isPublicHoliday(new Date(2026, 2, 15))).toBe(false); // March 15
  });
});

describe('isPublicHoliday — Easter-relative holidays', () => {
  // Easter 2026 = April 5
  it('Good Friday 2026 (Apr 3)', () => {
    expect(isPublicHoliday(new Date(2026, 3, 3))).toBe(true);
  });

  it('Easter Monday 2026 (Apr 6)', () => {
    expect(isPublicHoliday(new Date(2026, 3, 6))).toBe(true);
  });

  // Easter 2025 = April 20
  it('Good Friday 2025 (Apr 18)', () => {
    expect(isPublicHoliday(new Date(2025, 3, 18))).toBe(true);
  });

  it('Easter Monday 2025 (Apr 21)', () => {
    expect(isPublicHoliday(new Date(2025, 3, 21))).toBe(true);
  });

  it('Easter Sunday itself is not a gazetted SA holiday', () => {
    // Easter Sunday is not a public holiday in SA (only Good Friday + Easter Monday)
    expect(isPublicHoliday(new Date(2026, 3, 5))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getPayDay — fixed pay day (Req 3.1)
// ---------------------------------------------------------------------------

describe('getPayDay — fixed', () => {
  it('returns the configured day for a given month', () => {
    const d = getPayDay(2026, 3, fixedPrefs(25));
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth() + 1).toBe(3);
    expect(d.getDate()).toBe(25);
  });

  it('works for day 1', () => {
    const d = getPayDay(2026, 1, fixedPrefs(1));
    expect(d.getDate()).toBe(1);
  });

  it('works for day 28', () => {
    const d = getPayDay(2026, 2, fixedPrefs(28));
    expect(d.getDate()).toBe(28);
  });
});

// ---------------------------------------------------------------------------
// getPayDay — last working day (Req 3.2, 3.3, 3.4)
// ---------------------------------------------------------------------------

describe('getPayDay — last working day', () => {
  it('March 2026 → March 31 (Tuesday, not a holiday)', () => {
    const d = getPayDay(2026, 3, lastWorkingDayPrefs);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth() + 1).toBe(3);
    expect(d.getDate()).toBe(31);
  });

  it('April 2026 → April 30 (Thursday; May 1 is Workers\' Day)', () => {
    // April 30 is a Thursday — valid working day
    const d = getPayDay(2026, 4, lastWorkingDayPrefs);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth() + 1).toBe(4);
    expect(d.getDate()).toBe(30);
  });

  it('December 2026 → skips Dec 25 (Christmas) and Dec 26 (Day of Goodwill)', () => {
    // Dec 31 2026 is a Thursday — valid working day
    const d = getPayDay(2026, 12, lastWorkingDayPrefs);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth() + 1).toBe(12);
    expect(d.getDate()).toBe(31);
    expect(isWeekend(d)).toBe(false);
    expect(isPublicHoliday(d)).toBe(false);
  });

  it('result is never a Saturday', () => {
    for (let month = 1; month <= 12; month++) {
      const d = getPayDay(2026, month, lastWorkingDayPrefs);
      expect(d.getDay()).not.toBe(6);
    }
  });

  it('result is never a Sunday', () => {
    for (let month = 1; month <= 12; month++) {
      const d = getPayDay(2026, month, lastWorkingDayPrefs);
      expect(d.getDay()).not.toBe(0);
    }
  });

  it('result is never a SA public holiday', () => {
    for (let month = 1; month <= 12; month++) {
      const d = getPayDay(2026, month, lastWorkingDayPrefs);
      expect(isPublicHoliday(d)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// getPayCycleBoundaries (Req 3.6)
// ---------------------------------------------------------------------------

describe('getPayCycleBoundaries', () => {
  it('cycle end is one day before current pay day', () => {
    const { payDay, end } = getPayCycleBoundaries(2026, 3, fixedPrefs(25));
    const expected = new Date(payDay);
    expected.setDate(expected.getDate() - 1);
    expect(end.getFullYear()).toBe(expected.getFullYear());
    expect(end.getMonth()).toBe(expected.getMonth());
    expect(end.getDate()).toBe(expected.getDate());
  });

  it('cycle start equals previous month\'s pay day', () => {
    const { start } = getPayCycleBoundaries(2026, 3, fixedPrefs(25));
    const prevPayDay = getPayDay(2026, 2, fixedPrefs(25));
    expect(start.getFullYear()).toBe(prevPayDay.getFullYear());
    expect(start.getMonth()).toBe(prevPayDay.getMonth());
    expect(start.getDate()).toBe(prevPayDay.getDate());
  });

  it('handles January correctly (prev month = December of prior year)', () => {
    const { start } = getPayCycleBoundaries(2026, 1, fixedPrefs(25));
    const prevPayDay = getPayDay(2025, 12, fixedPrefs(25));
    expect(start.getFullYear()).toBe(2025);
    expect(start.getMonth() + 1).toBe(12);
    expect(start.getDate()).toBe(prevPayDay.getDate());
  });
});

// ---------------------------------------------------------------------------
// Property 4: Fixed pay day calculator correctness (Req 3.1)
// ---------------------------------------------------------------------------

describe('Property 4: Fixed pay day calculator correctness', () => {
  /**
   * Validates: Requirements 3.1
   *
   * For any year, month, and fixed day N in [1, 28],
   * getPayDay returns a Date whose day-of-month equals N
   * and whose month and year match the inputs.
   */
  it('for any year/month/day in [1,28], returns correct date', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2000, max: 2100 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        (year, month, day) => {
          const result = getPayDay(year, month, fixedPrefs(day));
          expect(result.getFullYear()).toBe(year);
          expect(result.getMonth() + 1).toBe(month);
          expect(result.getDate()).toBe(day);
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5: Last working day is never a weekend or SA public holiday (Req 3.2, 3.3)
// ---------------------------------------------------------------------------

describe('Property 5: Last working day is never a weekend or SA public holiday', () => {
  /**
   * Validates: Requirements 3.2, 3.3
   *
   * For any year and month, getPayDay with last_working_day returns a Date
   * that is not a Saturday, not a Sunday, and not a SA public holiday.
   */
  it('result is always a valid working day', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2000, max: 2100 }),
        fc.integer({ min: 1, max: 12 }),
        (year, month) => {
          const result = getPayDay(year, month, lastWorkingDayPrefs);
          expect(result.getDay()).not.toBe(0); // not Sunday
          expect(result.getDay()).not.toBe(6); // not Saturday
          expect(isPublicHoliday(result)).toBe(false);
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6: Pay cycle boundaries are contiguous and non-overlapping (Req 3.6)
// ---------------------------------------------------------------------------

describe('Property 6: Pay cycle boundaries are contiguous and non-overlapping', () => {
  /**
   * Validates: Requirements 3.6
   *
   * For any year and month:
   * - cycle end = payDay - 1 day
   * - cycle start = previous month's payDay
   * - no day falls in two cycles simultaneously
   */
  it('end is exactly one day before payDay', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2001, max: 2100 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        (year, month, day) => {
          const prefs = fixedPrefs(day);
          const { payDay, end } = getPayCycleBoundaries(year, month, prefs);
          const payDayMs = new Date(payDay.getFullYear(), payDay.getMonth(), payDay.getDate()).getTime();
          const endMs = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
          const diffDays = (payDayMs - endMs) / (1000 * 60 * 60 * 24);
          expect(diffDays).toBe(1);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('start equals previous month\'s payDay', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2001, max: 2100 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        (year, month, day) => {
          const prefs = fixedPrefs(day);
          const { start } = getPayCycleBoundaries(year, month, prefs);
          const prevMonth = month === 1 ? 12 : month - 1;
          const prevYear = month === 1 ? year - 1 : year;
          const prevPayDay = getPayDay(prevYear, prevMonth, prefs);
          expect(start.getFullYear()).toBe(prevPayDay.getFullYear());
          expect(start.getMonth()).toBe(prevPayDay.getMonth());
          expect(start.getDate()).toBe(prevPayDay.getDate());
        }
      ),
      { numRuns: 200 }
    );
  });

  it('no day falls in two consecutive cycles (non-overlapping)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2001, max: 2099 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        (year, month, day) => {
          const prefs = fixedPrefs(day);
          const nextMonth = month === 12 ? 1 : month + 1;
          const nextYear = month === 12 ? year + 1 : year;

          const current = getPayCycleBoundaries(year, month, prefs);
          const next = getPayCycleBoundaries(nextYear, nextMonth, prefs);

          // Current cycle end + 1 day should equal next cycle start (= current payDay)
          const currentEndMs = new Date(current.end.getFullYear(), current.end.getMonth(), current.end.getDate()).getTime();
          const nextStartMs = new Date(next.start.getFullYear(), next.start.getMonth(), next.start.getDate()).getTime();
          const currentPayDayMs = new Date(current.payDay.getFullYear(), current.payDay.getMonth(), current.payDay.getDate()).getTime();

          // next cycle starts on current payDay
          expect(nextStartMs).toBe(currentPayDayMs);
          // current cycle ends the day before current payDay
          expect(currentEndMs + 24 * 60 * 60 * 1000).toBe(currentPayDayMs);
        }
      ),
      { numRuns: 200 }
    );
  });
});
