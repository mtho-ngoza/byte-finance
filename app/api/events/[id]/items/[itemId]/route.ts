import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { createActivityEntry } from '@/lib/event-activity';

/**
 * PATCH /api/events/[id]/items/[itemId]
 * Update an item
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id, itemId } = await params;
  const body = await request.json();

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

  // Update item fields
  const item = items[itemIndex];

  if (body.name !== undefined) item.name = body.name.trim();
  if (body.vendor !== undefined) item.vendor = body.vendor?.trim() || null;
  if (body.unitPrice !== undefined) item.unitPrice = body.unitPrice;
  if (body.quantity !== undefined) item.quantity = body.quantity;
  if (body.categoryId !== undefined) item.categoryId = body.categoryId;
  if (body.status !== undefined) item.status = body.status;
  if (body.sortOrder !== undefined) item.sortOrder = body.sortOrder;
  if (body.notes !== undefined) item.notes = body.notes?.trim() || null;

  item.updatedAt = new Date();

  const activity = createActivityEntry({
    type: 'item_updated',
    actorId: userId,
    targetId: itemId,
    targetName: item.name,
    details: body,
  });

  await docRef.update({
    items,
    activities: FieldValue.arrayUnion(activity),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json(item);
}

/**
 * DELETE /api/events/[id]/items/[itemId]
 * Remove an item
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id, itemId } = await params;

  const db = getAdminDb();
  const docRef = db.collection(`users/${userId}/events`).doc(id);
  const doc = await docRef.get();

  if (!doc.exists) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const items = doc.data()?.items || [];
  const deletedItem = items.find((i: any) => i.id === itemId);
  const updatedItems = items.filter((i: any) => i.id !== itemId);

  if (items.length === updatedItems.length) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  const activity = createActivityEntry({
    type: 'item_deleted',
    actorId: userId,
    targetId: itemId,
    targetName: deletedItem?.name,
  });

  await docRef.update({
    items: updatedItems,
    activities: FieldValue.arrayUnion(activity),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ success: true });
}
