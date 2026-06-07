import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb, getAdminStorage } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * GET /api/receipts/[id]
 * Get a single receipt
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
  const doc = await db.doc(`users/${userId}/receipts/${id}`).get();

  if (!doc.exists) {
    return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
  }

  const data = doc.data()!;
  return NextResponse.json({
    id: doc.id,
    ...data,
    capturedAt: data.capturedAt?.toDate?.()?.toISOString() ?? null,
    createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
    updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? null,
  });
}

/**
 * PATCH /api/receipts/[id]
 * Update receipt metadata
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
  const { amountInCents, vendor, note, cycleItemId, cycleId } = body;

  const db = getAdminDb();
  const docRef = db.doc(`users/${userId}/receipts/${id}`);
  const doc = await docRef.get();

  if (!doc.exists) {
    return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
  }

  const currentData = doc.data()!;
  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (amountInCents !== undefined) {
    updates.amountInCents = amountInCents;
  }

  if (vendor !== undefined) {
    updates.vendor = vendor;
  }

  if (note !== undefined) {
    updates.note = note;
  }

  if (cycleItemId !== undefined) {
    updates.cycleItemId = cycleItemId;
  }

  if (cycleId !== undefined) {
    updates.cycleId = cycleId;
  }

  // Recompute needsAttention
  const finalAmount = amountInCents !== undefined ? amountInCents : currentData.amountInCents;
  const finalVendor = vendor !== undefined ? vendor : currentData.vendor;
  updates.needsAttention = !finalAmount || !finalVendor;

  await docRef.update(updates);

  const updated = await docRef.get();
  const data = updated.data()!;

  return NextResponse.json({
    id: updated.id,
    ...data,
    capturedAt: data.capturedAt?.toDate?.()?.toISOString() ?? null,
    createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
    updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? null,
  });
}

/**
 * DELETE /api/receipts/[id]
 * Delete a receipt and all associated Storage files
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
  const docRef = db.doc(`users/${userId}/receipts/${id}`);
  const doc = await docRef.get();

  if (!doc.exists) {
    return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
  }

  const data = doc.data()!;

  // Delete all 3 Storage files (original, image, thumb)
  // URL formats:
  // - https://storage.googleapis.com/{bucket}/users/{userId}/receipts/{receiptId}/image.jpg
  // - https://firebasestorage.googleapis.com/v0/b/{bucket}/o/users%2F...
  try {
    const bucket = getAdminStorage().bucket();
    const urlToPath = (url: string): string | null => {
      if (!url || url.startsWith('data:')) return null; // Skip data URLs

      // Format 1: storage.googleapis.com/{bucket}/path
      const storageMatch = url.match(/storage\.googleapis\.com\/[^/]+\/(.+)/);
      if (storageMatch) return decodeURIComponent(storageMatch[1]);

      // Format 2: firebasestorage.googleapis.com/v0/b/{bucket}/o/{encoded-path}
      const firebaseMatch = url.match(/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/([^?]+)/);
      if (firebaseMatch) return decodeURIComponent(firebaseMatch[1]);

      return null;
    };

    const filesToDelete = [
      data.imageUrl,
      data.originalImageUrl,
      data.thumbnailUrl,
    ].filter(Boolean);

    const deleteResults = await Promise.allSettled(
      filesToDelete.map(async (url) => {
        const path = urlToPath(url);
        if (path) {
          await bucket.file(path).delete();
          return { path, deleted: true };
        }
        return { url, skipped: true };
      })
    );
    console.log('Storage cleanup:', deleteResults);
  } catch (err) {
    // Log but don't fail — Firestore doc deletion is more important
    console.error('Storage cleanup error:', err);
  }

  await docRef.delete();

  return NextResponse.json({ success: true });
}
