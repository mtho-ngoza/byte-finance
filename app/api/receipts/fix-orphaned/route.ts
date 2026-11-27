import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/receipts/fix-orphaned
 *
 * Finds and fixes orphaned receipts - receipts that claim to be linked
 * to a cycle item but the cycle item's payments don't reference them.
 * This can happen when payments were deleted before the receipt unlinking fix.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await withAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const db = getAdminDb();
    const now = FieldValue.serverTimestamp();

    // Get all receipts that claim to be linked to a cycle item
    const receiptsSnap = await db
      .collection(`users/${userId}/receipts`)
      .where('cycleItemId', '!=', null)
      .get();

    const orphaned: Array<{
      receiptId: string;
      cycleItemId: string;
      reason: string;
    }> = [];

    const batch = db.batch();

    for (const receiptDoc of receiptsSnap.docs) {
      const receipt = receiptDoc.data();
      const cycleItemId = receipt.cycleItemId;

      if (!cycleItemId) continue;

      // Check if the cycle item exists
      const cycleItemRef = db.collection(`users/${userId}/cycleItems`).doc(cycleItemId);
      const cycleItemSnap = await cycleItemRef.get();

      if (!cycleItemSnap.exists) {
        // Cycle item doesn't exist - receipt is orphaned
        orphaned.push({
          receiptId: receiptDoc.id,
          cycleItemId,
          reason: 'Cycle item does not exist',
        });
        batch.update(receiptDoc.ref, {
          cycleItemId: null,
          cycleId: null,
          needsAttention: true,
          updatedAt: now,
        });
        continue;
      }

      // Cycle item exists - check if any payment references this receipt
      const cycleItem = cycleItemSnap.data()!;
      const payments: Array<{ receiptId?: string }> = cycleItem.payments ?? [];
      const hasReference = payments.some((p) => p.receiptId === receiptDoc.id);

      if (!hasReference) {
        // No payment references this receipt - it's orphaned
        orphaned.push({
          receiptId: receiptDoc.id,
          cycleItemId,
          reason: 'No payment references this receipt',
        });
        batch.update(receiptDoc.ref, {
          cycleItemId: null,
          cycleId: null,
          needsAttention: true,
          updatedAt: now,
        });
      }
    }

    if (orphaned.length > 0) {
      await batch.commit();
    }

    return NextResponse.json({
      success: true,
      fixedCount: orphaned.length,
      totalLinkedReceipts: receiptsSnap.size,
      orphaned,
    });
  } catch (error) {
    console.error('Error fixing orphaned receipts:', error);
    return NextResponse.json(
      { error: 'Failed to fix orphaned receipts' },
      { status: 500 }
    );
  }
}
