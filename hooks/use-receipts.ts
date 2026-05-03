import { useEffect, useState, useCallback } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserId } from '@/hooks/use-user-id';
import type { Receipt } from '@/types';

/**
 * Hook to fetch and subscribe to receipts
 */
export function useReceipts() {
  const userId = useUserId();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, `users/${userId}/receipts`),
      orderBy('capturedAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Receipt[];

        setReceipts(data);
        setLoading(false);
      },
      (err) => {
        console.error('Receipts subscription error:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  // Receipts that need attention (missing amount or vendor)
  const needsAttention = receipts.filter((r) => r.needsAttention);
  const complete = receipts.filter((r) => !r.needsAttention);

  /**
   * Create a new receipt
   */
  const createReceipt = useCallback(async (data: {
    imageUrl: string;
    originalImageUrl?: string;
    thumbnailUrl?: string;
    imageHash: string;
    amountInCents?: number;
    vendor?: string;
    note?: string;
    location?: { lat: number; lng: number; accuracy: number };
    capturedAt?: string;
  }) => {
    const res = await fetch('/api/receipts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create receipt');
    }

    return res.json();
  }, []);

  /**
   * Update a receipt
   */
  const updateReceipt = useCallback(async (
    id: string,
    data: {
      amountInCents?: number;
      vendor?: string;
      note?: string;
      cycleItemId?: string;
      cycleId?: string;
    }
  ) => {
    const res = await fetch(`/api/receipts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update receipt');
    }

    return res.json();
  }, []);

  /**
   * Delete a receipt
   */
  const deleteReceipt = useCallback(async (id: string) => {
    const res = await fetch(`/api/receipts/${id}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to delete receipt');
    }

    return res.json();
  }, []);

  return {
    receipts,
    needsAttention,
    complete,
    loading,
    error,
    createReceipt,
    updateReceipt,
    deleteReceipt,
  };
}
