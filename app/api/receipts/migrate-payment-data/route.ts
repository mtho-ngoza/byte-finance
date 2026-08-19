import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/receipts/migrate-payment-data
 * One-time migration to populate amount and vendor for receipts linked to payments
 * but missing this data (from before the auto-populate feature was added)
 */
export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const db = getAdminDb();
  const receiptsRef = db.collection(`users/${userId}/receipts`);

  // Find receipts that are linked to cycle items but missing amount or vendor
  const receiptsSnap = await receiptsRef
    .where('cycleItemId', '!=', null)
    .get();

  const receiptsToUpdate: Array<{
    id: string;
    cycleItemId: string;
    cycleId: string;
    hasAmount: boolean;
    hasVendor: boolean;
  }> = [];

  receiptsSnap.forEach((doc) => {
    const receipt = doc.data();
    const missingAmount = !receipt.amountInCents;
    const missingVendor = !receipt.vendor;

    if (missingAmount || missingVendor) {
      receiptsToUpdate.push({
        id: doc.id,
        cycleItemId: receipt.cycleItemId,
        cycleId: receipt.cycleId,
        hasAmount: !missingAmount,
        hasVendor: !missingVendor,
      });
    }
  });

  if (receiptsToUpdate.length === 0) {
    return NextResponse.json({
      message: 'No receipts need updating',
      updated: 0,
    });
  }

  // Update each receipt with data from its linked cycle item
  let updated = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const receipt of receiptsToUpdate) {
    try {
      // Get the cycle item to extract amount and label
      const cycleItemRef = db.collection(`users/${userId}/cycleItems`).doc(receipt.cycleItemId);
      const cycleItemSnap = await cycleItemRef.get();

      if (!cycleItemSnap.exists) {
        errors.push(`Receipt ${receipt.id}: Cycle item ${receipt.cycleItemId} not found`);
        failed++;
        continue;
      }

      const cycleItem = cycleItemSnap.data()!;
      const receiptRef = receiptsRef.doc(receipt.id);

      // Build update object - only update missing fields
      const updateData: any = {
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (!receipt.hasAmount && cycleItem.amount) {
        updateData.amountInCents = cycleItem.amount;
      }

      if (!receipt.hasVendor && cycleItem.label) {
        updateData.vendor = cycleItem.label;
      }

      // Update needsAttention flag
      const willHaveAmount = receipt.hasAmount || cycleItem.amount;
      const willHaveVendor = receipt.hasVendor || cycleItem.label;
      updateData.needsAttention = !(willHaveAmount && willHaveVendor);

      await receiptRef.update(updateData);
      updated++;
    } catch (error) {
      errors.push(`Receipt ${receipt.id}: ${error instanceof Error ? error.message : String(error)}`);
      failed++;
    }
  }

  return NextResponse.json({
    message: `Migration complete`,
    found: receiptsToUpdate.length,
    updated,
    failed,
    errors: errors.length > 0 ? errors : undefined,
  });
}
