import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/cycle-items/[id]/edit-payment
 * Body: { paymentId: string, amount: number, note?: string }
 *
 * Updates a specific payment's amount and/or note.
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
  const { paymentId, amount, note } = body;

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
  const payments: Array<{ id: string; amount: number; note?: string; [key: string]: unknown }> = item.payments ?? [];

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

  const updated = await ref.get();
  return NextResponse.json({ id, ...updated.data() }, { status: 200 });
}
