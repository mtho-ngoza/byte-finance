import { NextRequest, NextResponse } from 'next/server';

// In development, skip auth entirely so the app can be tested without credentials.
// In production, delegate to NextAuth middleware.
export function middleware(request: NextRequest) {
  if (process.env.NODE_ENV === 'development') {
    return NextResponse.next();
  }

  // Dynamically require NextAuth middleware only in production to avoid
  // the NO_SECRET error during local dev.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { default: nextAuthMiddleware } = require('next-auth/middleware');
  return nextAuthMiddleware(request);
}

export const config = {
  matcher: [
    '/((?!login|api/auth|_next/static|_next/image|favicon.ico|manifest.json|icons).*)',
  ],
};
