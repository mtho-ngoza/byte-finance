import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/goals/[id]/link-payments
 * Body: { payments: Array<{ paymentId: string, cycleItemId: string, cycleId: string, amount: number, date: string, note?: string }> }
 *
 * Links existing payments to a goal by creating contributions from them.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id: goalId } = await params;
  const body = await request.json();
  const { payments } = body;

  if (!Array.isArray(payments) || payments.length === 0) {
    return NextResponse.json({ error: 'payments array is required' }, { status: 400 });
  }

  const db = getAdminDb();
  const goalRef = db.collection(`users/${userId}/goals`).doc(goalId);
  const goalDoc = await goalRef.get();

  if (!goalDoc.exists) {
    return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
  }

  // Create contributions from the selected payments
  const contributions = payments.map((p: {
    paymentId: string;
    cycleItemId: string;
    cycleId: string;
    amount: number;
    date: string;
    note?: string;
  }) => ({
    id: `${p.cycleItemId}-${p.paymentId}`,
    date: new Date(p.date),
    amount: p.amount,
    cycleId: p.cycleId,
    cycleItemId: p.cycleItemId,
    note: p.note ?? null,
  }));

  const totalAmount = contributions.reduce((sum, c) => sum + c.amount, 0);

  // Update goal with new contributions
  await goalRef.update({
    currentAmount: FieldValue.increment(totalAmount),
    contributions: FieldValue.arrayUnion(...contributions),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const updated = await goalRef.get();
  return NextResponse.json({
    id: goalId,
    linked: contributions.length,
    totalAdded: totalAmount,
    ...updated.data(),
  }, { status: 200 });
}
