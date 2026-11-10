import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/cycle-items/cleanup-duplicates
 *
 * Cleans up duplicate cycle items by keeping only the most recent one per commitment
 * and marking older unpaid items as skipped.
 */
export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const db = getAdminDb();
  const now = FieldValue.serverTimestamp();

  // Get all cycle items
  const itemsSnap = await db
    .collection(`users/${userId}/cycleItems`)
    .orderBy('createdAt', 'desc')
    .get();

  // Group items by commitmentId
  const itemsByCommitment = new Map<string, Array<{ id: string; data: any; ref: any }>>();

  for (const doc of itemsSnap.docs) {
    const data = doc.data();
    const commitmentId = data.commitmentId;

    if (!commitmentId) continue; // Skip one-off items without commitmentId

    if (!itemsByCommitment.has(commitmentId)) {
      itemsByCommitment.set(commitmentId, []);
    }
    itemsByCommitment.get(commitmentId)!.push({
      id: doc.id,
      data,
      ref: doc.ref,
    });
  }

  // Find duplicates: multiple unpaid items for the same commitment
  const batch = db.batch();
  let skippedCount = 0;

  for (const [commitmentId, items] of itemsByCommitment) {
    // Filter to only unpaid items (upcoming, due)
    const unpaidItems = items.filter(
      item => item.data.status === 'upcoming' || item.data.status === 'due'
    );

    if (unpaidItems.length <= 1) continue; // No duplicates

    // Sort by createdAt descending (newest first)
    unpaidItems.sort((a, b) => {
      const dateA = a.data.createdAt?.toDate?.() || new Date(0);
      const dateB = b.data.createdAt?.toDate?.() || new Date(0);
      return dateB.getTime() - dateA.getTime();
    });

    // Keep the newest one, skip the rest
    for (let i = 1; i < unpaidItems.length; i++) {
      batch.update(unpaidItems[i].ref, {
        status: 'skipped',
        updatedAt: now,
      });
      skippedCount++;
    }
  }

  if (skippedCount > 0) {
    await batch.commit();
  }

  return NextResponse.json({
    success: true,
    skippedCount,
    message: `Marked ${skippedCount} duplicate items as skipped`,
  });
}
