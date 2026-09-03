import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/cycle-items/sync-cycle-ids
 *
 * Reassigns items' cycleId based on their earliest payment date.
 * Also updates cycle totals (totalPaid, paidCount) to reflect the moves.
 */
export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const db = getAdminDb();

  // Get user's payday settings
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  const payDayType = userData?.preferences?.payDayType ?? 'last_working_day';
  const payDayFixed = userData?.preferences?.payDayFixed;

  // Find all paid/partial items
  const itemsSnap = await db
    .collection(`users/${userId}/cycleItems`)
    .where('status', 'in', ['paid', 'partial'])
    .get();

  // Helper to get cycle ID from a date based on payday settings
  const getCycleIdFromDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    // Get this month's payday
    const thisMonthPayday = getPaydayForMonth(year, month, payDayType, payDayFixed);

    // If date is before this month's payday, it belongs to this month's cycle
    // If date is on or after payday, it belongs to next month's cycle
    if (date < thisMonthPayday) {
      return `${year}-${String(month).padStart(2, '0')}`;
    } else {
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
    }
  };

  // Track cycle adjustments
  const cycleAdjustments = new Map<string, { totalPaid: number; paidCount: number }>();

  const moved: Array<{ itemId: string; label: string; from: string; to: string; amount: number }> = [];
  let fixedCount = 0;

  for (const doc of itemsSnap.docs) {
    const item = doc.data();
    const payments = item.payments ?? [];
    const currentCycleId = item.cycleId;

    // Find earliest payment date
    let earliestDate: Date | null = null;

    // Check paidDate first
    if (item.paidDate) {
      earliestDate = item.paidDate.toDate?.() ?? new Date(item.paidDate);
    }

    // Check payments array for earlier date
    for (const payment of payments) {
      const paymentDate = payment.date?.toDate?.() ?? new Date(payment.date);
      if (!earliestDate || paymentDate < earliestDate) {
        earliestDate = paymentDate;
      }
    }

    if (!earliestDate) continue;

    // Determine correct cycle based on payment date
    const correctCycleId = getCycleIdFromDate(earliestDate);

    // Skip if already in correct cycle
    if (correctCycleId === currentCycleId) continue;

    // Calculate the paid amount for this item
    const paidAmount = item.totalPaidAmount ?? item.actualAmount ?? item.amount ?? 0;
    const isPaid = item.status === 'paid';

    // Update item's cycleId and paidDate
    await doc.ref.update({
      cycleId: correctCycleId,
      paidDate: earliestDate,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Track adjustments for old cycle (decrease)
    const oldAdj = cycleAdjustments.get(currentCycleId) ?? { totalPaid: 0, paidCount: 0 };
    oldAdj.totalPaid -= paidAmount;
    if (isPaid) oldAdj.paidCount -= 1;
    cycleAdjustments.set(currentCycleId, oldAdj);

    // Track adjustments for new cycle (increase)
    const newAdj = cycleAdjustments.get(correctCycleId) ?? { totalPaid: 0, paidCount: 0 };
    newAdj.totalPaid += paidAmount;
    if (isPaid) newAdj.paidCount += 1;
    cycleAdjustments.set(correctCycleId, newAdj);

    moved.push({
      itemId: doc.id,
      label: item.label,
      from: currentCycleId,
      to: correctCycleId,
      amount: paidAmount,
    });
    fixedCount++;
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

  return NextResponse.json({
    success: true,
    fixedCount,
    moved,
    cycleAdjustments: Object.fromEntries(cycleAdjustments),
  });
}

// Inline payday calculation (simplified from payday-utils)
function getPaydayForMonth(
  year: number,
  month: number,
  payDayType: 'last_working_day' | 'fixed',
  payDayFixed?: number
): Date {
  if (payDayType === 'fixed' && payDayFixed) {
    const date = new Date(year, month - 1, payDayFixed);
    while (!isWorkingDay(date)) {
      date.setDate(date.getDate() - 1);
    }
    return date;
  }

  // Last working day of the month
  const lastDay = new Date(year, month, 0);
  while (!isWorkingDay(lastDay)) {
    lastDay.setDate(lastDay.getDate() - 1);
  }
  return lastDay;
}

function isWorkingDay(date: Date): boolean {
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;
  // Skip detailed holiday checking for sync - basic weekend check is enough
  return true;
}
