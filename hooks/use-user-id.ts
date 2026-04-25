'use client';

import { useSession } from 'next-auth/react';

/** Fixed dev user ID — matches the one in lib/auth.ts */
const DEV_USER_ID = 'dev-user-local';

/**
 * Returns the current user ID.
 * In development or when SKIP_AUTH is set, returns a fixed dev user ID.
 * In production, returns the session user ID.
 */
export function useUserId(): string | undefined {
  const { data: session } = useSession();

  // NEXT_PUBLIC_ prefix needed for client-side access
  if (process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_SKIP_AUTH === 'true') {
    return DEV_USER_ID;
  }

  return session?.user?.id;
}
