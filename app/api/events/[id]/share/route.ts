import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';

/**
 * POST /api/events/[id]/share
 * Generate or return existing share token for an event
 */
export async function POST(
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

  const data = doc.data()!;

  // Return existing token if already shared
  if (data.shareToken) {
    return NextResponse.json({
      shareToken: data.shareToken,
      shareUrl: `/share/events/${data.shareToken}`,
    });
  }

  // Generate new token (16 bytes = 32 hex chars, URL-safe)
  const shareToken = randomBytes(16).toString('hex');

  await docRef.update({
    shareToken,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({
    shareToken,
    shareUrl: `/share/events/${shareToken}`,
  }, { status: 201 });
}

/**
 * DELETE /api/events/[id]/share
 * Revoke share access by removing the token
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

  await docRef.update({
    shareToken: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ success: true });
}
