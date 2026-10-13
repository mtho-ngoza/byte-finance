import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * GET /api/receipts
 * Returns receipts with pagination support
 * Query params:
 *   - needsAttention: filter to only receipts needing attention
 *   - limit: max items to return (default 50, max 100)
 *   - cursor: ISO date string to paginate after
 */
export async function GET(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(request.url);
  const needsAttention = searchParams.get('needsAttention');
  const limitParam = parseInt(searchParams.get('limit') || '50');
  const cursor = searchParams.get('cursor');

  // Clamp limit between 1 and 100
  const limit = Math.min(Math.max(limitParam, 1), 100);

  const db = getAdminDb();

  try {
    let queryRef = db
      .collection(`users/${userId}/receipts`)
      .orderBy('capturedAt', 'desc');

    // Apply cursor if provided
    if (cursor) {
      const cursorDate = new Date(cursor);
      queryRef = queryRef.startAfter(cursorDate);
    }

    // Fetch one extra to check if there are more
    const snap = await queryRef.limit(limit + 1).get();

    let receipts = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        cycleItemId: data.cycleItemId ?? null,
        cycleId: data.cycleId ?? null,
        needsAttention: data.needsAttention ?? false,
        capturedAt: data.capturedAt?.toDate?.()?.toISOString() ?? null,
        createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? null,
      };
    });

    // Check if there are more items
    const hasMore = receipts.length > limit;
    if (hasMore) {
      receipts = receipts.slice(0, limit);
    }

    // Filter by needsAttention in memory if requested
    if (needsAttention === 'true') {
      receipts = receipts.filter((r) => r.needsAttention);
    }

    // Get next cursor
    const nextCursor = hasMore && receipts.length > 0
      ? receipts[receipts.length - 1].capturedAt
      : null;

    return NextResponse.json({
      receipts,
      hasMore,
      nextCursor,
    });
  } catch (error) {
    console.error('Error fetching receipts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch receipts', details: String(error) },
      { status: 500 }
    );
  }
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
