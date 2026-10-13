import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { createActivityEntry } from '@/lib/event-activity';
import type { CreateEvent } from '@/types';

/**
 * GET /api/events
 * List all events for the authenticated user
 * Query params:
 *   - linkedProjectId: filter by linked project
 *   - limit: max items to return (default 30, max 100)
 *   - page: page number (0-indexed, default 0)
 */
export async function GET(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(request.url);
  const linkedProjectId = searchParams.get('linkedProjectId');
  const limitParam = parseInt(searchParams.get('limit') || '30');
  const page = parseInt(searchParams.get('page') || '0');

  // Clamp limit between 1 and 100
  const limit = Math.min(Math.max(limitParam, 1), 100);
  const offset = page * limit;

  const db = getAdminDb();
  const queryRef = db.collection(`users/${userId}/events`).orderBy('createdAt', 'desc');

  // Note: Firestore requires an index for compound queries, so we filter in memory
  const snapshot = await queryRef.get();

  let allEvents = snapshot.docs.map((doc) => {
    const data = doc.data();
    const items = data.items || [];

    // Calculate totals
    const totalQuoted = items.reduce((sum: number, item: any) => sum + (item.unitPrice * item.quantity), 0);
    const totalPaid = items.reduce((sum: number, item: any) => {
      const payments = item.payments || [];
      return sum + payments.reduce((s: number, p: any) => s + p.amount, 0);
    }, 0);

    return {
      id: doc.id,
      ...data,
      totalQuoted,
      totalPaid,
    } as { id: string; linkedProjectId?: string; [key: string]: any };
  });

  // Filter by linkedProjectId if provided
  if (linkedProjectId) {
    allEvents = allEvents.filter((e) => e.linkedProjectId === linkedProjectId);
  }

  const total = allEvents.length;
  const events = allEvents.slice(offset, offset + limit);
  const hasMore = offset + events.length < total;

  return NextResponse.json({
    events,
    total,
    page,
    limit,
    hasMore,
  });
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
