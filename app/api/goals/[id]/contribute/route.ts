import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/goals/[id]/contribute
 * Body: { amount: number, date?: string, note?: string }
 *
 * Adds a manual contribution to a goal.
 * Used for recording historical payments made before using the app.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id } = await params;
  const body = await request.json();
  const { amount, date, note } = body;

  if (!amount || typeof amount !== 'number' || amount <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
  }

  const db = getAdminDb();
  const ref = db.collection(`users/${userId}/goals`).doc(id);
  const doc = await ref.get();

  if (!doc.exists) {
    return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
  }

  const contributionDate = date ? new Date(date) : new Date();
  const contributionId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const contribution = {
    id: contributionId,
    date: contributionDate,
    amount,
    cycleId: 'manual', // Mark as manual contribution
    note: note ?? null,
  };

  await ref.update({
    currentAmount: FieldValue.increment(amount),
    contributions: FieldValue.arrayUnion(contribution),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const updated = await ref.get();
  return NextResponse.json({ id, ...updated.data() }, { status: 200 });
}
