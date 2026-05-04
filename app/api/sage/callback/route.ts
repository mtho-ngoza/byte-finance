import { NextRequest, NextResponse } from 'next/server';
import { SAGE_TOKEN_URL, SAGE_API_BASE, saveSageTokens } from '@/lib/sage';
import type { SageTokens } from '@/lib/sage';

/**
 * GET /api/sage/callback
 * Handles the OAuth callback from Sage.
 * Exchanges the authorization code for tokens and stores them in Firestore.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // Handle OAuth errors from Sage
  if (error) {
    const redirectUrl = new URL('/settings', request.nextUrl.origin);
    redirectUrl.searchParams.set('sage_error', error);
    return NextResponse.redirect(redirectUrl.toString());
  }

  if (!code || !state) {
    return NextResponse.json({ error: 'Missing code or state' }, { status: 400 });
  }

  // Decode userId from state
  let userId: string;
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
    userId = decoded.userId;
    if (!userId) throw new Error('No userId in state');
  } catch {
    return NextResponse.json({ error: 'Invalid state parameter' }, { status: 400 });
  }

  const clientId = process.env.SAGE_CLIENT_ID;
  const clientSecret = process.env.SAGE_CLIENT_SECRET;
  const redirectUri = process.env.SAGE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      { error: 'Sage OAuth is not configured on the server.' },
      { status: 503 }
    );
  }

  // Exchange code for tokens
  const tokenBody = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const tokenRes = await fetch(SAGE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenBody.toString(),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    console.error('Sage token exchange failed:', tokenRes.status, text);
    const redirectUrl = new URL('/settings', request.nextUrl.origin);
    redirectUrl.searchParams.set('sage_error', 'token_exchange_failed');
    return NextResponse.redirect(redirectUrl.toString());
  }

  const tokenData = await tokenRes.json();
  const { access_token, refresh_token, expires_in } = tokenData;

  // Fetch company info from Sage API
  let companyId = '';
  let companyName = '';
  try {
    const businessRes = await fetch(`${SAGE_API_BASE}/business`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (businessRes.ok) {
      const biz = await businessRes.json();
      companyId = biz.id ?? '';
      companyName = biz.name ?? '';
    }
  } catch (err) {
    console.error('Failed to fetch Sage business info:', err);
  }

  const tokens: SageTokens = {
    accessToken: access_token,
    refreshToken: refresh_token,
    expiresAt: Date.now() + expires_in * 1000,
    companyId,
    companyName,
    connectedAt: new Date().toISOString(),
  };

  await saveSageTokens(userId, tokens);

  // Redirect back to settings with success indicator
  const redirectUrl = new URL('/settings', request.nextUrl.origin);
  redirectUrl.searchParams.set('sage_connected', '1');
  return NextResponse.redirect(redirectUrl.toString());
}
