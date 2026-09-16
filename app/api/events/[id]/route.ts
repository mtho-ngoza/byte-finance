import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

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

  // Compute totals
  let totalQuoted = 0;
  let totalPaid = 0;
  let paidCount = 0;

  for (const item of items) {
    const subtotal = (item.unitPrice || 0) * (item.quantity || 1);
    totalQuoted += subtotal;

    const itemPaid = (item.payments || []).reduce(
      (sum: number, p: { amount: number }) => sum + (p.amount || 0),
      0
    );
    totalPaid += itemPaid;

    if (item.status === 'paid') {
      paidCount++;
    }
  }

  return NextResponse.json({
    id: doc.id,
    ...data,
    // Computed values
    totalQuoted,
    totalPaid,
    remaining: totalQuoted - totalPaid,
    itemCount: items.length,
    paidCount,
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
