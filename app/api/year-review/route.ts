import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { getCycleDateRange } from '@/lib/payday-utils';
import type { Category } from '@/types';

/**
 * GET /api/year-review?year=2026
 * Returns comprehensive year-in-review statistics
 */
export async function GET(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(request.url);
  const yearParam = searchParams.get('year');
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();

  const db = getAdminDb();

  // Get user's payday settings
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  const payDayType = userData?.preferences?.payDayType ?? 'last_working_day';
  const payDayFixed = userData?.preferences?.payDayFixed;

  // Fetch all data in parallel
  const [cyclesSnap, goalsSnap, wishlistSnap, cycleItemsSnap, receiptsSnap, allPaidItemsSnap] = await Promise.all([
    // Cycles for the year (id format: "2026-01" to "2026-12")
    db.collection(`users/${userId}/cycles`)
      .where('__name__', '>=', `${year}-01`)
      .where('__name__', '<=', `${year}-12`)
      .get(),
    // All goals to check completions
    db.collection(`users/${userId}/goals`).get(),
    // Wishlist items for the year
    db.collection(`users/${userId}/wishlist`).get(),
    // Cycle items for category breakdown
    db.collection(`users/${userId}/cycleItems`)
      .where('cycleId', '>=', `${year}-01`)
      .where('cycleId', '<=', `${year}-12`)
      .get(),
    // Receipts captured during the year
    db.collection(`users/${userId}/receipts`)
      .where('capturedAt', '>=', new Date(`${year}-01-01`))
      .where('capturedAt', '<', new Date(`${year + 1}-01-01`))
      .get(),
    // All paid items for accurate payment date attribution
    db.collection(`users/${userId}/cycleItems`)
      .where('status', 'in', ['paid', 'partial'])
      .get(),
  ]);

  // Process cycles for committed amounts and income
  const cycles = cyclesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as {
    id: string;
    startDate?: { toDate?: () => Date } | string;
    endDate?: { toDate?: () => Date } | string;
    totalCommitted?: number;
    totalPaid?: number;
    income?: { amount?: number; vatAmount?: number };
  }));
  const totalCommitted = cycles.reduce((sum, c: any) => sum + (c.totalCommitted || 0), 0);
  const totalIncome = cycles.reduce((sum, c: any) => sum + (c.income?.amount || 0), 0);
  const totalVat = cycles.reduce((sum, c: any) => sum + (c.income?.vatAmount || 0), 0);

  // Helper to get earliest payment date from an item
  const getEarliestPaymentDate = (item: Record<string, unknown>): Date | null => {
    if (item.paidDate) {
      const pd = item.paidDate as { toDate?: () => Date };
      return pd.toDate?.() ?? new Date(item.paidDate as string);
    }
    const payments = (item.payments ?? []) as Array<{ date?: { toDate?: () => Date } | string }>;
    if (payments.length > 0) {
      let earliest: Date | null = null;
      for (const p of payments) {
        const pDate = p.date && typeof p.date === 'object' && 'toDate' in p.date
          ? p.date.toDate?.() ?? new Date()
          : new Date(p.date as string);
        if (!earliest || pDate < earliest) earliest = pDate;
      }
      return earliest;
    }
    return null;
  };

  // Build date ranges for each month FROM STORED CYCLE DOCUMENTS (same as sync-totals)
  const monthDateRanges: Array<{ month: number; monthId: string; startDate: Date; endDate: Date }> = [];
  for (let i = 1; i <= 12; i++) {
    const monthId = `${year}-${String(i).padStart(2, '0')}`;
    const cycle = cycles.find((c: any) => c.id === monthId);

    let startDate: Date;
    let endDate: Date;

    if (cycle?.startDate) {
      const sd = cycle.startDate as { toDate?: () => Date };
      startDate = sd.toDate?.() ?? new Date(cycle.startDate as string);
    } else {
      // Fallback to calculated if cycle doesn't exist
      const { startDate: calcStart } = getCycleDateRange(year, i, payDayType, payDayFixed);
      startDate = calcStart;
    }

    if (cycle?.endDate) {
      const ed = cycle.endDate as { toDate?: () => Date };
      endDate = ed.toDate?.() ?? new Date(cycle.endDate as string);
    } else {
      const { endDate: calcEnd } = getCycleDateRange(year, i, payDayType, payDayFixed);
      endDate = calcEnd;
    }

    // Normalize to full days
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    monthDateRanges.push({ month: i, monthId, startDate, endDate });
  }

  // Build monthly spending using same logic as useCycleItems/sync-totals
  const monthlySpending: Record<string, number> = {};
  const categoryTotals: Record<Category, number> = {
    housing: 0, transport: 0, family: 0, utilities: 0, health: 0,
    education: 0, savings: 0, lifestyle: 0, business: 0, other: 0,
  };

  // Initialize all months
  for (const { monthId } of monthDateRanges) {
    monthlySpending[monthId] = 0;
  }

  // For each month, find items where earliest payment falls within range
  // and sum only payments within that range
  for (const { monthId, startDate, endDate } of monthDateRanges) {
    for (const doc of allPaidItemsSnap.docs) {
      const item = doc.data();
      const category = (item.category as Category) || 'other';

      // Check if item belongs to this month (earliest payment in range)
      const earliestPayment = getEarliestPaymentDate(item);
      if (!earliestPayment || earliestPayment < startDate || earliestPayment > endDate) {
        continue;
      }

      const payments = (item.payments ?? []) as Array<{ date?: { toDate?: () => Date } | string; amount?: number }>;

      if (payments.length > 0) {
        // Sum only payments within this month's date range
        for (const p of payments) {
          const pDate = p.date && typeof p.date === 'object' && 'toDate' in p.date
            ? p.date.toDate?.() ?? new Date()
            : new Date(p.date as string);
          if (pDate >= startDate && pDate <= endDate) {
            const amount = p.amount ?? 0;
            monthlySpending[monthId] += amount;
            categoryTotals[category] += amount;
          }
        }
      } else {
        // No payments array - use totalPaidAmount
        const amount = (item.totalPaidAmount as number) ?? (item.actualAmount as number) ?? (item.amount as number) ?? 0;
        monthlySpending[monthId] += amount;
        categoryTotals[category] += amount;
      }
    }
  }

  // Calculate total spent from monthly spending
  const totalSpent = Object.values(monthlySpending).reduce((sum, val) => sum + val, 0);

  // Monthly breakdown
  const monthlyData = Array.from({ length: 12 }, (_, i) => {
    const monthId = `${year}-${String(i + 1).padStart(2, '0')}`;
    const cycle = cycles.find((c: any) => c.id === monthId) as any;
    return {
      month: i + 1,
      spent: monthlySpending[monthId] ?? 0,
      committed: cycle?.totalCommitted || 0,
      income: cycle?.income?.amount || 0,
    };
  });

  // Top categories sorted by amount
  const topCategories = Object.entries(categoryTotals)
    .filter(([_, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([category, amount]) => ({ category, amount }));

  // Goals stats
  const goals = goalsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const goalsCompletedThisYear = goals.filter((g: any) => {
    if (g.status !== 'completed' || !g.completedAt) return false;
    const completedDate = g.completedAt.toDate?.() || new Date(g.completedAt);
    return completedDate.getFullYear() === year;
  });
  const activeGoals = goals.filter((g: any) => g.status === 'active');
  const totalGoalProgress = activeGoals.length > 0
    ? activeGoals.reduce((sum, g: any) => {
        if (!g.targetAmount || g.targetAmount === 0) return sum;
        return sum + Math.min(100, Math.round((g.currentAmount || 0) / g.targetAmount * 100));
      }, 0) / activeGoals.length
    : 0;

  // Wishlist stats for this year
  const wishlistItems = wishlistSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((item: any) => item.targetYear === year ||
      (item.targetYear <= year && item.targetYearEnd && item.targetYearEnd >= year));

  const wishlistStats = {
    total: wishlistItems.length,
    completed: wishlistItems.filter((i: any) => i.status === 'completed').length,
    abandoned: wishlistItems.filter((i: any) => i.status === 'abandoned').length,
    carriedForward: wishlistItems.filter((i: any) => i.status === 'carried-forward').length,
    active: wishlistItems.filter((i: any) => i.status === 'active').length,
  };

  const wishlistSuccessRate = wishlistStats.total > 0
    ? Math.round((wishlistStats.completed / wishlistStats.total) * 100)
    : 0;

  // Receipts stats
  const receiptsCount = receiptsSnap.docs.length;
  const receiptsTotal = receiptsSnap.docs.reduce((sum, doc) => {
    const data = doc.data();
    return sum + (data.amountInCents || 0);
  }, 0);

  // Savings rate calculation (net income - VAT - spending)
  const netIncome = totalIncome - totalVat;
  const savingsRate = netIncome > 0
    ? Math.round(((netIncome - totalSpent) / netIncome) * 100)
    : 0;

  // Compare with previous year if we have data
  const prevYearCyclesSnap = await db.collection(`users/${userId}/cycles`)
    .where('__name__', '>=', `${year - 1}-01`)
    .where('__name__', '<=', `${year - 1}-12`)
    .get();

  const prevYearCycles = prevYearCyclesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const prevYearSpent = prevYearCycles.reduce((sum, c: any) => sum + (c.totalPaid || 0), 0);
  const prevYearIncome = prevYearCycles.reduce((sum, c: any) => sum + (c.income?.amount || 0), 0);

  const spendingChange = prevYearSpent > 0
    ? Math.round(((totalSpent - prevYearSpent) / prevYearSpent) * 100)
    : null;

  return NextResponse.json({
    year,
    summary: {
      totalSpent,
      totalCommitted,
      totalIncome,
      totalVat,
      netIncome,
      savingsRate,
      spendingChange,
      prevYearSpent,
    },
    monthlyData,
    topCategories,
    goals: {
      completedThisYear: goalsCompletedThisYear.length,
      activeCount: activeGoals.length,
      averageProgress: Math.round(totalGoalProgress),
      completedGoals: goalsCompletedThisYear.map((g: any) => ({
        id: g.id,
        name: g.name,
        targetAmount: g.targetAmount,
      })),
    },
    wishlist: {
      ...wishlistStats,
      successRate: wishlistSuccessRate,
    },
    receipts: {
      count: receiptsCount,
      total: receiptsTotal,
    },
  });
}
