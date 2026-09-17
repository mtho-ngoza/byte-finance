import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';

/**
 * GET /api/memberships
 * List all events shared with the current user
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const userId = session.user.id;
  const db = getAdminDb();

  const snapshot = await db
    .collection('users')
    .doc(userId)
    .collection('memberships')
    .orderBy('joinedAt', 'desc')
    .get();

  const memberships = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  return NextResponse.json(memberships);
}
