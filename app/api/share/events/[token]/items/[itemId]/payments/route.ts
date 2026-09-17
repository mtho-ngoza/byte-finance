import { NextRequest, NextResponse } from 'next/server';
import { findEventByShareToken } from '@/lib/share-auth';
import { FieldValue } from 'firebase-admin/firestore';
import { createActivityEntry } from '@/lib/event-activity';

/**
 * POST /api/share/events/[token]/items/[itemId]/payments
 * Add a payment to an item in a shared event
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; itemId: string }> }
) {
  const { token, itemId } = await params;
  const body = await request.json();

  // Validate required fields
  if (typeof body.amount !== 'number' || body.amount <= 0) {
    return NextResponse.json({ error: 'Valid payment amount is required' }, { status: 400 });
  }

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
  const subtotal = item.unitPrice * item.quantity;
  const currentPaid = (item.payments || []).reduce((sum: number, p: any) => sum + p.amount, 0);
  const remaining = subtotal - currentPaid;

  // Validate payment doesn't exceed remaining
  if (body.amount > remaining) {
    return NextResponse.json(
      { error: `Payment exceeds remaining amount (${remaining} cents)` },
      { status: 400 }
    );
  }

  // Generate payment ID
  const paymentId = `pay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const newPayment = {
    id: paymentId,
    amount: body.amount,
    date: body.date ? new Date(body.date) : new Date(),
    note: body.note?.trim() || null,
    // Track who added the payment (from shared view)
    addedBy: body.addedBy?.trim() || 'Shared User',
  };

  // Add payment to item
  if (!item.payments) {
    item.payments = [];
  }
  item.payments.push(newPayment);

  // Update item status based on payments
  const newTotal = currentPaid + body.amount;
  if (newTotal >= subtotal) {
    item.status = 'paid';
  } else if (newTotal > 0) {
    item.status = 'partial';
  }

  item.updatedAt = new Date();

  const activity = createActivityEntry({
    type: 'payment_added',
    actorName: body.addedBy?.trim() || 'Shared User',
    targetId: itemId,
    targetName: item.name,
    details: { amount: body.amount, paymentId },
  });

  await eventRef.update({
    items,
    activities: FieldValue.arrayUnion(activity),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json(newPayment, { status: 201 });
}
