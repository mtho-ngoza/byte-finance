import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * DELETE /api/events/[id]/items/[itemId]/payments/[paymentId]
 * Remove a payment from an item
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string; paymentId: string }> }
) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id, itemId, paymentId } = await params;

  const db = getAdminDb();
  const docRef = db.collection(`users/${userId}/events`).doc(id);
  const doc = await docRef.get();

  if (!doc.exists) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const items = doc.data()?.items || [];
  const itemIndex = items.findIndex((i: any) => i.id === itemId);

  if (itemIndex === -1) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  const item = items[itemIndex];
  const paymentIndex = (item.payments || []).findIndex((p: any) => p.id === paymentId);

  if (paymentIndex === -1) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
  }

  // Remove payment
  item.payments.splice(paymentIndex, 1);

  // Update item status based on remaining payments
  const subtotal = item.unitPrice * item.quantity;
  const remainingPaid = item.payments.reduce((sum: number, p: any) => sum + p.amount, 0);

  if (remainingPaid >= subtotal) {
    item.status = 'paid';
  } else if (remainingPaid > 0) {
    item.status = 'partial';
  } else {
    // Revert to quoted or confirmed based on previous state
    item.status = 'quoted';
  }

  item.updatedAt = new Date();

  await docRef.update({
    items,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ success: true });
}
