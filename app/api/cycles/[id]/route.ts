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

  // If income.receivedDate is provided, update cycle date range AND reassign items
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

    // End date = day before NEXT cycle's income date (if set) OR last working day
    // Next cycle ID
    const nextMonth = cycleMonth === 12 ? 1 : cycleMonth + 1;
    const nextYear = cycleMonth === 12 ? cycleYear + 1 : cycleYear;
    const nextCycleId = `${nextYear}-${String(nextMonth).padStart(2, '0')}`;

    // Check if next cycle exists and has income date
    const nextCycleRef = db.collection(`users/${userId}/cycles`).doc(nextCycleId);
    const nextCycleSnap = await nextCycleRef.get();

    let endDate: Date;
    if (nextCycleSnap.exists) {
      const nextCycleData = nextCycleSnap.data();
      if (nextCycleData?.income?.receivedDate) {
        // Next cycle has income date - end this cycle day before that
        const nextIncomeDate = nextCycleData.income.receivedDate.toDate
          ? nextCycleData.income.receivedDate.toDate()
          : new Date(nextCycleData.income.receivedDate);
        endDate = new Date(nextIncomeDate);
        endDate.setDate(endDate.getDate() - 1);
      } else {
        // Next cycle exists but no income - use last working day
        const thisMonthPayday = getPaydayForMonth(cycleYear, cycleMonth, payDayType, payDayFixed);
        endDate = new Date(thisMonthPayday);
        endDate.setDate(endDate.getDate() - 1);
      }
    } else {
      // No next cycle - use last working day of this month as payday estimate
      const thisMonthPayday = getPaydayForMonth(cycleYear, cycleMonth, payDayType, payDayFixed);
      endDate = new Date(thisMonthPayday);
      endDate.setDate(endDate.getDate() - 1);
    }

    updateData.startDate = Timestamp.fromDate(startDate);
    updateData.endDate = Timestamp.fromDate(endDate);

    // Also update the income object with proper timestamp
    updateData.income = {
      ...body.income,
      receivedDate: Timestamp.fromDate(receivedDate),
    };

    // Update PREVIOUS cycle's end date to align (this income date - 1)
    const prevMonth = cycleMonth === 1 ? 12 : cycleMonth - 1;
    const prevYear = cycleMonth === 1 ? cycleYear - 1 : cycleYear;
    const prevCycleId = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;

    const prevCycleRef = db.collection(`users/${userId}/cycles`).doc(prevCycleId);
    const prevCycleSnap = await prevCycleRef.get();

    if (prevCycleSnap.exists) {
      const prevEndDate = new Date(receivedDate);
      prevEndDate.setDate(prevEndDate.getDate() - 1);
      await prevCycleRef.update({
        endDate: Timestamp.fromDate(prevEndDate),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    // Now reassign items based on payment date
    // 1. Find all paid items where paidDate falls within this cycle's new date range
    // 2. Update their cycleId to this cycle
    // 3. Recalculate totals

    const allItemsSnap = await db
      .collection(`users/${userId}/cycleItems`)
      .where('status', 'in', ['paid', 'partial'])
      .get();

    const itemsToMove: Array<{ id: string; data: FirebaseFirestore.DocumentData; fromCycleId: string }> = [];

    for (const itemDoc of allItemsSnap.docs) {
      const item = itemDoc.data();
      if (!item.paidDate) continue;

      const paidDate = item.paidDate.toDate ? item.paidDate.toDate() : new Date(item.paidDate);

      // Check if this item's paidDate falls within our new date range
      if (paidDate >= startDate && paidDate <= endDate) {
        // This item should be in this cycle
        if (item.cycleId !== id) {
          itemsToMove.push({
            id: itemDoc.id,
            data: item,
            fromCycleId: item.cycleId,
          });
        }
      }
    }

    // Move items and update cycle totals
    const cycleAdjustments = new Map<string, { totalPaid: number; paidCount: number }>();

    for (const { id: itemId, data: item, fromCycleId } of itemsToMove) {
      const paidAmount = item.totalPaidAmount ?? item.actualAmount ?? item.amount ?? 0;

      // Update item's cycleId
      await db.collection(`users/${userId}/cycleItems`).doc(itemId).update({
        cycleId: id,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Track adjustments for old cycle (decrease)
      const oldAdj = cycleAdjustments.get(fromCycleId) ?? { totalPaid: 0, paidCount: 0 };
      oldAdj.totalPaid -= paidAmount;
      oldAdj.paidCount -= 1;
      cycleAdjustments.set(fromCycleId, oldAdj);

      // Track adjustments for new cycle (increase)
      const newAdj = cycleAdjustments.get(id) ?? { totalPaid: 0, paidCount: 0 };
      newAdj.totalPaid += paidAmount;
      newAdj.paidCount += 1;
      cycleAdjustments.set(id, newAdj);
    }

    // Apply cycle total adjustments
    for (const [cycleId, adj] of cycleAdjustments) {
      if (adj.totalPaid !== 0 || adj.paidCount !== 0) {
        const cycleRef = db.collection(`users/${userId}/cycles`).doc(cycleId);
        const cycleSnap = await cycleRef.get();
        if (cycleSnap.exists) {
          await cycleRef.update({
            totalPaid: FieldValue.increment(adj.totalPaid),
            paidCount: FieldValue.increment(adj.paidCount),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }
    }
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
