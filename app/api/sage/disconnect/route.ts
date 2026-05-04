import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getSageTokens, deleteSageTokens, SAGE_TOKEN_URL } from '@/lib/sage';

/**
 * DELETE /api/sage/disconnect
 * Revokes the Sage access token and removes the integration from Firestore.
 */
export async function DELETE(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const tokens = await getSageTokens(userId);

  if (!tokens) {
    return NextResponse.json({ error: 'Sage is not connected' }, { status: 404 });
  }

  // Attempt to revoke the token with Sage (best-effort — don't fail if it errors)
  try {
    const clientId = process.env.SAGE_CLIENT_ID;
    const clientSecret = process.env.SAGE_CLIENT_SECRET;

    if (clientId && clientSecret) {
      const revokeBody = new URLSearchParams({
        token: tokens.accessToken,
        client_id: clientId,
        client_secret: clientSecret,
      });

      await fetch(`${SAGE_TOKEN_URL}/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: revokeBody.toString(),
      });
    }
  } catch (err) {
    console.error('Sage token revocation failed (non-fatal):', err);
  }

  await deleteSageTokens(userId);

  return NextResponse.json({ success: true });
}
