'use client';

import { SessionProvider } from 'next-auth/react';

/**
 * Minimal providers for share pages.
 * Only includes SessionProvider to detect if user is logged in (for join functionality).
 * Does NOT include FirebaseAuthProvider or ThemeProvider.
 */
export function ShareProviders({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
