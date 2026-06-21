import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * GET /api/wishlist
 * Get all wishlist items, optionally filtered by year
 */
export async function GET(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(request.url);
  const year = searchParams.get('year');

  const db = getAdminDb();
  let query = db.collection(`users/${userId}/wishlist`).orderBy('priority', 'asc');

  const snap = await query.get();

  type WishlistDoc = {
    id: string;
    targetYear: number;
    targetYearEnd?: number;
    createdAt: string | null;
    updatedAt: string | null;
    completedAt: string | null;
    [key: string]: unknown;
  };

  let items: WishlistDoc[] = snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? null,
      completedAt: data.completedAt?.toDate?.()?.toISOString() ?? null,
    } as WishlistDoc;
  });

  // Filter by year if specified (include items where targetYear matches OR year falls within range)
  if (year) {
    const yearNum = parseInt(year);
    items = items.filter((item) => {
      if (item.targetYear === yearNum) return true;
      if (item.targetYearEnd && item.targetYear <= yearNum && item.targetYearEnd >= yearNum) return true;
      return false;
    });
  }

  return NextResponse.json({ items });
}

/**
 * POST /api/wishlist
 * Create a new wishlist item
 */
export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await request.json();
  const {
    title,
    description,
    type,
    targetYear,
    targetYearEnd,
    linkedGoalId,
    linkedCommitmentId,
    targetAmount,
    priority,
  } = body;

  if (!title || !type || !targetYear) {
    return NextResponse.json(
      { error: 'title, type, and targetYear are required' },
      { status: 400 }
    );
  }

  const db = getAdminDb();
  const now = FieldValue.serverTimestamp();

  // Calculate initial progress if linked
  let progress = 0;
  let currentAmount = 0;

  if (linkedGoalId) {
    const goalDoc = await db.doc(`users/${userId}/goals/${linkedGoalId}`).get();
    if (goalDoc.exists) {
      const goal = goalDoc.data()!;
      currentAmount = goal.currentAmount || 0;
      if (goal.targetAmount > 0) {
        progress = Math.min(100, Math.round((currentAmount / goal.targetAmount) * 100));
      }
    }
  }

  const itemData = {
    title,
    description: description || null,
    type,
    targetYear,
    targetYearEnd: targetYearEnd || null,
    linkedGoalId: linkedGoalId || null,
    linkedCommitmentId: linkedCommitmentId || null,
    targetAmount: targetAmount || null,
    currentAmount,
    progress,
    status: 'active',
    priority: priority || 999,
    createdAt: now,
    updatedAt: now,
  };

  const docRef = await db.collection(`users/${userId}/wishlist`).add(itemData);

  return NextResponse.json({ id: docRef.id, ...itemData }, { status: 201 });
}
