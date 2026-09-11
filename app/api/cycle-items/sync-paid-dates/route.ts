import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getCycleDateRange } from '@/lib/payday-utils';

/**
 * POST /api/cycle-items/sync-paid-dates
 *
 * Fixes items that are paid/partial but missing paidDate.
 * - Items with payments: use earliest payment date
 * - Items without payments: use updatedAt, or estimate from cycle's end date
 */
export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const db = getAdminDb();

  // Get user's payday settings for cycle date estimation
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  const payDayType = userData?.preferences?.payDayType ?? 'last_working_day';
  const payDayFixed = userData?.preferences?.payDayFixed;

  // Find all paid/partial items
  const itemsSnap = await db
    .collection(`users/${userId}/cycleItems`)
    .where('status', 'in', ['paid', 'partial'])
    .get();

  let fixedCount = 0;
  const fixed: Array<{ id: string; label: string; paidDate: string; source: string }> = [];

  for (const doc of itemsSnap.docs) {
    const item = doc.data();

    // Skip if already has paidDate
    if (item.paidDate) continue;

    const payments = item.payments ?? [];
    let paidDate: Date | null = null;
    let source = '';

    if (payments.length > 0) {
      // Use earliest payment date
      for (const payment of payments) {
        const paymentDate = payment.date?.toDate?.() ?? new Date(payment.date);
        if (!paidDate || paymentDate < paidDate) {
          paidDate = paymentDate;
        }
      }
      source = 'payments';
    } else if (item.updatedAt) {
      // Use updatedAt as approximation (when item was marked paid)
      paidDate = item.updatedAt.toDate?.() ?? new Date(item.updatedAt);
      source = 'updatedAt';
    } else if (item.cycleId) {
      // Estimate from cycle's date range (use middle of cycle)
      const [yearStr, monthStr] = item.cycleId.split('-');
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      const { startDate, endDate } = getCycleDateRange(year, month, payDayType, payDayFixed);
      // Use a date in the middle of the cycle
      paidDate = new Date((startDate.getTime() + endDate.getTime()) / 2);
      source = 'cycleEstimate';
    }

    if (paidDate) {
      await doc.ref.update({
        paidDate,
        updatedAt: FieldValue.serverTimestamp(),
      });
      fixedCount++;
      fixed.push({
        id: doc.id,
        label: item.label,
        paidDate: paidDate.toISOString(),
        source,
      });
    }
  }

  return NextResponse.json({
    success: true,
    fixedCount,
    fixed,
  });
}
