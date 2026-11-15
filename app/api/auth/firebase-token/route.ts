import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { adminAuth } from '@/lib/firebase-admin';

/**
 * Generate a custom Firebase Auth token for the current NextAuth user.
 * This allows the client-side Firestore SDK to authenticate and
 * satisfy security rules that check request.auth.uid.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await withAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    // Generate a custom token with the NextAuth user ID
    // This ensures Firebase Auth UID matches the document paths
    const customToken = await adminAuth.createCustomToken(userId);

    return NextResponse.json({ token: customToken });
  } catch (error) {
    console.error('Error generating Firebase token:', error);
    return NextResponse.json(
      { error: 'Failed to generate token' },
      { status: 500 }
    );
  }
}
