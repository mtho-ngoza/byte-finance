import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/events/[id]/items/[itemId]/payments
 * Add a payment to an item
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id, itemId } = await params;
  const body = await request.json();

  // Validate required fields
  if (typeof body.amount !== 'number' || body.amount <= 0) {
    return NextResponse.json({ error: 'Valid payment amount is required' }, { status: 400 });
  }

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
    receiptId: body.receiptId || null,
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

  await docRef.update({
    items,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json(newPayment, { status: 201 });
}
