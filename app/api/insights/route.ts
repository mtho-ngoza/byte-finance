import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';

/**
 * GET /api/insights
 * Returns active (non-dismissed, non-expired) insights for the user
 */
export async function GET(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const db = getAdminDb();
  const now = new Date();

  // Get all non-dismissed insights
  const snap = await db
    .collection(`users/${userId}/insights`)
    .where('isDismissed', '==', false)
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();

  // Filter out expired insights
  const insights = snap.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
        expiresAt: data.expiresAt?.toDate?.()?.toISOString() ?? null,
      };
    })
    .filter((insight) => {
      if (!insight.expiresAt) return true;
      return new Date(insight.expiresAt) > now;
    });

  return NextResponse.json({ insights });
}
