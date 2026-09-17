import { NextRequest, NextResponse } from 'next/server';
import { findEventByShareToken } from '@/lib/share-auth';
import { FieldValue } from 'firebase-admin/firestore';
import { createActivityEntry } from '@/lib/event-activity';
import type { EventCategory } from '@/types';

/**
 * PATCH /api/share/events/[token]/categories/[categoryId]
 * Update a category in a shared event
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; categoryId: string }> }
) {
  const { token, categoryId } = await params;
  const body = await request.json();

  const result = await findEventByShareToken(token);

  if (!result) {
    return NextResponse.json({ error: 'Event not found or share link expired' }, { status: 404 });
  }

  const { eventRef, eventData } = result;
  const categories: EventCategory[] = eventData.categories || [];
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
    actorName: 'Shared User',
    targetId: categoryId,
    targetName: categories[categoryIndex].name,
    details: body,
  });

  await eventRef.update({
    categories,
    activities: FieldValue.arrayUnion(activity),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json(categories[categoryIndex]);
}

/**
 * DELETE /api/share/events/[token]/categories/[categoryId]
 * Delete a category from a shared event
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; categoryId: string }> }
) {
  const { token, categoryId } = await params;

  const result = await findEventByShareToken(token);

  if (!result) {
    return NextResponse.json({ error: 'Event not found or share link expired' }, { status: 404 });
  }

  const { eventRef, eventData } = result;
  const categories: EventCategory[] = eventData.categories || [];
  const items = eventData.items || [];

  const categoryIndex = categories.findIndex((c) => c.id === categoryId);

  if (categoryIndex === -1) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 });
  }

  // Get category name before removing
  const deletedCategory = categories[categoryIndex];

  // Remove category and all its items
  const updatedCategories = categories.filter((c) => c.id !== categoryId);
  const updatedItems = items.filter((i: any) => i.categoryId !== categoryId);

  const activity = createActivityEntry({
    type: 'category_deleted',
    actorName: 'Shared User',
    targetId: categoryId,
    targetName: deletedCategory.name,
    details: { itemsDeleted: items.length - updatedItems.length },
  });

  await eventRef.update({
    categories: updatedCategories,
    items: updatedItems,
    activities: FieldValue.arrayUnion(activity),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ success: true });
}
