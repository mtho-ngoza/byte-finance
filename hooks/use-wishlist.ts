import { useEffect, useState, useCallback } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserId } from '@/hooks/use-user-id';
import type { WishlistItem } from '@/types';

/**
 * Hook to fetch and manage wishlist items
 */
export function useWishlist() {
  const userId = useUserId();
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Subscribe to wishlist items
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, `users/${userId}/wishlist`),
      orderBy('priority', 'asc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as WishlistItem[];
        setItems(data);
        setLoading(false);
      },
      (err) => {
        console.error('Wishlist subscription error:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  // Get items for a specific year
  const getItemsForYear = useCallback(
    (year: number) => {
      return items.filter((item) => {
        if (item.targetYear === year) return true;
        if (item.targetYearEnd && item.targetYear <= year && item.targetYearEnd >= year) return true;
        return false;
      });
    },
    [items]
  );

  // Get year statistics
  const getYearStats = useCallback(
    (year: number) => {
      const yearItems = getItemsForYear(year);
      const completed = yearItems.filter((i) => i.status === 'completed').length;
      const active = yearItems.filter((i) => i.status === 'active').length;
      const abandoned = yearItems.filter((i) => i.status === 'abandoned').length;
      const carriedForward = yearItems.filter((i) => i.status === 'carried-forward').length;
      const total = yearItems.length;
      const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

      return { total, completed, active, abandoned, carriedForward, completionRate };
    },
    [getItemsForYear]
  );

  // Get all years that have items
  const getYearsWithItems = useCallback(() => {
    const years = new Set<number>();
    items.forEach((item) => {
      years.add(item.targetYear);
      if (item.targetYearEnd) {
        for (let y = item.targetYear; y <= item.targetYearEnd; y++) {
          years.add(y);
        }
      }
    });
    return Array.from(years).sort((a, b) => b - a); // Descending
  }, [items]);

  // Create a new wishlist item
  const createItem = useCallback(
    async (data: {
      title: string;
      description?: string;
      type: 'short-term' | 'long-term';
      targetYear: number;
      targetYearEnd?: number;
      linkedGoalId?: string;
      linkedCommitmentId?: string;
      targetAmount?: number;
      priority?: number;
    }) => {
      const res = await fetch('/api/wishlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create wishlist item');
      }

      return res.json();
    },
    []
  );

  // Update a wishlist item
  const updateItem = useCallback(
    async (
      id: string,
      data: Partial<{
        title: string;
        description: string;
        type: 'short-term' | 'long-term';
        targetYear: number;
        targetYearEnd: number;
        linkedGoalId: string;
        linkedCommitmentId: string;
        targetAmount: number;
        progress: number;
        status: 'active' | 'completed' | 'abandoned' | 'carried-forward';
        priority: number;
        carriedFromYear: number;
      }>
    ) => {
      const res = await fetch(`/api/wishlist/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update wishlist item');
      }

      return res.json();
    },
    []
  );

  // Delete a wishlist item
  const deleteItem = useCallback(async (id: string) => {
    const res = await fetch(`/api/wishlist/${id}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to delete wishlist item');
    }

    return res.json();
  }, []);

  // Complete an item
  const completeItem = useCallback(
    async (id: string) => {
      return updateItem(id, { status: 'completed' });
    },
    [updateItem]
  );

  // Abandon an item
  const abandonItem = useCallback(
    async (id: string) => {
      return updateItem(id, { status: 'abandoned' });
    },
    [updateItem]
  );

  // Carry forward to next year
  const carryForward = useCallback(
    async (id: string, fromYear: number) => {
      return updateItem(id, {
        status: 'carried-forward',
        targetYear: fromYear + 1,
        carriedFromYear: fromYear,
      });
    },
    [updateItem]
  );

  // Sync progress with linked goals
  const syncProgress = useCallback(async () => {
    const res = await fetch('/api/wishlist/sync', { method: 'POST' });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to sync wishlist');
    }
    return res.json();
  }, []);

  return {
    items,
    loading,
    error,
    getItemsForYear,
    getYearStats,
    getYearsWithItems,
    createItem,
    updateItem,
    deleteItem,
    completeItem,
    abandonItem,
    carryForward,
    syncProgress,
  };
}
