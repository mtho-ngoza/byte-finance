'use client';

import { useFirebaseAuth } from '@/components/providers/firebase-auth-provider';

/**
 * Returns the current user ID for Firestore operations.
 *
 * In production: Returns the Firebase Auth UID after the session is synced.
 * In development: Returns 'dev-user-local' for local testing.
 *
 * This hook should be used by all Firestore queries to ensure the user ID
 * matches both the document path AND the Firebase Auth UID (for security rules).
 *
 * Returns undefined while loading or if not authenticated.
 */
export function useUserId(): string | undefined {
  const { userId, ready } = useFirebaseAuth();

  // Return undefined while Firebase Auth is initializing
  // This prevents Firestore queries from running with wrong/no user ID
  if (!ready) {
    return undefined;
  }

  return userId ?? undefined;
}

/**
 * Returns true if the user ID is ready to use.
 * Useful for showing loading states in components.
 */
export function useUserIdReady(): boolean {
  const { ready } = useFirebaseAuth();
  return ready;
}
