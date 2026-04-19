import { useMemo } from 'react';
import type { UserProfile } from '@/types';
import { getPayDay } from '@/lib/pay-day';

/**
 * Returns the pay day and days-until-pay-day for the current calendar month,
 * based on the user's pay day preferences.
 */
export function usePayDay(prefs?: UserProfile['preferences']): {
  payDay: Date | null;
  daysUntilPayDay: number | null;
} {
  return useMemo(() => {
    if (!prefs) return { payDay: null, daysUntilPayDay: null };

    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1; // 1-based

    const payDay = getPayDay(year, month, prefs);

    // Calculate days until pay day (can be negative if pay day has passed)
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const payDayMidnight = new Date(payDay.getFullYear(), payDay.getMonth(), payDay.getDate());
    const diffMs = payDayMidnight.getTime() - todayMidnight.getTime();
    const daysUntilPayDay = Math.round(diffMs / (1000 * 60 * 60 * 24));

    return { payDay, daysUntilPayDay };
  }, [prefs]);
}
