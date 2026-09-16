import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { adminAuth } from '@/lib/firebase-admin';

/**
 * Generate a custom Firebase Auth token for the current NextAuth user.
 * This allows the client-side Firestore SDK to authenticate and
 * satisfy security rules that check request.auth.uid.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Generate a custom token with the NextAuth user ID
    // This ensures Firebase Auth UID matches the document paths
    const customToken = await adminAuth.createCustomToken(session.user.id);

    return NextResponse.json({ token: customToken });
  } catch (error) {
    console.error('Error generating Firebase token:', error);
    return NextResponse.json(
      { error: 'Failed to generate token' },
      { status: 500 }
    );
  }
}
