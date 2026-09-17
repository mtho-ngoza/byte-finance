import { NextRequest, NextResponse } from 'next/server';
import { findEventByShareToken } from '@/lib/share-auth';
import { FieldValue } from 'firebase-admin/firestore';
import { createActivityEntry } from '@/lib/event-activity';

/**
 * DELETE /api/share/events/[token]/items/[itemId]/payments/[paymentId]
 * Remove a payment from an item in a shared event
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; itemId: string; paymentId: string }> }
) {
  const { token, itemId, paymentId } = await params;

  const result = await findEventByShareToken(token);

  if (!result) {
    return NextResponse.json({ error: 'Event not found or share link expired' }, { status: 404 });
  }

  const { eventRef, eventData } = result;
  const items = eventData.items || [];
  const itemIndex = items.findIndex((i: any) => i.id === itemId);

  if (itemIndex === -1) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  const item = items[itemIndex];
  const paymentIndex = (item.payments || []).findIndex((p: any) => p.id === paymentId);

  if (paymentIndex === -1) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
  }

  // Get payment amount before removing
  const deletedPayment = item.payments[paymentIndex];

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
    item.status = 'quoted';
  }

  item.updatedAt = new Date();

  const activity = createActivityEntry({
    type: 'payment_deleted',
    actorName: 'Shared User',
    targetId: itemId,
    targetName: item.name,
    details: { amount: deletedPayment.amount, paymentId },
  });

  await eventRef.update({
    items,
    activities: FieldValue.arrayUnion(activity),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ success: true });
}
