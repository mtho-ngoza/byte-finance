import { NextRequest, NextResponse } from 'next/server';
import { findEventByShareToken } from '@/lib/share-auth';
import { FieldValue } from 'firebase-admin/firestore';
import type { EventCategory } from '@/types';

/**
 * POST /api/share/events/[token]/categories
 * Add a category to a shared event
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = await request.json();

  // Validate required fields
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'Category name is required' }, { status: 400 });
  }

  const result = await findEventByShareToken(token);

  if (!result) {
    return NextResponse.json({ error: 'Event not found or share link expired' }, { status: 404 });
  }

  const { eventRef, eventData } = result;
  const existingCategories: EventCategory[] = eventData.categories || [];

  // Generate category ID
  const categoryId = `cat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const newCategory: EventCategory = {
    id: categoryId,
    name: body.name.trim(),
    sortOrder: existingCategories.length,
  };

  await eventRef.update({
    categories: FieldValue.arrayUnion(newCategory),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json(newCategory, { status: 201 });
}
