import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { SAGE_AUTH_URL } from '@/lib/sage';

/**
 * GET /api/sage/connect
 * Redirects the user to the Sage OAuth authorization page.
 */
export async function GET(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const clientId = process.env.SAGE_CLIENT_ID;
  const redirectUri = process.env.SAGE_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: 'Sage OAuth is not configured. Set SAGE_CLIENT_ID and SAGE_REDIRECT_URI.' },
      { status: 503 }
    );
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'full_access',
    // Encode userId in state so the callback can identify the user
    state: Buffer.from(JSON.stringify({ userId })).toString('base64url'),
  });

  const authUrl = `${SAGE_AUTH_URL}?${params.toString()}`;

  return NextResponse.redirect(authUrl);
}
