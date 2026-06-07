import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';

/**
 * POST /api/cycles/[id]/sync
 * Recalculates cycle totals from cycleItems to fix any drift.
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

  // Get all cycle items for this cycle
  const itemsSnap = await db
    .collection(`users/${userId}/cycleItems`)
    .where('cycleId', '==', cycleId)
    .get();

  // Calculate totals from items
  let totalCommitted = 0;
  let totalPaid = 0;
  let itemCount = 0;
  let paidCount = 0;

  itemsSnap.docs.forEach((doc) => {
    const item = doc.data();
    itemCount++;
    totalCommitted += item.amount ?? 0;

    // Use totalPaidAmount if available, otherwise actualAmount if paid
    if (item.totalPaidAmount !== undefined) {
      totalPaid += item.totalPaidAmount;
    } else if (item.status === 'paid') {
      totalPaid += item.actualAmount ?? item.amount ?? 0;
    }

    if (item.status === 'paid') {
      paidCount++;
    }
  });

  // Update cycle with recalculated totals
  const cycleRef = db.doc(`users/${userId}/cycles/${cycleId}`);
  await cycleRef.update({
    totalCommitted,
    totalPaid,
    itemCount,
    paidCount,
  });

  return NextResponse.json({
    cycleId,
    totalCommitted,
    totalPaid,
    itemCount,
    paidCount,
    synced: true,
  });
}
