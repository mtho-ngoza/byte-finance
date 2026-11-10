import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

/**
 * POST /api/cycles/[id]/regenerate
 *
 * Regenerates cycle items from commitments for a cycle that has lost its items.
 * WARNING: This will NOT recover payment history, receipts, or actual amounts paid.
 * Only use this for recovery when items have been accidentally deleted.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id: cycleId } = await params;
  const db = getAdminDb();
  const now = FieldValue.serverTimestamp();

  // Get the cycle
  const cycleRef = db.collection(`users/${userId}/cycles`).doc(cycleId);
  const cycleSnap = await cycleRef.get();

  if (!cycleSnap.exists) {
    return NextResponse.json({ error: 'Cycle not found' }, { status: 404 });
  }

  const cycle = cycleSnap.data();
  const startDate = cycle?.startDate?.toDate?.() || new Date();

  // Check existing items for this cycle
  const existingItemsSnap = await db
    .collection(`users/${userId}/cycleItems`)
    .where('cycleId', '==', cycleId)
    .get();

  const existingCommitmentIds = new Set(
    existingItemsSnap.docs.map(d => d.data().commitmentId).filter(Boolean)
  );

  // Get all commitments (active and inactive - we want to regenerate what might have been there)
  const commitmentsSnap = await db
    .collection(`users/${userId}/commitments`)
    .orderBy('sortOrder')
    .get();

  const commitments = commitmentsSnap.docs.map(d => ({
    id: d.id,
    ...d.data(),
  }));

  // Only create items for commitments that don't already exist in this cycle
  const missingCommitments = commitments.filter(
    c => !existingCommitmentIds.has(c.id)
  );

  if (missingCommitments.length === 0) {
    return NextResponse.json({
      success: true,
      message: 'No missing items to regenerate',
      existingCount: existingItemsSnap.size,
      regeneratedCount: 0,
    });
  }

  const batch = db.batch();
  let regeneratedCount = 0;

  for (let i = 0; i < missingCommitments.length; i++) {
    const c = missingCommitments[i] as {
      id: string;
      label: string;
      amount: number;
      category: string;
      accountType: string;
      linkedGoalId?: string;
      dueDay?: number;
      isVariable?: boolean;
      isActive?: boolean;
    };

    const itemRef = db.collection(`users/${userId}/cycleItems`).doc();
    batch.set(itemRef, {
      cycleId,
      commitmentId: c.id,
      label: c.label,
      amount: c.amount,
      category: c.category,
      accountType: c.accountType,
      // Mark as upcoming - user will need to manually update status if it was paid
      status: 'upcoming',
      linkedGoalId: c.linkedGoalId ?? null,
      isVariable: c.isVariable ?? false,
      dueDate: c.dueDay
        ? Timestamp.fromDate(
            new Date(startDate.getFullYear(), startDate.getMonth(), c.dueDay)
          )
        : null,
      sortOrder: existingItemsSnap.size + i,
      payments: [],
      totalPaidAmount: 0,
      paidDate: null,
      // Mark as regenerated for tracking
      regenerated: true,
      regeneratedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    regeneratedCount++;
  }

  await batch.commit();

  // Recalculate cycle totals
  const allItemsSnap = await db
    .collection(`users/${userId}/cycleItems`)
    .where('cycleId', '==', cycleId)
    .get();

  let totalCommitted = 0;
  let totalPaid = 0;
  let itemCount = 0;
  let paidCount = 0;

  for (const doc of allItemsSnap.docs) {
    const item = doc.data();
    if (item.status === 'skipped') continue;

    totalCommitted += item.amount || 0;
    itemCount++;

    if (item.status === 'paid' || item.status === 'partial') {
      totalPaid += item.totalPaidAmount || item.actualAmount || item.amount || 0;
      if (item.status === 'paid') paidCount++;
    }
  }

  await cycleRef.update({
    totalCommitted,
    totalPaid,
    itemCount,
    paidCount,
    updatedAt: now,
  });

  return NextResponse.json({
    success: true,
    message: `Regenerated ${regeneratedCount} items for cycle ${cycleId}`,
    existingCount: existingItemsSnap.size,
    regeneratedCount,
    warning: 'Payment history and receipts cannot be recovered. Items are marked as "upcoming" - you will need to manually update their status.',
  });
}
