import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getCycleIdForDate, getCycleDateRange } from '@/lib/payday-utils';

/**
 * POST /api/cycles/sync-totals
 *
 * Recalculates cycle totals (totalPaid, paidCount) based on actual payment dates
 * using the user's payday settings. This ensures history matches cycle detail view.
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

  // Get all cycles
  const cyclesSnap = await db.collection(`users/${userId}/cycles`).get();

  // Get all paid/partial items
  const itemsSnap = await db
    .collection(`users/${userId}/cycleItems`)
    .where('status', 'in', ['paid', 'partial'])
    .get();

  // Build a map of cycle -> { totalPaid, paidCount } based on payment dates
  const cycleTotals = new Map<string, { totalPaid: number; paidCount: number }>();

  // Initialize all cycles
  for (const doc of cyclesSnap.docs) {
    cycleTotals.set(doc.id, { totalPaid: 0, paidCount: 0 });
  }

  // Calculate totals based on payment dates
  for (const doc of itemsSnap.docs) {
    const item = doc.data();
    const payments = item.payments ?? [];

    if (payments.length > 0) {
      // For items with payments array, sum payments and attribute to payment date's cycle
      for (const payment of payments) {
        const paymentDate = payment.date?.toDate?.() ?? new Date(payment.date);
        const cycleId = getCycleIdForDate(paymentDate, payDayType, payDayFixed);

        if (cycleTotals.has(cycleId)) {
          const current = cycleTotals.get(cycleId)!;
          current.totalPaid += payment.amount ?? 0;
          cycleTotals.set(cycleId, current);
        }
      }

      // Increment paidCount for the cycle where first payment was made
      // (if item is fully paid)
      if (item.status === 'paid' && payments.length > 0) {
        let earliestDate: Date | null = null;
        for (const p of payments) {
          const pDate = p.date?.toDate?.() ?? new Date(p.date);
          if (!earliestDate || pDate < earliestDate) earliestDate = pDate;
        }
        if (earliestDate) {
          const cycleId = getCycleIdForDate(earliestDate, payDayType, payDayFixed);
          if (cycleTotals.has(cycleId)) {
            const current = cycleTotals.get(cycleId)!;
            current.paidCount += 1;
            cycleTotals.set(cycleId, current);
          }
        }
      }
    } else {
      // For items without payments array, use paidDate or fall back to cycleId
      const paidDate = item.paidDate?.toDate?.() ?? (item.paidDate ? new Date(item.paidDate) : null);
      const amount = item.totalPaidAmount ?? item.actualAmount ?? item.amount ?? 0;

      let cycleId: string;
      if (paidDate) {
        cycleId = getCycleIdForDate(paidDate, payDayType, payDayFixed);
      } else {
        cycleId = item.cycleId; // Fallback
      }

      if (cycleTotals.has(cycleId)) {
        const current = cycleTotals.get(cycleId)!;
        current.totalPaid += amount;
        if (item.status === 'paid') {
          current.paidCount += 1;
        }
        cycleTotals.set(cycleId, current);
      }
    }
  }

  // Update cycles with corrected totals
  const updates: Array<{ cycleId: string; oldTotalPaid: number; newTotalPaid: number; oldPaidCount: number; newPaidCount: number }> = [];

  for (const doc of cyclesSnap.docs) {
    const cycle = doc.data();
    const newTotals = cycleTotals.get(doc.id);

    if (newTotals) {
      const oldTotalPaid = cycle.totalPaid ?? 0;
      const oldPaidCount = cycle.paidCount ?? 0;

      // Only update if different
      if (oldTotalPaid !== newTotals.totalPaid || oldPaidCount !== newTotals.paidCount) {
        await doc.ref.update({
          totalPaid: newTotals.totalPaid,
          paidCount: newTotals.paidCount,
          updatedAt: FieldValue.serverTimestamp(),
        });

        updates.push({
          cycleId: doc.id,
          oldTotalPaid,
          newTotalPaid: newTotals.totalPaid,
          oldPaidCount,
          newPaidCount: newTotals.paidCount,
        });
      }
    }
  }

  return NextResponse.json({
    success: true,
    cyclesChecked: cyclesSnap.size,
    cyclesUpdated: updates.length,
    updates,
  });
}
