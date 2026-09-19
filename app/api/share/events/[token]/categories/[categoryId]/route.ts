import { NextRequest, NextResponse } from 'next/server';
import { findEventByShareToken } from '@/lib/share-auth';
import { FieldValue } from 'firebase-admin/firestore';
import { createActivityEntry } from '@/lib/event-activity';
import type { EventCategory, EventItem } from '@/types';

/**
 * PATCH /api/share/events/[token]/categories/[categoryId]
 * Update a category in a shared event
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; categoryId: string }> }
) {
  try {
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
    if (body.parentId !== undefined) {
      // Validate: can't be own parent or create a cycle
      if (body.parentId === categoryId) {
        return NextResponse.json({ error: 'Category cannot be its own parent' }, { status: 400 });
      }
      // Check for cycles - parentId can't be a descendant
      const getDescendantIds = (parentId: string): string[] => {
        const children = categories.filter((c) => c.parentId === parentId);
        return children.flatMap((c) => [c.id, ...getDescendantIds(c.id)]);
      };
      const descendants = getDescendantIds(categoryId);
      if (body.parentId && descendants.includes(body.parentId)) {
        return NextResponse.json({ error: 'Cannot set parent to a descendant category' }, { status: 400 });
      }
      categories[categoryIndex].parentId = body.parentId || undefined;
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
  } catch (error) {
    console.error('Failed to update category (share):', error);
    return NextResponse.json(
      { error: 'Failed to update category' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/share/events/[token]/categories/[categoryId]
 * Delete a category, its descendants, and all their items from a shared event
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; categoryId: string }> }
) {
  try {
    const { token, categoryId } = await params;

    const result = await findEventByShareToken(token);

    if (!result) {
      return NextResponse.json({ error: 'Event not found or share link expired' }, { status: 404 });
    }

    const { eventRef, eventData } = result;
    const categories: EventCategory[] = eventData.categories || [];
    const items: EventItem[] = eventData.items || [];

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
      actorName: 'Shared User',
      targetId: categoryId,
      targetName: deletedCategory.name,
      details: {
        categoriesDeleted: categoryIdsToDelete.length,
        itemsDeleted: items.length - updatedItems.length,
      },
    });

    await eventRef.update({
      categories: updatedCategories,
      items: updatedItems,
      activities: FieldValue.arrayUnion(activity),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete category (share):', error);
    return NextResponse.json(
      { error: 'Failed to delete category' },
      { status: 500 }
    );
  }
}
