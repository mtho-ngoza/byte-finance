import { useEffect, useState, useCallback, useRef } from 'react';
import { collection, onSnapshot, query, orderBy, limit as fbLimit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserId } from '@/hooks/use-user-id';
import type { Receipt } from '@/types';

const PAGE_SIZE = 50;

/**
 * Hook to fetch and subscribe to receipts with pagination
 */
export function useReceipts() {
  const userId = useUserId();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const initialLoadDone = useRef(false);

  // Initial load and real-time subscription for recent receipts
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    // Subscribe to most recent receipts only (for real-time updates)
    const q = query(
      collection(db, `users/${userId}/receipts`),
      orderBy('capturedAt', 'desc'),
      fbLimit(PAGE_SIZE)
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Receipt[];

        if (!initialLoadDone.current) {
          // First load - set receipts and determine if there's more
          setReceipts(data);
          setHasMore(data.length === PAGE_SIZE);
          if (data.length > 0) {
            const lastReceipt = data[data.length - 1];
            const capturedAt = lastReceipt.capturedAt;
            setCursor(capturedAt instanceof Date ? capturedAt.toISOString() : capturedAt?.toDate?.()?.toISOString() ?? null);
          }
          initialLoadDone.current = true;
        } else {
          // Subsequent updates - merge new receipts at the top
          setReceipts((prev) => {
            const existingIds = new Set(prev.map((r) => r.id));
            const newReceipts = data.filter((r) => !existingIds.has(r.id));
            // Update existing receipts and add new ones
            const updatedMap = new Map(prev.map((r) => [r.id, r]));
            data.forEach((r) => updatedMap.set(r.id, r));
            return Array.from(updatedMap.values()).sort((a, b) => {
              const aDate = a.capturedAt instanceof Date ? a.capturedAt : new Date(a.capturedAt?.toDate?.() ?? a.capturedAt ?? 0);
              const bDate = b.capturedAt instanceof Date ? b.capturedAt : new Date(b.capturedAt?.toDate?.() ?? b.capturedAt ?? 0);
              return bDate.getTime() - aDate.getTime();
            });
          });
        }
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

  /**
   * Load more receipts (pagination)
   */
  const loadMore = useCallback(async () => {
    if (!userId || !hasMore || loadingMore || !cursor) return;

    setLoadingMore(true);
    try {
      const res = await fetch(`/api/receipts?limit=${PAGE_SIZE}&cursor=${encodeURIComponent(cursor)}`);
      if (!res.ok) throw new Error('Failed to load more receipts');

      const data = await res.json();
      const newReceipts = data.receipts as Receipt[];

      setReceipts((prev) => {
        const existingIds = new Set(prev.map((r) => r.id));
        const uniqueNew = newReceipts.filter((r) => !existingIds.has(r.id));
        return [...prev, ...uniqueNew];
      });

      setHasMore(data.hasMore);
      setCursor(data.nextCursor);
    } catch (err) {
      console.error('Failed to load more receipts:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [userId, hasMore, loadingMore, cursor]);

  // Receipts that need attention:
  // - Missing amount, OR
  // - Missing vendor AND not linked to a payment (unlinked receipts without vendor need attention)
  // Linked receipts have context from the payment, so vendor is optional
  const needsAttention = receipts.filter((r) =>
    !r.amountInCents || (!r.vendor && !r.cycleItemId)
  );
  const complete = receipts.filter((r) => r.amountInCents && (r.vendor || r.cycleItemId));

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
    loadingMore,
    hasMore,
    error,
    loadMore,
    createReceipt,
    updateReceipt,
    deleteReceipt,
  };
}
