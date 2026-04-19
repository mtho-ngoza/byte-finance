'use client';

import { SessionProvider } from 'next-auth/react';
import type { Session } from 'next-auth';

// In development, provide a mock session so useSession() works without
// real Firebase Auth credentials.
const DEV_SESSION: Session | null =
  process.env.NODE_ENV === 'development'
    ? {
        user: { id: 'dev-user-local', name: 'Dev User', email: 'dev@local.test' },
        expires: '2099-01-01T00:00:00.000Z',
      }
    : null;

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider session={DEV_SESSION ?? undefined}>
      {children}
    </SessionProvider>
  );
}
