import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/wishlist/sync
 * Sync all wishlist items with their linked goals/commitments
 * Updates progress and auto-completes items when goals are achieved
 */
export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const db = getAdminDb();

  // Get all active wishlist items
  const wishlistSnap = await db
    .collection(`users/${userId}/wishlist`)
    .where('status', '==', 'active')
    .get();

  if (wishlistSnap.empty) {
    return NextResponse.json({ updated: 0 });
  }

  // Get all goals for reference
  const goalsSnap = await db.collection(`users/${userId}/goals`).get();
  const goalsMap = new Map<string, FirebaseFirestore.DocumentData>();
  goalsSnap.docs.forEach((doc) => {
    goalsMap.set(doc.id, { id: doc.id, ...doc.data() });
  });

  const batch = db.batch();
  let updatedCount = 0;

  for (const doc of wishlistSnap.docs) {
    const item = doc.data();
    const updates: Record<string, unknown> = {};

    // Sync with linked goal
    if (item.linkedGoalId && goalsMap.has(item.linkedGoalId)) {
      const goal = goalsMap.get(item.linkedGoalId)!;
      const currentAmount = goal.currentAmount || 0;
      const targetAmount = goal.targetAmount || 0;
      const progress = targetAmount > 0 ? Math.min(100, Math.round((currentAmount / targetAmount) * 100)) : 0;

      if (item.currentAmount !== currentAmount || item.progress !== progress) {
        updates.currentAmount = currentAmount;
        updates.targetAmount = targetAmount;
        updates.progress = progress;
        updates.updatedAt = FieldValue.serverTimestamp();
      }

      // Auto-complete if goal is completed
      if (goal.status === 'completed' && item.status !== 'completed') {
        updates.status = 'completed';
        updates.progress = 100;
        updates.completedAt = FieldValue.serverTimestamp();
        updates.updatedAt = FieldValue.serverTimestamp();
      }
    }

    if (Object.keys(updates).length > 0) {
      batch.update(doc.ref, updates);
      updatedCount++;
    }
  }

  if (updatedCount > 0) {
    await batch.commit();
  }

  return NextResponse.json({ updated: updatedCount });
}
