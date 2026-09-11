import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getCycleDateRange } from '@/lib/payday-utils';

interface CycleTotals {
  totalCommitted: number;
  itemCount: number;
  totalPaid: number;
  paidCount: number;
}

/**
 * POST /api/cycles/sync-totals
 *
 * Recalculates cycle totals using the SAME logic as useCycleItems hook:
 * - Unpaid items (upcoming/due): by cycleId
 * - Paid/partial items: by earliest payment date within cycle's date range
 * - Skipped items: by cycleId (not counted in totals)
 *
 * This ensures history page matches cycle detail page exactly.
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

  // Get ALL cycle items
  const allItemsSnap = await db.collection(`users/${userId}/cycleItems`).get();
  const allItems = allItemsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as {
    id: string;
    cycleId?: string;
    status?: string;
    amount?: number;
    paidDate?: { toDate?: () => Date } | string;
    payments?: Array<{ date?: { toDate?: () => Date } | string; amount?: number }>;
    totalPaidAmount?: number;
    actualAmount?: number;
  }));

  // Build date ranges for each cycle
  const cycleDateRanges = new Map<string, { startDate: Date; endDate: Date }>();
  for (const doc of cyclesSnap.docs) {
    const [yearStr, monthStr] = doc.id.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const { startDate, endDate } = getCycleDateRange(year, month, payDayType, payDayFixed);
    cycleDateRanges.set(doc.id, { startDate, endDate });
  }

  // Helper to get earliest payment date from an item
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

  // Calculate totals for each cycle using same logic as useCycleItems
  const cycleTotals = new Map<string, CycleTotals>();

  for (const doc of cyclesSnap.docs) {
    const cycleId = doc.id;
    const dateRange = cycleDateRanges.get(cycleId);
    if (!dateRange) continue;

    const { startDate, endDate } = dateRange;
    const itemsInCycle = new Set<string>();

    // 1. Add unpaid items (upcoming/due) from this cycle by cycleId
    for (const item of allItems) {
      if (item.cycleId === cycleId && (item.status === 'upcoming' || item.status === 'due')) {
        itemsInCycle.add(item.id);
      }
    }

    // 2. Add paid/partial items where earliest payment falls within date range
    for (const item of allItems) {
      if (item.status === 'paid' || item.status === 'partial') {
        const paymentDate = getEarliestPaymentDate(item);
        if (paymentDate && paymentDate >= startDate && paymentDate <= endDate) {
          itemsInCycle.add(item.id);
        }
      }
    }

    // 3. Add skipped items from this cycle by cycleId (but don't count in totals)
    const skippedInCycle = new Set<string>();
    for (const item of allItems) {
      if (item.cycleId === cycleId && item.status === 'skipped') {
        skippedInCycle.add(item.id);
      }
    }

    // Calculate totals from items in this cycle
    let totalCommitted = 0;
    let itemCount = 0;
    let totalPaid = 0;
    let paidCount = 0;

    for (const item of allItems) {
      if (!itemsInCycle.has(item.id)) continue;

      // Count toward committed (non-skipped items)
      totalCommitted += (item.amount as number) ?? 0;
      itemCount += 1;

      // Calculate paid amount (only payments within this cycle's date range)
      if (item.status === 'paid' || item.status === 'partial') {
        const payments = (item.payments ?? []) as Array<{ date?: { toDate?: () => Date } | string; amount?: number }>;

        if (payments.length > 0) {
          // Sum only payments within date range
          for (const p of payments) {
            const pDate = p.date && typeof p.date === 'object' && 'toDate' in p.date
              ? p.date.toDate?.() ?? new Date()
              : new Date(p.date as string);
            if (pDate >= startDate && pDate <= endDate) {
              totalPaid += p.amount ?? 0;
            }
          }
        } else {
          // No payments array - use totalPaidAmount if item belongs to this cycle
          const paidDate = getEarliestPaymentDate(item);
          if (paidDate && paidDate >= startDate && paidDate <= endDate) {
            totalPaid += (item.totalPaidAmount as number) ?? (item.actualAmount as number) ?? (item.amount as number) ?? 0;
          }
        }

        // Count as paid item if fully paid
        if (item.status === 'paid') {
          paidCount += 1;
        }
      }
    }

    cycleTotals.set(cycleId, { totalCommitted, itemCount, totalPaid, paidCount });
  }

  // Update cycles with corrected totals
  const updates: Array<{
    cycleId: string;
    old: CycleTotals;
    new: CycleTotals;
  }> = [];

  for (const doc of cyclesSnap.docs) {
    const cycle = doc.data();
    const newTotals = cycleTotals.get(doc.id);

    if (newTotals) {
      const oldTotals: CycleTotals = {
        totalCommitted: cycle.totalCommitted ?? 0,
        itemCount: cycle.itemCount ?? 0,
        totalPaid: cycle.totalPaid ?? 0,
        paidCount: cycle.paidCount ?? 0,
      };

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
