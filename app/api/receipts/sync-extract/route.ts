import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/receipts/sync-extract
 *
 * Clears needsAttention for receipts that are linked to payments.
 * Vendor is optional - being linked to a cycle item provides context.
 */
export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const db = getAdminDb();

  // Find receipts needing attention
  const receiptsSnap = await db
    .collection(`users/${userId}/receipts`)
    .where('needsAttention', '==', true)
    .get();

  let clearedCount = 0;
  const cleared: string[] = [];

  for (const doc of receiptsSnap.docs) {
    const receipt = doc.data();

    // Clear needsAttention if receipt is linked to a cycle item (has context)
    if (receipt.cycleItemId) {
      await doc.ref.update({
        needsAttention: false,
        updatedAt: FieldValue.serverTimestamp(),
      });
      clearedCount++;
      cleared.push(doc.id);
    }
  }

  // Count remaining unlinked receipts
  const remainingSnap = await db
    .collection(`users/${userId}/receipts`)
    .where('needsAttention', '==', true)
    .count()
    .get();

  return NextResponse.json({
    clearedCount,
    cleared,
    remainingUnlinked: remainingSnap.data().count,
  });
}
