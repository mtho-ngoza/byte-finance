import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * GET /api/receipts
 * Returns all receipts, optionally filtered by needsAttention
 */
export async function GET(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(request.url);
  const needsAttention = searchParams.get('needsAttention');

  const db = getAdminDb();
  let query = db
    .collection(`users/${userId}/receipts`)
    .orderBy('capturedAt', 'desc');

  if (needsAttention === 'true') {
    query = db
      .collection(`users/${userId}/receipts`)
      .where('needsAttention', '==', true)
      .orderBy('capturedAt', 'desc');
  }

  const snap = await query.limit(100).get();

  const receipts = snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      capturedAt: data.capturedAt?.toDate?.()?.toISOString() ?? null,
      createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? null,
    };
  });

  return NextResponse.json({ receipts });
}

/**
 * POST /api/receipts
 * Create a new receipt
 */
export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await request.json();
  const {
    imageUrl,
    originalImageUrl,
    thumbnailUrl,
    imageHash,
    amountInCents,
    vendor,
    note,
    location,
    capturedAt,
  } = body;

  if (!imageUrl || !imageHash) {
    return NextResponse.json(
      { error: 'imageUrl and imageHash are required' },
      { status: 400 }
    );
  }

  // Check for duplicate by hash
  const db = getAdminDb();
  const existingSnap = await db
    .collection(`users/${userId}/receipts`)
    .where('imageHash', '==', imageHash)
    .limit(1)
    .get();

  if (!existingSnap.empty) {
    return NextResponse.json(
      { error: 'Duplicate receipt detected', existingId: existingSnap.docs[0].id },
      { status: 409 }
    );
  }

  const now = FieldValue.serverTimestamp();

  // Compute needsAttention
  const needsAttention = !amountInCents || !vendor;

  const receiptData = {
    imageUrl,
    originalImageUrl: originalImageUrl ?? null,
    thumbnailUrl: thumbnailUrl ?? null,
    imageHash,
    amountInCents: amountInCents ?? null,
    vendor: vendor ?? null,
    note: note ?? null,
    location: location ?? null,
    capturedAt: capturedAt ? new Date(capturedAt) : now,
    needsAttention,
    cycleItemId: null,
    cycleId: null,
    createdAt: now,
    updatedAt: now,
  };

  const docRef = await db.collection(`users/${userId}/receipts`).add(receiptData);

  return NextResponse.json({ id: docRef.id, ...receiptData }, { status: 201 });
}
