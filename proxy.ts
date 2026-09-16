import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';

export async function proxy(request: NextRequest) {
  // Skip auth in development or when SKIP_AUTH is set
  if (process.env.NODE_ENV === 'development' || process.env.SKIP_AUTH === 'true') {
    return NextResponse.next();
  }

  // Check for valid session token
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // If no token, redirect to login
  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

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
