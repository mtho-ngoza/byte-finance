import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * GET /api/receipts/sync-links
 * Check receipt linking status - shows which receipts should be linked
 */
export async function GET(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const db = getAdminDb();

  // Get all receipts
  const receiptsSnap = await db.collection(`users/${userId}/receipts`).get();
  const receipts = receiptsSnap.docs.map((d) => ({
    id: d.id,
    cycleItemId: d.data().cycleItemId,
    cycleId: d.data().cycleId,
    vendor: d.data().vendor,
  }));

  // Get all cycle items with receiptId or payments with receiptId
  const cycleItemsSnap = await db.collection(`users/${userId}/cycleItems`).get();

  const linkedFromItems: Array<{ receiptId: string; cycleItemId: string; cycleId: string; via: string }> = [];

  cycleItemsSnap.docs.forEach((doc) => {
    const data = doc.data();

    // Direct item-level receipt link
    if (data.receiptId) {
      linkedFromItems.push({
        receiptId: data.receiptId,
        cycleItemId: doc.id,
        cycleId: data.cycleId,
        via: 'item.receiptId',
      });
    }

    // Payment-level receipt links
    if (data.payments && Array.isArray(data.payments)) {
      data.payments.forEach((payment: { receiptId?: string }) => {
        if (payment.receiptId) {
          linkedFromItems.push({
            receiptId: payment.receiptId,
            cycleItemId: doc.id,
            cycleId: data.cycleId,
            via: 'payment.receiptId',
          });
        }
      });
    }
  });

  // Find receipts that are linked from items but don't have cycleItemId set
  const needsUpdate = linkedFromItems.filter((link) => {
    const receipt = receipts.find((r) => r.id === link.receiptId);
    return receipt && !receipt.cycleItemId;
  });

  // Find receipts with cycleItemId set
  const alreadyLinked = receipts.filter((r) => r.cycleItemId);

  return NextResponse.json({
    totalReceipts: receipts.length,
    linkedFromItems: linkedFromItems.length,
    alreadyLinked: alreadyLinked.length,
    needsUpdate: needsUpdate.length,
    details: {
      needsUpdate,
      alreadyLinked: alreadyLinked.map((r) => ({ id: r.id, cycleItemId: r.cycleItemId, vendor: r.vendor })),
    },
  });
}

/**
 * POST /api/receipts/sync-links
 * Fix receipt linking - updates receipts that should have cycleItemId set
 */
export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const db = getAdminDb();
  const now = FieldValue.serverTimestamp();

  // Get all cycle items with receiptId or payments with receiptId
  const cycleItemsSnap = await db.collection(`users/${userId}/cycleItems`).get();

  const linkedFromItems: Array<{ receiptId: string; cycleItemId: string; cycleId: string }> = [];

  cycleItemsSnap.docs.forEach((doc) => {
    const data = doc.data();

    // Direct item-level receipt link
    if (data.receiptId) {
      linkedFromItems.push({
        receiptId: data.receiptId,
        cycleItemId: doc.id,
        cycleId: data.cycleId,
      });
    }

    // Payment-level receipt links
    if (data.payments && Array.isArray(data.payments)) {
      data.payments.forEach((payment: { receiptId?: string }) => {
        if (payment.receiptId) {
          linkedFromItems.push({
            receiptId: payment.receiptId,
            cycleItemId: doc.id,
            cycleId: data.cycleId,
          });
        }
      });
    }
  });

  // Update each receipt that's linked
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const link of linkedFromItems) {
    try {
      const receiptRef = db.collection(`users/${userId}/receipts`).doc(link.receiptId);
      const receiptDoc = await receiptRef.get();

      if (!receiptDoc.exists) {
        skipped++;
        continue;
      }

      const currentData = receiptDoc.data()!;

      // Only update if cycleItemId is not already set
      if (!currentData.cycleItemId) {
        await receiptRef.update({
          cycleItemId: link.cycleItemId,
          cycleId: link.cycleId,
          updatedAt: now,
        });
        updated++;
      } else {
        skipped++;
      }
    } catch (err) {
      console.error(`Failed to update receipt ${link.receiptId}:`, err);
      errors++;
    }
  }

  return NextResponse.json({
    success: true,
    updated,
    skipped,
    errors,
    total: linkedFromItems.length,
  });
}
