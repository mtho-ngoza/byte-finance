import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { createActivityEntry } from '@/lib/event-activity';
import type { EventCategory } from '@/types';

/**
 * POST /api/events/[id]/categories
 * Add a category to an event
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
    return NextResponse.json({ error: 'Category name is required' }, { status: 400 });
  }

  const db = getAdminDb();
  const docRef = db.collection(`users/${userId}/events`).doc(id);
  const doc = await docRef.get();

  if (!doc.exists) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const existingCategories: EventCategory[] = doc.data()?.categories || [];

  // Generate category ID
  const categoryId = `cat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const newCategory: EventCategory = {
    id: categoryId,
    name: body.name.trim(),
    sortOrder: existingCategories.length,
    ...(body.parentId ? { parentId: body.parentId } : {}),
  };

  const activity = createActivityEntry({
    type: 'category_added',
    actorId: userId,
    targetId: categoryId,
    targetName: body.name.trim(),
  });

  await docRef.update({
    categories: FieldValue.arrayUnion(newCategory),
    activities: FieldValue.arrayUnion(activity),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json(newCategory, { status: 201 });
}
