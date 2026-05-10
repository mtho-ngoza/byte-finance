import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/cycle-items/[id]/delete-payment
 * Body: { paymentId: string }
 *
 * Removes a specific payment from a cycle item.
 * - Removes payment from payments[] array
 * - Recalculates totalPaidAmount
 * - Updates status: no payments → upcoming; payments remain → partial
 * - Updates cycle totalPaid counter
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
  const { paymentId } = body;

  if (!paymentId || typeof paymentId !== 'string') {
    return NextResponse.json({ error: 'paymentId is required' }, { status: 400 });
  }

  const db = getAdminDb();
  const ref = db.collection(`users/${userId}/cycleItems`).doc(id);
  const snap = await ref.get();

  if (!snap.exists) {
    return NextResponse.json({ error: 'CycleItem not found' }, { status: 404 });
  }

  const item = snap.data()!;
  const payments: Array<{ id: string; amount: number; [key: string]: unknown }> = item.payments ?? [];

  const paymentToDelete = payments.find((p) => p.id === paymentId);
  if (!paymentToDelete) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
  }

  const remainingPayments = payments.filter((p) => p.id !== paymentId);
  const newTotalPaid = remainingPayments.reduce((sum, p) => sum + p.amount, 0);
  const newStatus = remainingPayments.length === 0 ? 'upcoming' : 'partial';

  const now = FieldValue.serverTimestamp();

  await ref.update({
    payments: remainingPayments,
    totalPaidAmount: newTotalPaid,
    status: newStatus,
    updatedAt: now,
  });

  // Update cycle totalPaid — subtract the deleted payment amount
  const cycleRef = db.collection(`users/${userId}/cycles`).doc(item.cycleId);
  await cycleRef.update({
    totalPaid: FieldValue.increment(-paymentToDelete.amount),
    updatedAt: now,
  });

  const updated = await ref.get();
  return NextResponse.json({ id, ...updated.data() }, { status: 200 });
}
