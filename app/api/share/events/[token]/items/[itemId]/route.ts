import { NextRequest, NextResponse } from 'next/server';
import { findEventByShareToken } from '@/lib/share-auth';
import { FieldValue } from 'firebase-admin/firestore';
import { createActivityEntry } from '@/lib/event-activity';

/**
 * PATCH /api/share/events/[token]/items/[itemId]
 * Update an item in a shared event
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; itemId: string }> }
) {
  const { token, itemId } = await params;
  const body = await request.json();

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
    actorName: 'Shared User',
    targetId: itemId,
    targetName: item.name,
    details: body,
  });

  await eventRef.update({
    items,
    activities: FieldValue.arrayUnion(activity),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json(item);
}

/**
 * DELETE /api/share/events/[token]/items/[itemId]
 * Remove an item from a shared event
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; itemId: string }> }
) {
  const { token, itemId } = await params;

  const result = await findEventByShareToken(token);

  if (!result) {
    return NextResponse.json({ error: 'Event not found or share link expired' }, { status: 404 });
  }

  const { eventRef, eventData } = result;
  const items = eventData.items || [];
  const deletedItem = items.find((i: any) => i.id === itemId);
  const updatedItems = items.filter((i: any) => i.id !== itemId);

  if (items.length === updatedItems.length) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  const activity = createActivityEntry({
    type: 'item_deleted',
    actorName: 'Shared User',
    targetId: itemId,
    targetName: deletedItem?.name,
  });

  await eventRef.update({
    items: updatedItems,
    activities: FieldValue.arrayUnion(activity),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ success: true });
}
