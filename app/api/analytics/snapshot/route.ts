import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getCycleIdForDate, getCycleDateRange } from '@/lib/payday-utils';
import type { Category } from '@/types';

const ALL_CATEGORIES: Category[] = [
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

/**
 * GET /api/analytics/snapshot?cycleId=2026-05
 * Returns the snapshot for a given cycle (or current month if not specified)
 */
export async function GET(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(request.url);
  let cycleId = searchParams.get('cycleId');

  // Default to current month
  if (!cycleId) {
    const now = new Date();
    cycleId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  const db = getAdminDb();
  const snapshotRef = db.doc(`users/${userId}/snapshots/${cycleId}`);
  const snapshot = await snapshotRef.get();

  if (!snapshot.exists) {
    return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
  }

  return NextResponse.json({ id: snapshot.id, ...snapshot.data() });
}

/**
 * POST /api/analytics/snapshot
 * Generate/update snapshot for a cycle
 * Body: { cycleId?: string } - defaults to current month
 */
export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await request.json().catch(() => ({}));
  let cycleId = body.cycleId as string | undefined;

  // Default to current month
  if (!cycleId) {
    const now = new Date();
    cycleId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  const db = getAdminDb();

  // Get user's payday settings
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  const payDayType = userData?.preferences?.payDayType ?? 'last_working_day';
  const payDayFixed = userData?.preferences?.payDayFixed;

  // Get cycle data
  const cycleRef = db.doc(`users/${userId}/cycles/${cycleId}`);
  const cycleDoc = await cycleRef.get();

  if (!cycleDoc.exists) {
    return NextResponse.json({ error: 'Cycle not found' }, { status: 404 });
  }

  const cycle = cycleDoc.data()!;

  // Parse year/month from cycleId
  const [yearStr, monthStr] = cycleId.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  // Get cycle date range for payment filtering
  const { startDate, endDate } = getCycleDateRange(year, month, payDayType, payDayFixed);

  // Get all cycle items for this cycle (for committed amounts)
  const itemsSnap = await db
    .collection(`users/${userId}/cycleItems`)
    .where('cycleId', '==', cycleId)
    .get();

  // Get all paid items to check payment dates
  const paidItemsSnap = await db
    .collection(`users/${userId}/cycleItems`)
    .where('status', 'in', ['paid', 'partial'])
    .get();

  // Calculate committed from items planned for this cycle
  const committedItems = itemsSnap.docs.map((d) => d.data());
  const totalCommitted = committedItems.reduce((sum, item) => sum + (item.amount ?? 0), 0);

  // Calculate paid based on payment dates within this cycle's range
  let totalPaid = 0;
  const categoryBreakdown: Record<Category, number> = {} as Record<Category, number>;
  ALL_CATEGORIES.forEach((cat) => {
    categoryBreakdown[cat] = 0;
  });

  const paidInCycle: Array<{ label: string; amount: number; category: Category }> = [];

  for (const doc of paidItemsSnap.docs) {
    const item = doc.data();
    const category = (item.category as Category) || 'other';
    const payments = item.payments ?? [];

    if (payments.length > 0) {
      // Sum payments that fall within this cycle's date range
      for (const payment of payments) {
        const paymentDate = payment.date?.toDate?.() ?? new Date(payment.date);
        if (paymentDate >= startDate && paymentDate <= endDate) {
          const amount = payment.amount ?? 0;
          totalPaid += amount;
          categoryBreakdown[category] += amount;
          paidInCycle.push({ label: item.label, amount, category });
        }
      }
    } else if (item.paidDate) {
      // For items without payments array, use paidDate
      const paidDate = item.paidDate.toDate?.() ?? new Date(item.paidDate);
      if (paidDate >= startDate && paidDate <= endDate) {
        const amount = item.totalPaidAmount ?? item.actualAmount ?? item.amount ?? 0;
        totalPaid += amount;
        categoryBreakdown[category] += amount;
        paidInCycle.push({ label: item.label, amount, category });
      }
    }
  }

  // Get top 5 items by amount (from payments in this cycle)
  const topItems = paidInCycle
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
    .map((item) => ({ label: item.label, amount: item.amount }));

  // Calculate overall goals progress
  const goalsSnap = await db
    .collection(`users/${userId}/goals`)
    .where('status', '==', 'active')
    .get();

  let goalsProgress = 0;
  if (!goalsSnap.empty) {
    const goals = goalsSnap.docs.map((d) => d.data() as {
      currentAmount: number;
      targetAmount: number;
    });

    const totalTarget = goals.reduce((sum, g) => sum + g.targetAmount, 0);
    const totalCurrent = goals.reduce((sum, g) => sum + g.currentAmount, 0);
    goalsProgress = totalTarget > 0 ? Math.round((totalCurrent / totalTarget) * 100) : 0;
  }

  // Build snapshot
  const snapshotData = {
    year,
    month,
    totalCommitted,
    totalPaid,
    categoryBreakdown,
    topItems,
    goalsProgress,
    // Include cycle income info for reference
    income: cycle.income?.amount ?? null,
    vatAmount: cycle.income?.vatAmount ?? null,
    createdAt: FieldValue.serverTimestamp(),
  };

  // Save snapshot
  const snapshotRef = db.doc(`users/${userId}/snapshots/${cycleId}`);
  await snapshotRef.set(snapshotData, { merge: true });

  return NextResponse.json({ id: cycleId, ...snapshotData }, { status: 201 });
}
