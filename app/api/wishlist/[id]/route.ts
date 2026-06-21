import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * GET /api/wishlist/[id]
 * Get a single wishlist item
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;
  const { id } = await params;

  const db = getAdminDb();
  const doc = await db.doc(`users/${userId}/wishlist/${id}`).get();

  if (!doc.exists) {
    return NextResponse.json({ error: 'Wishlist item not found' }, { status: 404 });
  }

  const data = doc.data()!;
  return NextResponse.json({
    id: doc.id,
    ...data,
    createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
    updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? null,
    completedAt: data.completedAt?.toDate?.()?.toISOString() ?? null,
  });
}

/**
 * PATCH /api/wishlist/[id]
 * Update a wishlist item
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;
  const { id } = await params;

  const body = await request.json();
  const {
    title,
    description,
    type,
    targetYear,
    targetYearEnd,
    linkedGoalId,
    linkedCommitmentId,
    targetAmount,
    progress,
    status,
    priority,
    carriedFromYear,
  } = body;

  const db = getAdminDb();
  const docRef = db.doc(`users/${userId}/wishlist/${id}`);
  const doc = await docRef.get();

  if (!doc.exists) {
    return NextResponse.json({ error: 'Wishlist item not found' }, { status: 404 });
  }

  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (type !== undefined) updates.type = type;
  if (targetYear !== undefined) updates.targetYear = targetYear;
  if (targetYearEnd !== undefined) updates.targetYearEnd = targetYearEnd;
  if (linkedGoalId !== undefined) updates.linkedGoalId = linkedGoalId;
  if (linkedCommitmentId !== undefined) updates.linkedCommitmentId = linkedCommitmentId;
  if (targetAmount !== undefined) updates.targetAmount = targetAmount;
  if (progress !== undefined) updates.progress = progress;
  if (priority !== undefined) updates.priority = priority;
  if (carriedFromYear !== undefined) updates.carriedFromYear = carriedFromYear;

  if (status !== undefined) {
    updates.status = status;
    if (status === 'completed') {
      updates.completedAt = FieldValue.serverTimestamp();
      updates.progress = 100;
    }
  }

  // If linking to a goal, calculate progress
  if (linkedGoalId) {
    const goalDoc = await db.doc(`users/${userId}/goals/${linkedGoalId}`).get();
    if (goalDoc.exists) {
      const goal = goalDoc.data()!;
      updates.currentAmount = goal.currentAmount || 0;
      if (goal.targetAmount > 0) {
        updates.progress = Math.min(100, Math.round(((goal.currentAmount || 0) / goal.targetAmount) * 100));
      }
      updates.targetAmount = goal.targetAmount;

      // Auto-complete if goal is completed
      if (goal.status === 'completed') {
        updates.status = 'completed';
        updates.progress = 100;
        updates.completedAt = FieldValue.serverTimestamp();
      }
    }
  }

  await docRef.update(updates);

  const updated = await docRef.get();
  const data = updated.data()!;

  return NextResponse.json({
    id: updated.id,
    ...data,
    createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
    updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? null,
    completedAt: data.completedAt?.toDate?.()?.toISOString() ?? null,
  });
}

/**
 * DELETE /api/wishlist/[id]
 * Delete a wishlist item
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;
  const { id } = await params;

  const db = getAdminDb();
  const docRef = db.doc(`users/${userId}/wishlist/${id}`);
  const doc = await docRef.get();

  if (!doc.exists) {
    return NextResponse.json({ error: 'Wishlist item not found' }, { status: 404 });
  }

  await docRef.delete();

  return NextResponse.json({ success: true });
}
