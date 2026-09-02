import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getPaydayForMonth } from '@/lib/payday-utils';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id } = await params;

  const db = getAdminDb();
  const ref = db.collection(`users/${userId}/cycles`).doc(id);
  const doc = await ref.get();

  if (!doc.exists) {
    return NextResponse.json({ error: 'Cycle not found' }, { status: 404 });
  }

  return NextResponse.json({ id, ...doc.data() });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id } = await params;
  const body = await request.json();

  const db = getAdminDb();
  const ref = db.collection(`users/${userId}/cycles`).doc(id);

  const doc = await ref.get();
  if (!doc.exists) {
    return NextResponse.json({ error: 'Cycle not found' }, { status: 404 });
  }

  const updateData: Record<string, unknown> = {
    ...body,
    updatedAt: FieldValue.serverTimestamp(),
  };

  // If income.receivedDate is provided, update cycle date range
  if (body.income?.receivedDate) {
    const receivedDate = new Date(body.income.receivedDate);

    // Get user's payday preferences
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    const payDayType = userData?.preferences?.payDayType ?? 'last_working_day';
    const payDayFixed = userData?.preferences?.payDayFixed;

    // Cycle ID format: YYYY-MM (the month this budget is FOR)
    const [cycleYear, cycleMonth] = id.split('-').map(Number);

    // Start date = income received date (payday of previous month)
    const startDate = receivedDate;

    // End date = day before this month's payday
    const thisMonthPayday = getPaydayForMonth(cycleYear, cycleMonth, payDayType, payDayFixed);
    const endDate = new Date(thisMonthPayday);
    endDate.setDate(endDate.getDate() - 1);

    updateData.startDate = Timestamp.fromDate(startDate);
    updateData.endDate = Timestamp.fromDate(endDate);

    // Also update the income object with proper timestamp
    updateData.income = {
      ...body.income,
      receivedDate: Timestamp.fromDate(receivedDate),
    };
  }

  await ref.update(updateData);

  const updated = await ref.get();
  return NextResponse.json({ id, ...updated.data() });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id } = await params;

  const db = getAdminDb();
  const ref = db.collection(`users/${userId}/cycles`).doc(id);

  const doc = await ref.get();
  if (!doc.exists) {
    return NextResponse.json({ error: 'Cycle not found' }, { status: 404 });
  }

  // Get all cycle items for this cycle
  const itemsSnap = await db
    .collection(`users/${userId}/cycleItems`)
    .where('cycleId', '==', id)
    .get();

  // Build a map of goal contributions to remove
  const goalContributionsToRemove = new Map<string, { ids: string[]; totalAmount: number }>();

  for (const itemDoc of itemsSnap.docs) {
    const item = itemDoc.data();
    if (item.linkedGoalId && item.payments?.length > 0) {
      const existing = goalContributionsToRemove.get(item.linkedGoalId) ?? { ids: [], totalAmount: 0 };
      for (const payment of item.payments) {
        existing.ids.push(`${itemDoc.id}-${payment.id}`);
        existing.totalAmount += payment.amount ?? 0;
      }
      goalContributionsToRemove.set(item.linkedGoalId, existing);
    }
  }

  // Remove contributions from linked goals
  for (const [goalId, { ids, totalAmount }] of goalContributionsToRemove) {
    const goalRef = db.collection(`users/${userId}/goals`).doc(goalId);
    const goalSnap = await goalRef.get();
    if (goalSnap.exists) {
      const goal = goalSnap.data()!;
      const contributions: Array<{ id: string; [key: string]: unknown }> = goal.contributions ?? [];
      const filteredContributions = contributions.filter((c) => !ids.includes(c.id));
      await goalRef.update({
        contributions: filteredContributions,
        currentAmount: FieldValue.increment(-totalAmount),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }

  // Delete cycle items and cycle
  const batch = db.batch();
  itemsSnap.docs.forEach((itemDoc) => {
    batch.delete(itemDoc.ref);
  });
  batch.delete(ref);
  await batch.commit();

  return NextResponse.json({ success: true, deletedItems: itemsSnap.size });
}
