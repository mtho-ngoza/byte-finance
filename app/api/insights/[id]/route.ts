import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * GET /api/insights/[id]
 * Returns a single insight by ID
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
  const doc = await db.doc(`users/${userId}/insights/${id}`).get();

  if (!doc.exists) {
    return NextResponse.json({ error: 'Insight not found' }, { status: 404 });
  }

  const data = doc.data()!;
  return NextResponse.json({
    id: doc.id,
    ...data,
    createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
    expiresAt: data.expiresAt?.toDate?.()?.toISOString() ?? null,
  });
}

/**
 * PATCH /api/insights/[id]
 * Update insight (mark as read, dismiss, snooze)
 * Body: { isRead?: boolean, isDismissed?: boolean, snoozeUntil?: string }
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
  const { isRead, isDismissed, snoozeUntil } = body;

  const db = getAdminDb();
  const docRef = db.doc(`users/${userId}/insights/${id}`);
  const doc = await docRef.get();

  if (!doc.exists) {
    return NextResponse.json({ error: 'Insight not found' }, { status: 404 });
  }

  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (typeof isRead === 'boolean') {
    updates.isRead = isRead;
  }

  if (typeof isDismissed === 'boolean') {
    updates.isDismissed = isDismissed;
  }

  // Snooze: set a new expiresAt date (e.g., 7 days from now)
  if (snoozeUntil) {
    const snoozeDate = new Date(snoozeUntil);
    if (!isNaN(snoozeDate.getTime())) {
      updates.expiresAt = snoozeDate;
      updates.snoozedAt = FieldValue.serverTimestamp();
    }
  }

  await docRef.update(updates);

  const updated = await docRef.get();
  const data = updated.data()!;

  return NextResponse.json({
    id: updated.id,
    ...data,
    createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
    expiresAt: data.expiresAt?.toDate?.()?.toISOString() ?? null,
  });
}

/**
 * DELETE /api/insights/[id]
 * Permanently delete an insight
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
  const docRef = db.doc(`users/${userId}/insights/${id}`);
  const doc = await docRef.get();

  if (!doc.exists) {
    return NextResponse.json({ error: 'Insight not found' }, { status: 404 });
  }

  await docRef.delete();

  return NextResponse.json({ success: true });
}
