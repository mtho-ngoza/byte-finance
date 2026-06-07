import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';

/**
 * POST /api/cycles/sync-all
 * Recalculates all cycle totals from cycleItems to fix any drift.
 */
export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const db = getAdminDb();

  // Get all cycles
  const cyclesSnap = await db.collection(`users/${userId}/cycles`).get();

  // Get all cycle items
  const itemsSnap = await db.collection(`users/${userId}/cycleItems`).get();

  // Group items by cycleId
  const itemsByCycle = new Map<string, Array<{ amount: number; totalPaidAmount?: number; actualAmount?: number; status: string }>>();
  itemsSnap.docs.forEach((doc) => {
    const item = doc.data();
    const cycleId = item.cycleId;
    if (!itemsByCycle.has(cycleId)) {
      itemsByCycle.set(cycleId, []);
    }
    itemsByCycle.get(cycleId)!.push({
      amount: item.amount ?? 0,
      totalPaidAmount: item.totalPaidAmount,
      actualAmount: item.actualAmount,
      status: item.status,
    });
  });

  // Update each cycle
  const results: Array<{ cycleId: string; totalCommitted: number; totalPaid: number }> = [];
  const batch = db.batch();

  for (const cycleDoc of cyclesSnap.docs) {
    const cycleId = cycleDoc.id;
    const items = itemsByCycle.get(cycleId) ?? [];

    let totalCommitted = 0;
    let totalPaid = 0;
    let itemCount = 0;
    let paidCount = 0;

    items.forEach((item) => {
      itemCount++;
      totalCommitted += item.amount;

      if (item.totalPaidAmount !== undefined) {
        totalPaid += item.totalPaidAmount;
      } else if (item.status === 'paid') {
        totalPaid += item.actualAmount ?? item.amount;
      }

      if (item.status === 'paid') {
        paidCount++;
      }
    });

    batch.update(db.doc(`users/${userId}/cycles/${cycleId}`), {
      totalCommitted,
      totalPaid,
      itemCount,
      paidCount,
    });

    results.push({ cycleId, totalCommitted, totalPaid });
  }

  await batch.commit();

  return NextResponse.json({
    synced: results.length,
    cycles: results,
  });
}
