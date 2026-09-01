import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

interface RouteParams {
  params: Promise<{ id: string; contributionId: string }>;
}

interface Contribution {
  id: string;
  date: unknown;
  amount: number;
  cycleId?: string;
  cycleItemId?: string;
  note?: string;
}

/**
 * PATCH /api/goals/[id]/contributions/[contributionId]
 * Edit a contribution
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id: goalId, contributionId } = await params;
  const body = await request.json();

  const db = getAdminDb();
  const goalRef = db.collection(`users/${userId}/goals`).doc(goalId);
  const goalSnap = await goalRef.get();

  if (!goalSnap.exists) {
    return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
  }

  const goal = goalSnap.data()!;
  const contributions: Contribution[] = goal.contributions || [];

  const contribIndex = contributions.findIndex((c) => c.id === contributionId);
  if (contribIndex === -1) {
    return NextResponse.json({ error: 'Contribution not found' }, { status: 404 });
  }

  const oldContrib = contributions[contribIndex];
  const oldAmount = oldContrib.amount;

  // Build updated contribution
  const updatedContrib: Contribution = {
    ...oldContrib,
    ...(body.amount !== undefined && { amount: body.amount }),
    ...(body.note !== undefined && { note: body.note?.trim() || null }),
    ...(body.date !== undefined && { date: new Date(body.date) }),
  };

  const newAmount = updatedContrib.amount;
  const amountDelta = newAmount - oldAmount;

  // Update contributions array
  contributions[contribIndex] = updatedContrib;

  await goalRef.update({
    contributions,
    currentAmount: FieldValue.increment(amountDelta),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ contribution: updatedContrib });
}

/**
 * DELETE /api/goals/[id]/contributions/[contributionId]
 * Delete a contribution
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id: goalId, contributionId } = await params;

  const db = getAdminDb();
  const goalRef = db.collection(`users/${userId}/goals`).doc(goalId);
  const goalSnap = await goalRef.get();

  if (!goalSnap.exists) {
    return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
  }

  const goal = goalSnap.data()!;
  const contributions: Contribution[] = goal.contributions || [];

  const contrib = contributions.find((c) => c.id === contributionId);
  if (!contrib) {
    return NextResponse.json({ error: 'Contribution not found' }, { status: 404 });
  }

  const updatedContributions = contributions.filter((c) => c.id !== contributionId);

  await goalRef.update({
    contributions: updatedContributions,
    currentAmount: FieldValue.increment(-contrib.amount),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ success: true });
}
