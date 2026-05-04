import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getSageTokens } from '@/lib/sage';

/**
 * GET /api/sage/status
 * Returns the current Sage connection status for the authenticated user.
 */
export async function GET(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const tokens = await getSageTokens(userId);

  if (!tokens) {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({
    connected: true,
    companyId: tokens.companyId,
    companyName: tokens.companyName,
    connectedAt: tokens.connectedAt,
    // Don't expose tokens to the client
  });
}
