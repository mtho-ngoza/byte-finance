import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/cycle-items/[id]/edit-payment
 * Body: { paymentId: string, amount: number, note?: string, date?: string }
 *
 * Updates a specific payment's amount, note, and/or date.
 * Recalculates totalPaidAmount and updates cycle totalPaid accordingly.
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
  const { paymentId, amount, note, date } = body;

  if (!paymentId || typeof paymentId !== 'string') {
    return NextResponse.json({ error: 'paymentId is required' }, { status: 400 });
  }
  if (amount === undefined || typeof amount !== 'number' || amount <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
  }

  const db = getAdminDb();
  const ref = db.collection(`users/${userId}/cycleItems`).doc(id);
  const snap = await ref.get();

  if (!snap.exists) {
    return NextResponse.json({ error: 'CycleItem not found' }, { status: 404 });
  }

  const item = snap.data()!;
  const payments: Array<{ id: string; amount: number; note?: string; date?: Date; [key: string]: unknown }> = item.payments ?? [];

  const paymentToEdit = payments.find((p) => p.id === paymentId);
  if (!paymentToEdit) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
  }

  const oldAmount = paymentToEdit.amount;
  const amountDiff = amount - oldAmount;

  const updatedPayments = payments.map((p) => {
    if (p.id !== paymentId) return p;
    const updated = { ...p, amount };
    if (note !== undefined) updated.note = note || null;
    if (date !== undefined) updated.date = new Date(date);
    return updated;
  });

  const newTotalPaid = updatedPayments.reduce((sum, p) => sum + p.amount, 0);
  const now = FieldValue.serverTimestamp();

  await ref.update({
    payments: updatedPayments,
    totalPaidAmount: newTotalPaid,
    updatedAt: now,
  });

  // Update cycle totalPaid by the difference
  if (amountDiff !== 0) {
    const cycleRef = db.collection(`users/${userId}/cycles`).doc(item.cycleId);
    await cycleRef.update({
      totalPaid: FieldValue.increment(amountDiff),
      updatedAt: now,
    });
  }

  // Update goal contribution if cycle item is linked to a goal and amount changed
  if (item.linkedGoalId && amountDiff !== 0) {
    const goalRef = db.collection(`users/${userId}/goals`).doc(item.linkedGoalId);
    const goalSnap = await goalRef.get();
    if (goalSnap.exists) {
      const goal = goalSnap.data()!;
      const contributions: Array<{ id: string; amount: number; date?: Date; [key: string]: unknown }> = goal.contributions ?? [];
      const contributionId = `${id}-${paymentId}`;
      const contributionIdx = contributions.findIndex((c) => c.id === contributionId);

      if (contributionIdx !== -1) {
        // Update contribution amount in array
        const updatedContributions = [...contributions];
        updatedContributions[contributionIdx] = {
          ...updatedContributions[contributionIdx],
          amount,
          ...(date !== undefined ? { date: new Date(date) } : {}),
        };
        await goalRef.update({
          contributions: updatedContributions,
          currentAmount: FieldValue.increment(amountDiff),
          updatedAt: now,
        });
      }
    }
  }

  const updated = await ref.get();
  return NextResponse.json({ id, ...updated.data() }, { status: 200 });
}
