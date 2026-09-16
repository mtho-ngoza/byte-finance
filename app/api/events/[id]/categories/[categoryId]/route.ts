import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
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

  await docRef.update({
    categories,
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

  // Remove category and all its items
  const updatedCategories = categories.filter((c) => c.id !== categoryId);
  const updatedItems = items.filter((i) => i.categoryId !== categoryId);

  await docRef.update({
    categories: updatedCategories,
    items: updatedItems,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ success: true });
}
