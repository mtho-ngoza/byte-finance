import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/cycle-items/cleanup-duplicates
 *
 * Cleans up duplicate cycle items:
 * 1. Same commitment + same cycle = true duplicate, DELETE extras
 * 2. Same commitment + different cycles (both unpaid) = mark old as skipped
 */
export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const db = getAdminDb();
  const now = FieldValue.serverTimestamp();

  // Get all cycle items
  const itemsSnap = await db
    .collection(`users/${userId}/cycleItems`)
    .orderBy('createdAt', 'desc')
    .get();

  // Group items by commitmentId + cycleId (to find true duplicates in same cycle)
  const itemsByCycleAndCommitment = new Map<string, Array<{ id: string; data: any; ref: any }>>();

  for (const doc of itemsSnap.docs) {
    const data = doc.data();
    const commitmentId = data.commitmentId;
    const cycleId = data.cycleId;

    if (!commitmentId || !cycleId) continue; // Skip one-off items

    const key = `${cycleId}:${commitmentId}`;
    if (!itemsByCycleAndCommitment.has(key)) {
      itemsByCycleAndCommitment.set(key, []);
    }
    itemsByCycleAndCommitment.get(key)!.push({
      id: doc.id,
      data,
      ref: doc.ref,
    });
  }

  let deletedCount = 0;
  const cyclesToRecalculate = new Set<string>();

  // Find true duplicates (same cycle + same commitment)
  for (const [key, items] of itemsByCycleAndCommitment) {
    if (items.length <= 1) continue; // No duplicates

    // Sort: prefer paid items first, then by createdAt descending
    items.sort((a, b) => {
      // Paid items come first
      const aIsPaid = a.data.status === 'paid' || a.data.status === 'partial';
      const bIsPaid = b.data.status === 'paid' || b.data.status === 'partial';
      if (aIsPaid && !bIsPaid) return -1;
      if (!aIsPaid && bIsPaid) return 1;

      // Then by createdAt descending (newest first)
      const dateA = a.data.createdAt?.toDate?.() || new Date(0);
      const dateB = b.data.createdAt?.toDate?.() || new Date(0);
      return dateB.getTime() - dateA.getTime();
    });

    // Keep the first one (paid or newest), delete the rest
    for (let i = 1; i < items.length; i++) {
      await items[i].ref.delete();
      deletedCount++;
      cyclesToRecalculate.add(items[i].data.cycleId);
    }
  }

  // Recalculate totals for affected cycles
  for (const cycleId of cyclesToRecalculate) {
    const cycleItemsSnap = await db
      .collection(`users/${userId}/cycleItems`)
      .where('cycleId', '==', cycleId)
      .get();

    let totalCommitted = 0;
    let totalPaid = 0;
    let itemCount = 0;
    let paidCount = 0;

    for (const doc of cycleItemsSnap.docs) {
      const item = doc.data();
      if (item.status === 'skipped') continue;

      totalCommitted += item.amount || 0;
      itemCount++;

      if (item.status === 'paid' || item.status === 'partial') {
        totalPaid += item.totalPaidAmount || item.actualAmount || item.amount || 0;
        if (item.status === 'paid') paidCount++;
      }
    }

    await db.collection(`users/${userId}/cycles`).doc(cycleId).update({
      totalCommitted,
      totalPaid,
      itemCount,
      paidCount,
      updatedAt: now,
    });
  }

  return NextResponse.json({
    success: true,
    deletedCount,
    cyclesRecalculated: cyclesToRecalculate.size,
    message: `Deleted ${deletedCount} duplicate items, recalculated ${cyclesToRecalculate.size} cycles`,
  });
}
