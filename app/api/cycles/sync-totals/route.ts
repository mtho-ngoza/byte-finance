import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getCycleIdForDate, getCycleDateRange } from '@/lib/payday-utils';

interface CycleTotals {
  totalCommitted: number;
  itemCount: number;
  totalPaid: number;
  paidCount: number;
}

/**
 * POST /api/cycles/sync-totals
 *
 * Recalculates ALL cycle totals based on:
 * - totalCommitted, itemCount: from items PLANNED for this cycle (by cycleId)
 * - totalPaid, paidCount: from payments MADE within this cycle's date range
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

  // Get ALL cycle items (not just paid/partial)
  const allItemsSnap = await db.collection(`users/${userId}/cycleItems`).get();

  // Build a map of cycle -> totals
  const cycleTotals = new Map<string, CycleTotals>();

  // Initialize all cycles
  for (const doc of cyclesSnap.docs) {
    cycleTotals.set(doc.id, { totalCommitted: 0, itemCount: 0, totalPaid: 0, paidCount: 0 });
  }

  // First pass: Calculate committed totals from items PLANNED for each cycle
  for (const doc of allItemsSnap.docs) {
    const item = doc.data();
    const cycleId = item.cycleId;

    if (!cycleId || !cycleTotals.has(cycleId)) continue;

    // Skip skipped items from committed totals
    if (item.status === 'skipped') continue;

    const current = cycleTotals.get(cycleId)!;
    current.totalCommitted += item.amount ?? 0;
    current.itemCount += 1;
    cycleTotals.set(cycleId, current);
  }

  // Second pass: Calculate paid totals from payments MADE within each cycle's date range
  // Build date ranges for each cycle
  const cycleDateRanges = new Map<string, { startDate: Date; endDate: Date }>();
  for (const doc of cyclesSnap.docs) {
    const [yearStr, monthStr] = doc.id.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const { startDate, endDate } = getCycleDateRange(year, month, payDayType, payDayFixed);
    cycleDateRanges.set(doc.id, { startDate, endDate });
  }

  // Track which items have been counted as "paid" for each cycle (to avoid double-counting)
  const paidItemsPerCycle = new Map<string, Set<string>>();
  for (const cycleId of cycleTotals.keys()) {
    paidItemsPerCycle.set(cycleId, new Set());
  }

  for (const doc of allItemsSnap.docs) {
    const item = doc.data();
    if (item.status !== 'paid' && item.status !== 'partial') continue;

    const payments = item.payments ?? [];

    if (payments.length > 0) {
      // Sum each payment to the cycle it belongs to
      for (const payment of payments) {
        const paymentDate = payment.date?.toDate?.() ?? new Date(payment.date);
        const cycleId = getCycleIdForDate(paymentDate, payDayType, payDayFixed);

        if (cycleTotals.has(cycleId)) {
          const current = cycleTotals.get(cycleId)!;
          current.totalPaid += payment.amount ?? 0;
          cycleTotals.set(cycleId, current);
        }
      }

      // Count item as "paid" in cycle where first payment was made (if fully paid)
      if (item.status === 'paid') {
        let earliestDate: Date | null = null;
        for (const p of payments) {
          const pDate = p.date?.toDate?.() ?? new Date(p.date);
          if (!earliestDate || pDate < earliestDate) earliestDate = pDate;
        }
        if (earliestDate) {
          const cycleId = getCycleIdForDate(earliestDate, payDayType, payDayFixed);
          if (cycleTotals.has(cycleId)) {
            const paidItems = paidItemsPerCycle.get(cycleId)!;
            if (!paidItems.has(doc.id)) {
              const current = cycleTotals.get(cycleId)!;
              current.paidCount += 1;
              cycleTotals.set(cycleId, current);
              paidItems.add(doc.id);
            }
          }
        }
      }
    } else {
      // Item without payments array - use paidDate or fallback to cycleId
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
          const paidItems = paidItemsPerCycle.get(cycleId)!;
          if (!paidItems.has(doc.id)) {
            current.paidCount += 1;
            paidItems.add(doc.id);
          }
        }
        cycleTotals.set(cycleId, current);
      }
    }
  }

  // Update cycles with corrected totals
  const updates: Array<{
    cycleId: string;
    old: { totalCommitted: number; itemCount: number; totalPaid: number; paidCount: number };
    new: CycleTotals;
  }> = [];

  for (const doc of cyclesSnap.docs) {
    const cycle = doc.data();
    const newTotals = cycleTotals.get(doc.id);

    if (newTotals) {
      const oldTotals = {
        totalCommitted: cycle.totalCommitted ?? 0,
        itemCount: cycle.itemCount ?? 0,
        totalPaid: cycle.totalPaid ?? 0,
        paidCount: cycle.paidCount ?? 0,
      };

      // Check if any value changed
      const changed =
        oldTotals.totalCommitted !== newTotals.totalCommitted ||
        oldTotals.itemCount !== newTotals.itemCount ||
        oldTotals.totalPaid !== newTotals.totalPaid ||
        oldTotals.paidCount !== newTotals.paidCount;

      if (changed) {
        await doc.ref.update({
          totalCommitted: newTotals.totalCommitted,
          itemCount: newTotals.itemCount,
          totalPaid: newTotals.totalPaid,
          paidCount: newTotals.paidCount,
          updatedAt: FieldValue.serverTimestamp(),
        });

        updates.push({
          cycleId: doc.id,
          old: oldTotals,
          new: newTotals,
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
