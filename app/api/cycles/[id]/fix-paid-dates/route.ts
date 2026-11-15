import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

/**
 * POST /api/cycles/[id]/fix-paid-dates
 *
 * Fixes paidDate for items that have paidDate outside the cycle's date range.
 * Sets paidDate to be within the cycle's date range (middle of the cycle).
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

  const cycle = cycleSnap.data();
  const startDate = cycle?.startDate?.toDate?.() || new Date();
  const endDate = cycle?.endDate?.toDate?.() || new Date();

  // Calculate a date in the middle of the cycle for items that need fixing
  const middleDate = new Date((startDate.getTime() + endDate.getTime()) / 2);

  // Get all items for this cycle
  const itemsSnap = await db
    .collection(`users/${userId}/cycleItems`)
    .where('cycleId', '==', cycleId)
    .get();

  const batch = db.batch();
  let fixedCount = 0;

  for (const doc of itemsSnap.docs) {
    const item = doc.data();

    // Only fix paid/partial items
    if (item.status !== 'paid' && item.status !== 'partial') continue;

    // Check if paidDate is outside the cycle range
    const paidDate = item.paidDate?.toDate?.();
    if (!paidDate) {
      // No paidDate set, set it to middle of cycle
      batch.update(doc.ref, {
        paidDate: Timestamp.fromDate(middleDate),
        updatedAt: now,
      });
      fixedCount++;
    } else if (paidDate < startDate || paidDate > endDate) {
      // paidDate is outside cycle range, fix it
      batch.update(doc.ref, {
        paidDate: Timestamp.fromDate(middleDate),
        updatedAt: now,
      });
      fixedCount++;
    }
  }

  if (fixedCount > 0) {
    await batch.commit();
  }

  return NextResponse.json({
    success: true,
    cycleId,
    cycleRange: {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    },
    fixedPaidDateTo: middleDate.toISOString(),
    fixedCount,
    totalItems: itemsSnap.size,
  });
}
