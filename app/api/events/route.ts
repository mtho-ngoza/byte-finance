import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { createActivityEntry } from '@/lib/event-activity';
import type { CreateEvent } from '@/types';

/**
 * GET /api/events
 * List all events for the authenticated user
 */
export async function GET(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const db = getAdminDb();
  const snapshot = await db.collection(`users/${userId}/events`).orderBy('createdAt', 'desc').get();

  const events = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  return NextResponse.json({ events });
}

/**
 * POST /api/events
 * Create a new event
 */
export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body: CreateEvent = await request.json();

  // Validate required fields
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'Event name is required' }, { status: 400 });
  }

  if (!['planning', 'confirmed', 'in_progress', 'completed', 'cancelled'].includes(body.status || 'planning')) {
    return NextResponse.json({ error: 'Invalid event status' }, { status: 400 });
  }

  const db = getAdminDb();
  const now = FieldValue.serverTimestamp();

  const activity = createActivityEntry({
    type: 'event_created',
    actorId: userId,
    details: { name: body.name.trim() },
  });

  const eventData = {
    name: body.name.trim(),
    description: body.description?.trim() || null,
    eventDate: body.eventDate || null,
    linkedProjectId: body.linkedProjectId || null,
    status: body.status || 'planning',
    notes: body.notes?.trim() || null,
    ownerId: userId,
    categories: [],
    items: [],
    todos: [],
    activities: [activity],
    members: [],
    createdAt: now,
    updatedAt: now,
  };

  const docRef = await db.collection(`users/${userId}/events`).add(eventData);

  return NextResponse.json({ id: docRef.id, ...eventData }, { status: 201 });
}
