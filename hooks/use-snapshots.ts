import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserId } from '@/hooks/use-user-id';
import type { MonthlySnapshot } from '@/types';

/**
 * Hook to fetch and subscribe to monthly snapshots
 */
export function useSnapshots() {
  const userId = useUserId();
  const [snapshots, setSnapshots] = useState<MonthlySnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, `users/${userId}/snapshots`),
      orderBy('year', 'desc'),
      orderBy('month', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as MonthlySnapshot[];
        setSnapshots(data);
        setLoading(false);
      },
      (err) => {
        console.error('Snapshots subscription error:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  /**
   * Generate or refresh a snapshot for a specific cycle
   */
  const generateSnapshot = async (cycleId?: string) => {
    try {
      const res = await fetch('/api/analytics/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cycleId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate snapshot');
      }

      return await res.json();
    } catch (err) {
      console.error('Generate snapshot error:', err);
      throw err;
    }
  };

  return {
    snapshots,
    loading,
    error,
    generateSnapshot,
  };
}
