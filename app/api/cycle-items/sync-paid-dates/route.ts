import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/cycle-items/sync-paid-dates
 *
 * Fixes items that have payments but no paidDate set.
 * Sets paidDate to the earliest payment date.
 */
export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const db = getAdminDb();

  // Find items with payments but no paidDate
  const itemsSnap = await db
    .collection(`users/${userId}/cycleItems`)
    .where('status', 'in', ['paid', 'partial'])
    .get();

  let fixedCount = 0;
  const fixed: string[] = [];

  for (const doc of itemsSnap.docs) {
    const item = doc.data();
    const payments = item.payments ?? [];

    // Skip if already has paidDate or no payments
    if (item.paidDate || payments.length === 0) continue;

    // Find earliest payment date
    let earliestDate: Date | null = null;
    for (const payment of payments) {
      const paymentDate = payment.date?.toDate?.() ?? new Date(payment.date);
      if (!earliestDate || paymentDate < earliestDate) {
        earliestDate = paymentDate;
      }
    }

    if (earliestDate) {
      await doc.ref.update({
        paidDate: earliestDate,
        updatedAt: FieldValue.serverTimestamp(),
      });
      fixedCount++;
      fixed.push(doc.id);
    }
  }

  return NextResponse.json({
    success: true,
    fixedCount,
    fixed,
  });
}
