import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/cycles/[id]/mark-all-paid
 *
 * Marks all items in a cycle as paid (for recovery/bulk operations)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id: cycleId } = await params;
  const db = getAdminDb();
  const now = FieldValue.serverTimestamp();

  // Get the cycle
  const cycleRef = db.collection(`users/${userId}/cycles`).doc(cycleId);
  const cycleSnap = await cycleRef.get();

  if (!cycleSnap.exists) {
    return NextResponse.json({ error: 'Cycle not found' }, { status: 404 });
  }

  // Get all items for this cycle that aren't already paid or skipped
  const itemsSnap = await db
    .collection(`users/${userId}/cycleItems`)
    .where('cycleId', '==', cycleId)
    .get();

  const batch = db.batch();
  let updatedCount = 0;
  let totalPaid = 0;
  let paidCount = 0;
  let totalCommitted = 0;
  let itemCount = 0;

  for (const doc of itemsSnap.docs) {
    const data = doc.data();

    if (data.status === 'skipped') continue;

    totalCommitted += data.amount || 0;
    itemCount++;

    if (data.status === 'paid' || data.status === 'partial') {
      // Already paid, just count it
      totalPaid += data.totalPaidAmount || data.amount || 0;
      if (data.status === 'paid') paidCount++;
    } else {
      // Mark as paid with amount = committed amount
      batch.update(doc.ref, {
        status: 'paid',
        totalPaidAmount: data.amount || 0,
        paidDate: now,
        updatedAt: now,
      });
      totalPaid += data.amount || 0;
      paidCount++;
      updatedCount++;
    }
  }

  // Update cycle totals
  batch.update(cycleRef, {
    totalCommitted,
    totalPaid,
    itemCount,
    paidCount,
    updatedAt: now,
  });

  await batch.commit();

  return NextResponse.json({
    success: true,
    cycleId,
    updatedCount,
    totalItems: itemCount,
    paidCount,
    totalCommitted,
    totalPaid,
    message: `Marked ${updatedCount} items as paid, cycle totals updated`,
  });
}
