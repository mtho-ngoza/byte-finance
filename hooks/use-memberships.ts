'use client';

import { useEffect, useState, useCallback } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserId } from './use-user-id';
import type { EventMembership } from '@/types';

interface UseMembershipsResult {
  memberships: EventMembership[];
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

/**
 * Hook to get events shared with the current user
 */
export function useMemberships(): UseMembershipsResult {
  const userId = useUserId();
  const [memberships, setMemberships] = useState<EventMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const refresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (!userId) {
      setMemberships([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const membershipsRef = collection(db, 'users', userId, 'memberships');
    const q = query(membershipsRef, orderBy('joinedAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as EventMembership[];
        setMemberships(data);
        setLoading(false);
      },
      (err) => {
        console.error('Memberships subscription error:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId, refreshTrigger]);

  return { memberships, loading, error, refresh };
}
