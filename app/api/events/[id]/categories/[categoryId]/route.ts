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
  try {
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
  } catch (error) {
    console.error('Failed to update category:', error);
    return NextResponse.json(
      { error: 'Failed to update category' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/events/[id]/categories/[categoryId]
 * Delete a category, its descendants, and all their items
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; categoryId: string }> }
) {
  try {
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

    // Get all descendant category IDs (for nested categories)
    const getDescendantIds = (parentId: string): string[] => {
      const children = categories.filter((c) => c.parentId === parentId);
      return children.flatMap((c) => [c.id, ...getDescendantIds(c.id)]);
    };
    const categoryIdsToDelete = [categoryId, ...getDescendantIds(categoryId)];

    // Remove category, all descendants, and all their items
    const updatedCategories = categories.filter((c) => !categoryIdsToDelete.includes(c.id));
    const updatedItems = items.filter((i) => !categoryIdsToDelete.includes(i.categoryId));

    const activity = createActivityEntry({
      type: 'category_deleted',
      actorId: userId,
      targetId: categoryId,
      targetName: deletedCategory.name,
      details: {
        categoriesDeleted: categoryIdsToDelete.length,
        itemsDeleted: items.length - updatedItems.length,
      },
    });

    await docRef.update({
      categories: updatedCategories,
      items: updatedItems,
      activities: FieldValue.arrayUnion(activity),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete category:', error);
    return NextResponse.json(
      { error: 'Failed to delete category' },
      { status: 500 }
    );
  }
}
