import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
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

  // Generate cycle IDs for the last N months
  const cycleIds: string[] = [];
  const now = new Date();
  for (let i = 0; i < months; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const cycleId = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    cycleIds.push(cycleId);
  }

  // Fetch all cycle items for these cycles
  const cycleItemsSnap = await db
    .collection(`users/${userId}/cycleItems`)
    .where('cycleId', 'in', cycleIds)
    .get();

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

  // Aggregate data
  for (const doc of cycleItemsSnap.docs) {
    const item = doc.data();
    const cycleId = item.cycleId;
    const category = item.category as Category;
    const amount = item.totalPaidAmount ?? item.actualAmount ?? item.amount ?? 0;
    const isPaid = item.status === 'paid' || item.status === 'partial';

    if (monthlyData[cycleId]) {
      monthlyData[cycleId].total += item.amount ?? 0;
      if (isPaid) {
        monthlyData[cycleId].paid += amount;
        monthlyData[cycleId].categories[category] += amount;
      }
    }
  }

  // Format for charts
  const monthlyTrend = cycleIds
    .reverse()
    .map((cycleId) => {
      const [year, month] = cycleId.split('-');
      const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-ZA', {
        month: 'short',
      });
      return {
        month: `${monthName} ${year.slice(2)}`,
        cycleId,
        committed: monthlyData[cycleId].total,
        spent: monthlyData[cycleId].paid,
      };
    });

  // Current month category breakdown
  const currentCycleId = cycleIds[cycleIds.length - 1];
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

  // Category trends over time
  const categoryTrends = CATEGORIES.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    color: CATEGORY_COLORS[cat],
    data: cycleIds.reverse().map((cycleId) => ({
      cycleId,
      amount: monthlyData[cycleId]?.categories[cat] ?? 0,
    })),
  })).filter((c) => c.data.some((d) => d.amount > 0));

  // Top spending categories across all months
  const totalByCategory: Record<Category, number> = {} as Record<Category, number>;
  for (const cat of CATEGORIES) {
    totalByCategory[cat] = 0;
    for (const cycleId of cycleIds) {
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
