'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import { signInWithCustomToken, onAuthStateChanged, User, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';

interface FirebaseAuthContextValue {
  /** Firebase Auth user (null if not authenticated) */
  firebaseUser: User | null;
  /** Firebase Auth user ID (matches NextAuth user ID) */
  userId: string | null;
  /** True while Firebase Auth is initializing */
  loading: boolean;
  /** True if Firebase Auth is ready (signed in or determined to be signed out) */
  ready: boolean;
  /** Error if Firebase Auth failed */
  error: Error | null;
}

const FirebaseAuthContext = createContext<FirebaseAuthContextValue>({
  firebaseUser: null,
  userId: null,
  loading: true,
  ready: false,
  error: null,
});

/**
 * Hook to access Firebase Auth state.
 * Use this instead of useSession() when you need the Firebase user ID for Firestore.
 */
export function useFirebaseAuth() {
  return useContext(FirebaseAuthContext);
}

/**
 * Hook to get the current user ID for Firestore operations.
 * Returns the Firebase Auth UID which matches the document path.
 * Returns null if not authenticated or still loading.
 */
export function useFirebaseUserId(): string | null {
  const { userId, ready } = useFirebaseAuth();
  return ready ? userId : null;
}

interface FirebaseAuthProviderProps {
  children: ReactNode;
}

/**
 * Provider that syncs NextAuth session with Firebase Auth.
 *
 * This enables client-side Firestore access with security rules by:
 * 1. Detecting NextAuth session changes
 * 2. Fetching a custom Firebase token from the server
 * 3. Signing into Firebase Auth with the custom token
 * 4. Providing the Firebase user ID to hooks for Firestore queries
 *
 * Firebase custom tokens expire after 1 hour, but Firebase Auth automatically
 * refreshes the ID token. We re-sync if the session changes.
 */
export function FirebaseAuthProvider({ children }: FirebaseAuthProviderProps) {
  const { data: session, status: sessionStatus } = useSession();
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Sign into Firebase Auth with custom token
  const signInToFirebase = useCallback(async (nextAuthUserId: string) => {
    try {
      setLoading(true);
      setError(null);

      // Check if already signed in with correct user
      if (auth.currentUser?.uid === nextAuthUserId) {
        setFirebaseUser(auth.currentUser);
        setLoading(false);
        setReady(true);
        return;
      }

      // Fetch custom token from server
      const res = await fetch('/api/auth/firebase-token');
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to get Firebase token: ${res.status}`);
      }

      const { token } = await res.json();
      if (!token) {
        throw new Error('No token returned from server');
      }

      // Sign into Firebase Auth
      const credential = await signInWithCustomToken(auth, token);
      setFirebaseUser(credential.user);
      console.log('[FirebaseAuth] Signed in as:', credential.user.uid);
    } catch (err) {
      console.error('[FirebaseAuth] Sign-in error:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
      setReady(true);
    }
  }, []);

  // Sign out of Firebase Auth
  const signOutOfFirebase = useCallback(async () => {
    try {
      if (auth.currentUser) {
        await signOut(auth);
        console.log('[FirebaseAuth] Signed out');
      }
      setFirebaseUser(null);
    } catch (err) {
      console.error('[FirebaseAuth] Sign-out error:', err);
    } finally {
      setLoading(false);
      setReady(true);
    }
  }, []);

  // Listen for Firebase Auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      // Don't set ready here - let the sync logic handle it
    });

    return () => unsubscribe();
  }, []);

  // Sync NextAuth session with Firebase Auth
  useEffect(() => {
    // Skip in development mode - use dev user directly
    if (process.env.NODE_ENV === 'development') {
      setLoading(false);
      setReady(true);
      return;
    }

    // Wait for NextAuth to determine session status
    if (sessionStatus === 'loading') {
      return;
    }

    const nextAuthUserId = session?.user?.id;

    if (nextAuthUserId) {
      // User is signed into NextAuth - sync with Firebase
      signInToFirebase(nextAuthUserId);
    } else {
      // User is not signed into NextAuth - sign out of Firebase
      signOutOfFirebase();
    }
  }, [session?.user?.id, sessionStatus, signInToFirebase, signOutOfFirebase]);

  // In development, use dev user ID directly
  const userId = process.env.NODE_ENV === 'development'
    ? 'dev-user-local'
    : firebaseUser?.uid ?? null;

  const value: FirebaseAuthContextValue = {
    firebaseUser,
    userId,
    loading,
    ready,
    error,
  };

  return (
    <FirebaseAuthContext.Provider value={value}>
      {children}
    </FirebaseAuthContext.Provider>
  );
}
