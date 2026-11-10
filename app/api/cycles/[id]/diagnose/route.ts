import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';

/**
 * GET /api/cycles/[id]/diagnose
 *
 * Diagnostic endpoint to see all items in a cycle and their statuses
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id: cycleId } = await params;
  const db = getAdminDb();

  // Get the cycle
  const cycleRef = db.collection(`users/${userId}/cycles`).doc(cycleId);
  const cycleSnap = await cycleRef.get();

  if (!cycleSnap.exists) {
    return NextResponse.json({ error: 'Cycle not found' }, { status: 404 });
  }

  const cycle = cycleSnap.data();

  // Get all items for this cycle
  const itemsSnap = await db
    .collection(`users/${userId}/cycleItems`)
    .where('cycleId', '==', cycleId)
    .get();

  const items = itemsSnap.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      label: data.label,
      amount: data.amount,
      status: data.status,
      totalPaidAmount: data.totalPaidAmount,
      paidDate: data.paidDate?.toDate?.()?.toISOString() || null,
      payments: data.payments?.length || 0,
      receiptId: data.receiptId || null,
      commitmentId: data.commitmentId,
      skippedReason: data.skippedReason || null,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
    };
  });

  // Count by status
  const statusCounts: Record<string, number> = {};
  let calculatedTotalCommitted = 0;
  let calculatedTotalPaid = 0;
  let calculatedItemCount = 0;
  let calculatedPaidCount = 0;

  for (const item of items) {
    statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;

    if (item.status !== 'skipped') {
      calculatedTotalCommitted += item.amount || 0;
      calculatedItemCount++;

      if (item.status === 'paid' || item.status === 'partial') {
        calculatedTotalPaid += item.totalPaidAmount || item.amount || 0;
        if (item.status === 'paid') calculatedPaidCount++;
      }
    }
  }

  return NextResponse.json({
    cycleId,
    cycleData: {
      totalCommitted: cycle?.totalCommitted,
      totalPaid: cycle?.totalPaid,
      itemCount: cycle?.itemCount,
      paidCount: cycle?.paidCount,
    },
    calculated: {
      totalCommitted: calculatedTotalCommitted,
      totalPaid: calculatedTotalPaid,
      itemCount: calculatedItemCount,
      paidCount: calculatedPaidCount,
    },
    totalItemsInDb: items.length,
    statusCounts,
    items: items.sort((a, b) => (a.label || '').localeCompare(b.label || '')),
  });
}
