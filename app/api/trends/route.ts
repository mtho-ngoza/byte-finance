import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { getCycleDateRange } from '@/lib/payday-utils';
import type { Category } from '@/types';

const CATEGORIES: Category[] = [
  'housing',
  'transport',
  'family',
  'utilities',
  'health',
  'education',
  'savings',
  'lifestyle',
  'business',
  'other',
];

const CATEGORY_LABELS: Record<Category, string> = {
  housing: 'Housing',
  transport: 'Transport',
  family: 'Family',
  utilities: 'Utilities',
  health: 'Health',
  education: 'Education',
  savings: 'Savings',
  lifestyle: 'Lifestyle',
  business: 'Business',
  other: 'Other',
};

const CATEGORY_COLORS: Record<Category, string> = {
  housing: '#60a5fa',    // blue
  transport: '#f472b6',  // pink
  family: '#a78bfa',     // purple
  utilities: '#fbbf24',  // amber
  health: '#34d399',     // emerald
  education: '#f97316',  // orange
  savings: '#22d3ee',    // cyan
  lifestyle: '#fb7185',  // rose
  business: '#a3e635',   // lime
  other: '#94a3b8',      // slate
};

export async function GET(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(request.url);
  const months = parseInt(searchParams.get('months') ?? '6', 10);

  const db = getAdminDb();

  // Get user's payday settings
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  const payDayType = userData?.preferences?.payDayType ?? 'last_working_day';
  const payDayFixed = userData?.preferences?.payDayFixed;

  // Generate cycle IDs for the last N months
  const cycleIds: string[] = [];
  const now = new Date();
  for (let i = 0; i < months; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const cycleId = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    cycleIds.push(cycleId);
  }

  // Fetch cycles to get stored date ranges
  const cyclesSnap = await db
    .collection(`users/${userId}/cycles`)
    .where('__name__', 'in', cycleIds)
    .get();

  const cyclesMap = new Map<string, { startDate: Date; endDate: Date }>();
  for (const doc of cyclesSnap.docs) {
    const cycle = doc.data();
    const [yearStr, monthStr] = doc.id.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    let startDate: Date;
    let endDate: Date;

    if (cycle.startDate) {
      startDate = cycle.startDate.toDate?.() ?? new Date(cycle.startDate);
    } else {
      const { startDate: calcStart } = getCycleDateRange(year, month, payDayType, payDayFixed);
      startDate = calcStart;
    }

    if (cycle.endDate) {
      endDate = cycle.endDate.toDate?.() ?? new Date(cycle.endDate);
    } else {
      const { endDate: calcEnd } = getCycleDateRange(year, month, payDayType, payDayFixed);
      endDate = calcEnd;
    }

    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    cyclesMap.set(doc.id, { startDate, endDate });
  }

  // For cycles without documents, calculate dates
  for (const cycleId of cycleIds) {
    if (!cyclesMap.has(cycleId)) {
      const [yearStr, monthStr] = cycleId.split('-');
      const { startDate, endDate } = getCycleDateRange(
        parseInt(yearStr, 10),
        parseInt(monthStr, 10),
        payDayType,
        payDayFixed
      );
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      cyclesMap.set(cycleId, { startDate, endDate });
    }
  }

  // Fetch all paid/partial items
  const allCycleItemsSnap = await db
    .collection(`users/${userId}/cycleItems`)
    .where('status', 'in', ['paid', 'partial'])
    .get();

  // Helper to get earliest payment date
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

  // Build monthly totals and category breakdowns
  const monthlyData: Record<string, {
    total: number;
    paid: number;
    categories: Record<Category, number>;
  }> = {};

  // Initialize all months
  for (const cycleId of cycleIds) {
    monthlyData[cycleId] = {
      total: 0,
      paid: 0,
      categories: {} as Record<Category, number>,
    };
    for (const cat of CATEGORIES) {
      monthlyData[cycleId].categories[cat] = 0;
    }
  }

  // Calculate paid amounts using same logic as useCycleItems/sync-totals
  for (const cycleId of cycleIds) {
    const dateRange = cyclesMap.get(cycleId);
    if (!dateRange) continue;

    const { startDate, endDate } = dateRange;

    for (const doc of allCycleItemsSnap.docs) {
      const item = doc.data();
      const category = (item.category as Category) || 'other';

      // Check if item belongs to this cycle (earliest payment in range)
      const earliestPayment = getEarliestPaymentDate(item);
      if (!earliestPayment || earliestPayment < startDate || earliestPayment > endDate) {
        continue;
      }

      // Add to committed total (items that belong to this cycle)
      monthlyData[cycleId].total += (item.amount as number) ?? 0;

      const payments = (item.payments ?? []) as Array<{ date?: { toDate?: () => Date } | string; amount?: number }>;

      if (payments.length > 0) {
        // Sum only payments within this cycle's date range
        for (const p of payments) {
          const pDate = p.date && typeof p.date === 'object' && 'toDate' in p.date
            ? p.date.toDate?.() ?? new Date()
            : new Date(p.date as string);
          if (pDate >= startDate && pDate <= endDate) {
            monthlyData[cycleId].paid += p.amount ?? 0;
            monthlyData[cycleId].categories[category] += p.amount ?? 0;
          }
        }
      } else {
        // No payments array - use totalPaidAmount
        const amount = (item.totalPaidAmount as number) ?? (item.actualAmount as number) ?? (item.amount as number) ?? 0;
        monthlyData[cycleId].paid += amount;
        monthlyData[cycleId].categories[category] += amount;
      }
    }
  }

  // Format for charts (use slice to avoid mutating original array)
  const sortedCycleIds = [...cycleIds].reverse(); // Oldest to newest
  const monthlyTrend = sortedCycleIds.map((cycleId) => {
    const [year, month] = cycleId.split('-');
    const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-ZA', {
      month: 'short',
    });
    return {
      month: `${monthName} ${year.slice(2)}`,
      cycleId,
      committed: monthlyData[cycleId]?.total ?? 0,
      spent: monthlyData[cycleId]?.paid ?? 0,
    };
  });

  // Current month category breakdown (cycleIds[0] is the current month)
  const currentCycleId = cycleIds[0];
  const currentData = monthlyData[currentCycleId];
  const categoryBreakdown = CATEGORIES
    .map((cat) => ({
      category: cat,
      label: CATEGORY_LABELS[cat],
      color: CATEGORY_COLORS[cat],
      amount: currentData?.categories[cat] ?? 0,
    }))
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  // Category trends over time (use sortedCycleIds which is already oldest to newest)
  const categoryTrends = CATEGORIES.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    color: CATEGORY_COLORS[cat],
    data: sortedCycleIds.map((cycleId) => ({
      cycleId,
      amount: monthlyData[cycleId]?.categories[cat] ?? 0,
    })),
  })).filter((c) => c.data.some((d) => d.amount > 0));

  // Top spending categories across all months
  const totalByCategory: Record<Category, number> = {} as Record<Category, number>;
  for (const cat of CATEGORIES) {
    totalByCategory[cat] = 0;
    for (const cycleId of sortedCycleIds) {
      totalByCategory[cat] += monthlyData[cycleId]?.categories[cat] ?? 0;
    }
  }

  const topCategories = CATEGORIES
    .map((cat) => ({
      category: cat,
      label: CATEGORY_LABELS[cat],
      color: CATEGORY_COLORS[cat],
      total: totalByCategory[cat],
      average: Math.round(totalByCategory[cat] / months),
    }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  return NextResponse.json({
    monthlyTrend,
    categoryBreakdown,
    categoryTrends,
    topCategories,
    months,
  });
}
