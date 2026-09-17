import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/cycles/recalculate-all
 *
 * Recalculates totals for all cycles based on items and their payment dates.
 * Uses calendar month date ranges (matching how cycles work in the UI).
 */
export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const db = getAdminDb();

  // Get all cycles
  const cyclesSnap = await db
    .collection(`users/${userId}/cycles`)
    .orderBy('startDate', 'desc')
    .get();

  // Get all cycle items
  const itemsSnap = await db.collection(`users/${userId}/cycleItems`).get();

  // Index items by ID
  const itemsById = new Map<string, FirebaseFirestore.DocumentData>();
  for (const doc of itemsSnap.docs) {
    itemsById.set(doc.id, { id: doc.id, ...doc.data() });
  }

  // Helper to get earliest payment date
  const getPaymentDate = (item: FirebaseFirestore.DocumentData): Date | null => {
    if (item.paidDate) {
      return item.paidDate.toDate?.() ?? new Date(item.paidDate);
    }
    if (item.payments && item.payments.length > 0) {
      let earliest: Date | null = null;
      for (const p of item.payments) {
        const pDate = p.date?.toDate?.() ?? new Date(p.date);
        if (!earliest || pDate < earliest) {
          earliest = pDate;
        }
      }
      return earliest;
    }
    return null;
  };

  const results: Array<{
    cycleId: string;
    before: { totalCommitted: number; totalPaid: number; itemCount: number; paidCount: number };
    after: { totalCommitted: number; totalPaid: number; itemCount: number; paidCount: number };
    changed: boolean;
  }> = [];

  for (const cycleDoc of cyclesSnap.docs) {
    const cycleId = cycleDoc.id;
    const cycleData = cycleDoc.data();
    const startDate = cycleData.startDate.toDate();
    startDate.setHours(0, 0, 0, 0);
    const endDate = cycleData.endDate.toDate();
    endDate.setHours(23, 59, 59, 999);

    // Calculate totals for this cycle
    let totalCommitted = 0;
    let totalPaid = 0;
    let itemCount = 0;
    let paidCount = 0;

    for (const item of itemsById.values()) {
      // Unpaid items: count if they belong to this cycle
      if (item.status === 'upcoming' || item.status === 'due' || item.status === 'skipped') {
        if (item.cycleId === cycleId) {
          totalCommitted += item.amount ?? 0;
          itemCount++;
        }
        continue;
      }

      // Paid/partial items: count if payment is within this cycle's date range
      const paymentDate = getPaymentDate(item);
      if (!paymentDate) continue;

      const inRange = paymentDate >= startDate && paymentDate <= endDate;
      if (!inRange) continue;

      totalCommitted += item.amount ?? 0;
      itemCount++;

      // Sum payments within this cycle's date range
      if (item.payments && item.payments.length > 0) {
        for (const p of item.payments) {
          const pDate = p.date?.toDate?.() ?? new Date(p.date);
          if (pDate >= startDate && pDate <= endDate) {
            totalPaid += p.amount ?? 0;
          }
        }
      } else {
        // No payments array, use totalPaidAmount or actualAmount
        totalPaid += item.totalPaidAmount ?? item.actualAmount ?? item.amount ?? 0;
      }

      if (item.status === 'paid') {
        paidCount++;
      }
    }

    const before = {
      totalCommitted: cycleData.totalCommitted ?? 0,
      totalPaid: cycleData.totalPaid ?? 0,
      itemCount: cycleData.itemCount ?? 0,
      paidCount: cycleData.paidCount ?? 0,
    };

    const after = { totalCommitted, totalPaid, itemCount, paidCount };

    const changed =
      before.totalCommitted !== after.totalCommitted ||
      before.totalPaid !== after.totalPaid ||
      before.itemCount !== after.itemCount ||
      before.paidCount !== after.paidCount;

    if (changed) {
      await cycleDoc.ref.update({
        totalCommitted,
        totalPaid,
        itemCount,
        paidCount,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    results.push({ cycleId, before, after, changed });
  }

  const changedCount = results.filter((r) => r.changed).length;

  return NextResponse.json({
    success: true,
    totalCycles: results.length,
    changedCycles: changedCount,
    results,
  });
}
