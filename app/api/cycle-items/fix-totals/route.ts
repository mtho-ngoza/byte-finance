import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/cycle-items/fix-totals
 *
 * Recalculates totalPaidAmount for all cycle items based on actual payments.
 * Fixes inconsistencies where totalPaidAmount doesn't match sum of payments.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await withAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const db = getAdminDb();
    const now = FieldValue.serverTimestamp();

    // Get all cycle items
    const cycleItemsSnap = await db
      .collection(`users/${userId}/cycleItems`)
      .get();

    const fixes: Array<{
      cycleItemId: string;
      name: string;
      oldTotal: number;
      newTotal: number;
      paymentsCount: number;
    }> = [];

    const batch = db.batch();

    // Track cycle adjustments
    const cycleAdjustments = new Map<string, number>();

    for (const doc of cycleItemsSnap.docs) {
      const item = doc.data();
      const payments: Array<{ amount: number }> = item.payments ?? [];

      const actualTotal = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const storedTotal = item.totalPaidAmount || 0;

      if (Math.abs(actualTotal - storedTotal) > 0.01) {
        // Total mismatch - fix it
        fixes.push({
          cycleItemId: doc.id,
          name: item.name || 'Unknown',
          oldTotal: storedTotal,
          newTotal: actualTotal,
          paymentsCount: payments.length,
        });

        // Determine correct status
        let newStatus = item.status;
        if (payments.length === 0) {
          newStatus = 'upcoming';
        } else if (actualTotal >= item.amount) {
          newStatus = 'paid';
        } else {
          newStatus = 'partial';
        }

        batch.update(doc.ref, {
          totalPaidAmount: actualTotal,
          status: newStatus,
          updatedAt: now,
        });

        // Track adjustment for cycle totalPaid
        const cycleId = item.cycleId;
        if (cycleId) {
          const diff = actualTotal - storedTotal;
          cycleAdjustments.set(cycleId, (cycleAdjustments.get(cycleId) || 0) + diff);
        }
      }
    }

    // Apply cycle totalPaid adjustments
    for (const [cycleId, adjustment] of cycleAdjustments) {
      if (Math.abs(adjustment) > 0.01) {
        const cycleRef = db.collection(`users/${userId}/cycles`).doc(cycleId);
        batch.update(cycleRef, {
          totalPaid: FieldValue.increment(adjustment),
          updatedAt: now,
        });
      }
    }

    if (fixes.length > 0) {
      await batch.commit();
    }

    return NextResponse.json({
      success: true,
      fixedCount: fixes.length,
      totalItems: cycleItemsSnap.size,
      cycleAdjustments: Object.fromEntries(cycleAdjustments),
      fixes,
    });
  } catch (error) {
    console.error('Error fixing cycle item totals:', error);
    return NextResponse.json(
      { error: 'Failed to fix cycle item totals' },
      { status: 500 }
    );
  }
}
