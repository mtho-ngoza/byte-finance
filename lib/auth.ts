import { NextRequest, NextResponse } from 'next/server';
import { getServerSession, NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export const authOptions: NextAuthOptions = {
  providers: [
    // Only register Google provider when credentials are configured
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [GoogleProvider({
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        })]
      : []),
    CredentialsProvider({
      name: 'Email & Password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        try {
          // Dynamically import the Firebase client SDK so it's never bundled
          // server-side during build/static generation.
          const { signInWithEmailAndPassword } = await import('firebase/auth');
          const { getClientAuth } = await import('@/lib/firebase');
          const userCredential = await signInWithEmailAndPassword(
            getClientAuth(),
            credentials.email,
            credentials.password
          );
          const user = userCredential.user;
          return { id: user.uid, email: user.email, name: user.displayName };
        } catch {
          return null;
        }
      },
    }),
  ],

  session: {
    strategy: 'jwt',
  },

  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
      }
      // For Google sign-in, use the sub (Google UID) as the user id
      if (account?.provider === 'google' && token.sub) {
        token.id = token.sub;
      }
      return token;
    },

    async session({ session, token }) {
      if (token.id && session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },

    async signIn({ user }) {
      const userId = user.id ?? '';
      if (!userId) return true;

      // Skip Firestore write if Admin SDK isn't configured (e.g. local dev)
      if (!process.env.FIREBASE_PROJECT_ID) return true;

      try {
        const db = getAdminDb();
        const userRef = db.collection('users').doc(userId);
        const snap = await userRef.get();

        if (!snap.exists) {
          const now = FieldValue.serverTimestamp();
          await userRef.set({
            id: userId,
            email: user.email ?? '',
            displayName: user.name ?? user.email ?? '',
            preferences: {
              theme: 'dark',
              notificationsEnabled: false,
              currency: 'ZAR',
              payDayType: 'last_working_day',
            },
            createdAt: now,
            updatedAt: now,
          });
        }
      } catch (err) {
        console.error('Failed to create UserProfile:', err);
        // Don't block sign-in if profile creation fails
      }

      return true;
    },
  },

  pages: {
    signIn: '/login',
  },
};

/** Fixed dev user ID — used when NODE_ENV=development to bypass auth. */
export const DEV_USER_ID = 'dev-user-local';

/**
 * Middleware helper for protected API routes.
 * In development, returns a fixed dev user so the app works without credentials.
 * In production, verifies the NextAuth session.
 */
export async function withAuth(
  _request: NextRequest
): Promise<{ userId: string } | NextResponse> {
  if (process.env.NODE_ENV === 'development') {
    return { userId: DEV_USER_ID };
  }

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return { userId };
}
