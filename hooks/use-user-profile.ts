'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserId } from './use-user-id';
import type { UserProfile } from '@/types';

interface UseUserProfileResult {
  profile: UserProfile | null;
  loading: boolean;
}

export function useUserProfile(): UseUserProfileResult {
  const userId = useUserId();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const ref = doc(db, `users/${userId}`);
    const unsubscribe = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setProfile({ id: snap.id, ...snap.data() } as UserProfile);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, [userId]);

  return { profile, loading };
}
