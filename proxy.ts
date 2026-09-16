import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Debug logging
  console.log('[proxy] path:', pathname);
  console.log('[proxy] NODE_ENV:', process.env.NODE_ENV);
  console.log('[proxy] SKIP_AUTH:', process.env.SKIP_AUTH);
  console.log('[proxy] NEXTAUTH_SECRET exists:', !!process.env.NEXTAUTH_SECRET);

  // Skip auth in development or when SKIP_AUTH is set
  if (process.env.NODE_ENV === 'development' || process.env.SKIP_AUTH === 'true') {
    console.log('[proxy] Skipping auth - dev mode or SKIP_AUTH');
    return NextResponse.next();
  }

  // Check for valid session token
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  console.log('[proxy] token exists:', !!token);

  // If no token, redirect to login
  if (!token) {
    console.log('[proxy] No token - redirecting to login');
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  console.log('[proxy] Authenticated - proceeding');
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Protect all routes except:
    // - login/register pages
    // - api/auth (NextAuth routes)
    // - share routes (token-authenticated, not session-authenticated)
    // - api/share routes (public share API)
    // - static files
    '/((?!login|register|api/auth|share|api/share|_next/static|_next/image|favicon.ico|manifest.json|icons).*)',
  ],
};
