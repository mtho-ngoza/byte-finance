import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
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

  // Get cycle data
  const cycleRef = db.doc(`users/${userId}/cycles/${cycleId}`);
  const cycleDoc = await cycleRef.get();

  if (!cycleDoc.exists) {
    return NextResponse.json({ error: 'Cycle not found' }, { status: 404 });
  }

  const cycle = cycleDoc.data()!;

  // Get all cycle items for this cycle
  const itemsSnap = await db
    .collection(`users/${userId}/cycleItems`)
    .where('cycleId', '==', cycleId)
    .get();

  const items = itemsSnap.docs.map((d) => d.data() as {
    label: string;
    amount: number;
    category: Category;
    status: string;
  });

  // Calculate totals
  const totalCommitted = items.reduce((sum, item) => sum + item.amount, 0);
  const totalPaid = items
    .filter((item) => item.status === 'paid')
    .reduce((sum, item) => sum + item.amount, 0);

  // Calculate category breakdown (only paid items)
  const categoryBreakdown: Record<Category, number> = {} as Record<Category, number>;
  ALL_CATEGORIES.forEach((cat) => {
    categoryBreakdown[cat] = 0;
  });

  items
    .filter((item) => item.status === 'paid')
    .forEach((item) => {
      categoryBreakdown[item.category] = (categoryBreakdown[item.category] || 0) + item.amount;
    });

  // Get top 5 items by amount (paid only)
  const topItems = items
    .filter((item) => item.status === 'paid')
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

  // Parse year/month from cycleId
  const [yearStr, monthStr] = cycleId.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

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
