'use client';

import { useSession } from 'next-auth/react';

/** Fixed dev user ID — matches the one in lib/auth.ts */
const DEV_USER_ID = 'dev-user-local';

/**
 * Returns the current user ID.
 * In development, returns a fixed dev user ID to bypass auth.
 * In production, returns the session user ID.
 */
export function useUserId(): string | undefined {
  const { data: session } = useSession();

  if (process.env.NODE_ENV === 'development') {
    return DEV_USER_ID;
  }

  return session?.user?.id;
}
