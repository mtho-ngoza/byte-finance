import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
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

  // Fetch all data in parallel
  const [cyclesSnap, goalsSnap, wishlistSnap, cycleItemsSnap, receiptsSnap] = await Promise.all([
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
  ]);

  // Process cycles
  const cycles = cyclesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const totalSpent = cycles.reduce((sum, c: any) => sum + (c.totalPaid || 0), 0);
  const totalCommitted = cycles.reduce((sum, c: any) => sum + (c.totalCommitted || 0), 0);
  const totalIncome = cycles.reduce((sum, c: any) => sum + (c.income?.amount || 0), 0);
  const totalVat = cycles.reduce((sum, c: any) => sum + (c.income?.vatAmount || 0), 0);

  // Monthly breakdown
  const monthlyData = Array.from({ length: 12 }, (_, i) => {
    const monthId = `${year}-${String(i + 1).padStart(2, '0')}`;
    const cycle = cycles.find((c: any) => c.id === monthId) as any;
    return {
      month: i + 1,
      spent: cycle?.totalPaid || 0,
      committed: cycle?.totalCommitted || 0,
      income: cycle?.income?.amount || 0,
    };
  });

  // Category breakdown from cycle items
  const categoryTotals: Record<Category, number> = {
    housing: 0, transport: 0, family: 0, utilities: 0, health: 0,
    education: 0, savings: 0, lifestyle: 0, business: 0, other: 0,
  };

  cycleItemsSnap.docs.forEach((doc) => {
    const item = doc.data();
    if (item.status === 'paid' || item.status === 'partial') {
      const amount = item.totalPaidAmount || item.actualAmount || item.amount || 0;
      const category = (item.category as Category) || 'other';
      categoryTotals[category] += amount;
    }
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
