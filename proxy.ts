import { NextRequest, NextResponse } from 'next/server';

// Skip auth in development or when SKIP_AUTH is set (for local testing with production build)
export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV === 'development' || process.env.SKIP_AUTH === 'true') {
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
