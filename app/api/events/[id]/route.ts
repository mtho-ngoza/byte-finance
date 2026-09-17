import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { createActivityEntry } from '@/lib/event-activity';

/**
 * GET /api/events/[id]
 * Get a single event by ID with computed totals
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id } = await params;
  const db = getAdminDb();
  const doc = await db.collection(`users/${userId}/events`).doc(id).get();

  if (!doc.exists) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const data = doc.data()!;
  const items = data.items || [];
  const categories = data.categories || [];
  const todos = data.todos || [];

  // Compute totals
  let totalQuoted = 0;
  let totalPaid = 0;
  let paidCount = 0;
  let partialCount = 0;
  let quotedCount = 0;
  let confirmedCount = 0;
  let cancelledCount = 0;

  // Category breakdown
  const categoryBreakdown: Record<string, { name: string; quoted: number; paid: number; itemCount: number }> = {};
  for (const cat of categories) {
    categoryBreakdown[cat.id] = { name: cat.name, quoted: 0, paid: 0, itemCount: 0 };
  }

  for (const item of items) {
    const subtotal = (item.unitPrice || 0) * (item.quantity || 1);
    totalQuoted += subtotal;

    const itemPaid = (item.payments || []).reduce(
      (sum: number, p: { amount: number }) => sum + (p.amount || 0),
      0
    );
    totalPaid += itemPaid;

    // Status counts
    switch (item.status) {
      case 'paid': paidCount++; break;
      case 'partial': partialCount++; break;
      case 'quoted': quotedCount++; break;
      case 'confirmed': confirmedCount++; break;
      case 'cancelled': cancelledCount++; break;
    }

    // Category breakdown
    if (categoryBreakdown[item.categoryId]) {
      categoryBreakdown[item.categoryId].quoted += subtotal;
      categoryBreakdown[item.categoryId].paid += itemPaid;
      categoryBreakdown[item.categoryId].itemCount++;
    }
  }

  // Todo stats
  const todoTotal = todos.length;
  const todoCompleted = todos.filter((t: any) => t.completed).length;

  // Summary object
  const summary = {
    totals: {
      quoted: totalQuoted,
      paid: totalPaid,
      remaining: totalQuoted - totalPaid,
      progressPercent: totalQuoted > 0 ? Math.round((totalPaid / totalQuoted) * 100) : 0,
    },
    items: {
      total: items.length,
      paid: paidCount,
      partial: partialCount,
      quoted: quotedCount,
      confirmed: confirmedCount,
      cancelled: cancelledCount,
    },
    categories: Object.values(categoryBreakdown),
    todos: {
      total: todoTotal,
      completed: todoCompleted,
      pending: todoTotal - todoCompleted,
      progressPercent: todoTotal > 0 ? Math.round((todoCompleted / todoTotal) * 100) : 0,
    },
  };

  return NextResponse.json({
    id: doc.id,
    ...data,
    // Computed values (legacy)
    totalQuoted,
    totalPaid,
    remaining: totalQuoted - totalPaid,
    itemCount: items.length,
    paidCount,
    // New summary object
    summary,
  });
}

/**
 * PATCH /api/events/[id]
 * Update event metadata
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id } = await params;
  const body = await request.json();

  const db = getAdminDb();
  const docRef = db.collection(`users/${userId}/events`).doc(id);
  const doc = await docRef.get();

  if (!doc.exists) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  // Build update object - only update provided fields
  const updateData: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (body.name !== undefined) updateData.name = body.name.trim();
  if (body.description !== undefined) updateData.description = body.description?.trim() || null;
  if (body.eventDate !== undefined) updateData.eventDate = body.eventDate;
  if (body.linkedProjectId !== undefined) updateData.linkedProjectId = body.linkedProjectId || null;
  if (body.status !== undefined) {
    updateData.status = body.status;
    if (body.status === 'completed') {
      updateData.completedAt = FieldValue.serverTimestamp();
    }
  }
  if (body.notes !== undefined) updateData.notes = body.notes?.trim() || null;

  const activity = createActivityEntry({
    type: 'event_updated',
    actorId: userId,
    details: body,
  });
  updateData.activities = FieldValue.arrayUnion(activity);

  await docRef.update(updateData);

  const updated = await docRef.get();
  return NextResponse.json({ id: updated.id, ...updated.data() });
}

/**
 * DELETE /api/events/[id]
 * Archive an event (soft delete)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id } = await params;
  const db = getAdminDb();
  const docRef = db.collection(`users/${userId}/events`).doc(id);
  const doc = await docRef.get();

  if (!doc.exists) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  // Soft delete - set status to cancelled
  await docRef.update({
    status: 'cancelled',
    archivedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ success: true });
}
