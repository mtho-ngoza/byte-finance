import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { createActivityEntry } from '@/lib/event-activity';
import type { EventCategory } from '@/types';

/**
 * POST /api/events/[id]/items
 * Add an item to an event
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

  // Validate required fields
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'Item name is required' }, { status: 400 });
  }
  if (!body.categoryId) {
    return NextResponse.json({ error: 'Category ID is required' }, { status: 400 });
  }
  if (typeof body.unitPrice !== 'number' || body.unitPrice < 0) {
    return NextResponse.json({ error: 'Valid unit price is required' }, { status: 400 });
  }
  if (typeof body.quantity !== 'number' || body.quantity < 1) {
    return NextResponse.json({ error: 'Valid quantity is required (minimum 1)' }, { status: 400 });
  }

  const db = getAdminDb();
  const docRef = db.collection(`users/${userId}/events`).doc(id);
  const doc = await docRef.get();

  if (!doc.exists) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const categories: EventCategory[] = doc.data()?.categories || [];
  const items = doc.data()?.items || [];

  // Verify category exists
  const categoryExists = categories.some((c) => c.id === body.categoryId);
  if (!categoryExists) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 });
  }

  // Generate item ID
  const itemId = `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();

  const newItem = {
    id: itemId,
    categoryId: body.categoryId,
    name: body.name.trim(),
    vendor: body.vendor?.trim() || null,
    unitPrice: body.unitPrice,
    quantity: body.quantity,
    status: 'quoted',
    payments: [],
    sortOrder: items.filter((i: any) => i.categoryId === body.categoryId).length,
    notes: body.notes?.trim() || null,
    createdAt: now,
    updatedAt: now,
  };

  const activity = createActivityEntry({
    type: 'item_added',
    actorId: userId,
    targetId: itemId,
    targetName: body.name.trim(),
    details: { unitPrice: body.unitPrice, quantity: body.quantity },
  });

  await docRef.update({
    items: FieldValue.arrayUnion(newItem),
    activities: FieldValue.arrayUnion(activity),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json(newItem, { status: 201 });
}
