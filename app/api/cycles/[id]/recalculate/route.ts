import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/cycles/[id]/recalculate
 *
 * Recalculates cycle totals based on items and their payment dates.
 * Uses calendar month date ranges (matching how cycles work in the UI).
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

  // Get the cycle
  const cycleRef = db.collection(`users/${userId}/cycles`).doc(cycleId);
  const cycleSnap = await cycleRef.get();

  if (!cycleSnap.exists) {
    return NextResponse.json({ error: 'Cycle not found' }, { status: 404 });
  }

  const cycleData = cycleSnap.data()!;
  const startDate = cycleData.startDate.toDate();
  startDate.setHours(0, 0, 0, 0);
  const endDate = cycleData.endDate.toDate();
  endDate.setHours(23, 59, 59, 999);

  // Get all items with this cycleId
  const itemsSnap = await db
    .collection(`users/${userId}/cycleItems`)
    .where('cycleId', '==', cycleId)
    .get();

  // Also get items that might have been paid in this cycle's date range
  const paidItemsSnap = await db
    .collection(`users/${userId}/cycleItems`)
    .where('paidDate', '>=', cycleData.startDate)
    .where('paidDate', '<=', cycleData.endDate)
    .get();

  // Combine and deduplicate
  const allItems = new Map<string, FirebaseFirestore.DocumentSnapshot>();
  for (const doc of itemsSnap.docs) {
    allItems.set(doc.id, doc);
  }
  for (const doc of paidItemsSnap.docs) {
    allItems.set(doc.id, doc);
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

  // Calculate totals
  let totalCommitted = 0;
  let totalPaid = 0;
  let itemCount = 0;
  let paidCount = 0;

  for (const [, docSnap] of allItems) {
    const item = docSnap.data()!;

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

  // Update cycle
  await cycleRef.update({
    totalCommitted,
    totalPaid,
    itemCount,
    paidCount,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({
    success: true,
    cycleId,
    before: {
      totalCommitted: cycleData.totalCommitted,
      totalPaid: cycleData.totalPaid,
      itemCount: cycleData.itemCount,
      paidCount: cycleData.paidCount,
    },
    after: {
      totalCommitted,
      totalPaid,
      itemCount,
      paidCount,
    },
  });
}
