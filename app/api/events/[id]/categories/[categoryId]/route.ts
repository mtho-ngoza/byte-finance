import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { createActivityEntry } from '@/lib/event-activity';
import type { EventCategory, EventItem } from '@/types';

/**
 * PATCH /api/events/[id]/categories/[categoryId]
 * Update a category (rename, reorder)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; categoryId: string }> }
) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id, categoryId } = await params;
  const body = await request.json();

  const db = getAdminDb();
  const docRef = db.collection(`users/${userId}/events`).doc(id);
  const doc = await docRef.get();

  if (!doc.exists) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const categories: EventCategory[] = doc.data()?.categories || [];
  const categoryIndex = categories.findIndex((c) => c.id === categoryId);

  if (categoryIndex === -1) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 });
  }

  // Update category fields
  if (body.name !== undefined) {
    categories[categoryIndex].name = body.name.trim();
  }
  if (body.sortOrder !== undefined) {
    categories[categoryIndex].sortOrder = body.sortOrder;
  }

  const activity = createActivityEntry({
    type: 'category_updated',
    actorId: userId,
    targetId: categoryId,
    targetName: categories[categoryIndex].name,
    details: body,
  });

  await docRef.update({
    categories,
    activities: FieldValue.arrayUnion(activity),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json(categories[categoryIndex]);
}

/**
 * DELETE /api/events/[id]/categories/[categoryId]
 * Delete a category and its items
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; categoryId: string }> }
) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id, categoryId } = await params;

  const db = getAdminDb();
  const docRef = db.collection(`users/${userId}/events`).doc(id);
  const doc = await docRef.get();

  if (!doc.exists) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const categories: EventCategory[] = doc.data()?.categories || [];
  const items: EventItem[] = doc.data()?.items || [];

  const categoryIndex = categories.findIndex((c) => c.id === categoryId);

  if (categoryIndex === -1) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 });
  }

  // Get category name before removing
  const deletedCategory = categories[categoryIndex];

  // Remove category and all its items
  const updatedCategories = categories.filter((c) => c.id !== categoryId);
  const updatedItems = items.filter((i) => i.categoryId !== categoryId);

  const activity = createActivityEntry({
    type: 'category_deleted',
    actorId: userId,
    targetId: categoryId,
    targetName: deletedCategory.name,
    details: { itemsDeleted: items.length - updatedItems.length },
  });

  await docRef.update({
    categories: updatedCategories,
    items: updatedItems,
    activities: FieldValue.arrayUnion(activity),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ success: true });
}
