import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/cycle-items/cleanup-duplicates
 *
 * SAFE cleanup of duplicate cycle items:
 * - NEVER deletes anything
 * - Only marks items as skipped
 * - Has dry-run mode by default
 *
 * Query params:
 * - dryRun=false to actually make changes (default: true)
 */
export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get('dryRun') !== 'false';

  const db = getAdminDb();
  const now = FieldValue.serverTimestamp();

  // Get all cycle items
  const itemsSnap = await db
    .collection(`users/${userId}/cycleItems`)
    .orderBy('createdAt', 'desc')
    .get();

  // Group items by commitmentId + cycleId (to find duplicates in same cycle)
  const itemsByCycleAndCommitment = new Map<string, Array<{ id: string; data: any; ref: any }>>();

  for (const doc of itemsSnap.docs) {
    const data = doc.data();
    const commitmentId = data.commitmentId;
    const cycleId = data.cycleId;

    if (!commitmentId || !cycleId) continue; // Skip one-off items

    const key = `${cycleId}:${commitmentId}`;
    if (!itemsByCycleAndCommitment.has(key)) {
      itemsByCycleAndCommitment.set(key, []);
    }
    itemsByCycleAndCommitment.get(key)!.push({
      id: doc.id,
      data,
      ref: doc.ref,
    });
  }

  const duplicates: Array<{
    cycleId: string;
    commitmentId: string;
    label: string;
    kept: { id: string; status: string };
    wouldSkip: Array<{ id: string; status: string }>;
  }> = [];

  let skippedCount = 0;
  const cyclesToRecalculate = new Set<string>();

  // Find duplicates (same cycle + same commitment)
  for (const [key, items] of itemsByCycleAndCommitment) {
    if (items.length <= 1) continue; // No duplicates

    // Sort: prefer paid items first, then by createdAt descending
    items.sort((a, b) => {
      // Paid items come first
      const aIsPaid = a.data.status === 'paid' || a.data.status === 'partial';
      const bIsPaid = b.data.status === 'paid' || b.data.status === 'partial';
      if (aIsPaid && !bIsPaid) return -1;
      if (!aIsPaid && bIsPaid) return 1;

      // Then by createdAt descending (newest first)
      const dateA = a.data.createdAt?.toDate?.() || new Date(0);
      const dateB = b.data.createdAt?.toDate?.() || new Date(0);
      return dateB.getTime() - dateA.getTime();
    });

    // Keep the first one (paid or newest), mark rest as skipped (NOT deleted)
    const kept = items[0];
    const toSkip = items.slice(1).filter(item => item.data.status !== 'skipped');

    if (toSkip.length === 0) continue; // All duplicates already skipped

    duplicates.push({
      cycleId: kept.data.cycleId,
      commitmentId: kept.data.commitmentId,
      label: kept.data.label,
      kept: { id: kept.id, status: kept.data.status },
      wouldSkip: toSkip.map(item => ({ id: item.id, status: item.data.status })),
    });

    if (!dryRun) {
      for (const item of toSkip) {
        await item.ref.update({
          status: 'skipped',
          skippedReason: 'duplicate_cleanup',
          updatedAt: now,
        });
        skippedCount++;
        cyclesToRecalculate.add(item.data.cycleId);
      }
    } else {
      skippedCount += toSkip.length;
    }
  }

  // Recalculate totals for affected cycles (only if not dry run)
  if (!dryRun) {
    for (const cycleId of cyclesToRecalculate) {
      const cycleItemsSnap = await db
        .collection(`users/${userId}/cycleItems`)
        .where('cycleId', '==', cycleId)
        .get();

      let totalCommitted = 0;
      let totalPaid = 0;
      let itemCount = 0;
      let paidCount = 0;

      for (const doc of cycleItemsSnap.docs) {
        const item = doc.data();
        if (item.status === 'skipped') continue;

        totalCommitted += item.amount || 0;
        itemCount++;

        if (item.status === 'paid' || item.status === 'partial') {
          totalPaid += item.totalPaidAmount || item.actualAmount || item.amount || 0;
          if (item.status === 'paid') paidCount++;
        }
      }

      await db.collection(`users/${userId}/cycles`).doc(cycleId).update({
        totalCommitted,
        totalPaid,
        itemCount,
        paidCount,
        updatedAt: now,
      });
    }
  }

  return NextResponse.json({
    success: true,
    dryRun,
    duplicatesFound: duplicates.length,
    wouldSkipCount: skippedCount,
    skippedCount: dryRun ? 0 : skippedCount,
    cyclesAffected: cyclesToRecalculate.size,
    duplicates,
    message: dryRun
      ? `DRY RUN: Found ${duplicates.length} duplicate groups, would skip ${skippedCount} items. Run with ?dryRun=false to apply.`
      : `Skipped ${skippedCount} duplicate items, recalculated ${cyclesToRecalculate.size} cycles. NO items were deleted.`,
  });
}
