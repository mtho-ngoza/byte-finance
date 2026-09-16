'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

/**
 * Provider that syncs NextAuth session with Firebase Auth.
 * This enables client-side Firestore access with security rules.
 */
export function FirebaseAuthProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [firebaseReady, setFirebaseReady] = useState(false);

  useEffect(() => {
    // Skip in development if using dev user
    if (process.env.NODE_ENV === 'development') {
      setFirebaseReady(true);
      return;
    }

    // Wait for session to be determined
    if (status === 'loading') return;

    // If no session, we're not authenticated
    if (!session?.user?.id) {
      setFirebaseReady(true);
      return;
    }

    // Check if already signed into Firebase with correct user
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser?.uid === session.user.id) {
        // Already signed in with correct user
        setFirebaseReady(true);
        return;
      }

      // Need to sign in to Firebase
      try {
        const res = await fetch('/api/auth/firebase-token');
        if (!res.ok) {
          console.error('Failed to get Firebase token');
          setFirebaseReady(true);
          return;
        }

        const { token } = await res.json();
        await signInWithCustomToken(auth, token);
        console.log('Signed into Firebase Auth');
        setFirebaseReady(true);
      } catch (error) {
        console.error('Firebase Auth sign-in error:', error);
        setFirebaseReady(true);
      }
    });

    return () => unsubscribe();
  }, [session, status]);

  // In development, render immediately
  if (process.env.NODE_ENV === 'development') {
    return <>{children}</>;
  }

  // Show nothing while Firebase auth is syncing (brief moment)
  if (!firebaseReady && status !== 'loading') {
    return null;
  }

  return <>{children}</>;
}
