'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  Timestamp,
  arrayUnion,
  increment,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserId } from './use-user-id';
import { useAppStore } from '@/stores/app-store';
import type { CycleItem, CycleItemStatus, Category } from '@/types';

interface UseCycleItemsResult {
  items: CycleItem[];
  loading: boolean;
  /** Items grouped by category */
  itemsByCategory: Map<Category, CycleItem[]>;
  /** Items that need attention (due or overdue) */
  attentionItems: CycleItem[];
  /** Total committed amount in cents */
  totalCommitted: number;
  /** Total paid amount in cents (uses actualAmount when set) */
  totalPaid: number;
  /** Update item status with optimistic update */
  updateStatus: (itemId: string, status: CycleItemStatus, actualAmount?: number) => Promise<void>;
  /** Update item committed amount with optimistic update */
  updateAmount: (itemId: string, newAmount: number) => Promise<void>;
}

export function useCycleItems(cycleId: string | null): UseCycleItemsResult {
  const userId = useUserId();
  const [rawItems, setRawItems] = useState<CycleItem[]>([]);
  const [loading, setLoading] = useState(true);

  const optimisticItems = useAppStore((s) => s.optimisticCycleItems);
  const setOptimisticItem = useAppStore((s) => s.setOptimisticCycleItem);
  const removeOptimisticItem = useAppStore((s) => s.removeOptimisticCycleItem);
  const accountFilter = useAppStore((s) => s.accountFilter);

  useEffect(() => {
    if (!userId || !cycleId) {
      setRawItems([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, `users/${userId}/cycleItems`),
      where('cycleId', '==', cycleId),
      orderBy('sortOrder')
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CycleItem);
      setRawItems(docs);
      setLoading(false);
    });

    return unsubscribe;
  }, [userId, cycleId]);

  // Merge optimistic updates
  const items = rawItems
    .map((item) => optimisticItems.get(item.id) ?? item)
    .filter((item) => {
      if (accountFilter === 'all') return true;
      return item.accountType === accountFilter;
    });

  // Group by category
  const itemsByCategory = new Map<Category, CycleItem[]>();
  for (const item of items) {
    const list = itemsByCategory.get(item.category) ?? [];
    list.push(item);
    itemsByCategory.set(item.category, list);
  }

  // Items needing attention (due status)
  const attentionItems = items.filter((item) => item.status === 'due');

  // Totals — use actualAmount for paid variable items when set
  const totalCommitted = items.reduce((sum, i) => sum + i.amount, 0);
  const totalPaid = items
    .filter((i) => i.status === 'paid')
    .reduce((sum, i) => sum + (i.actualAmount ?? i.amount), 0);

  // Update status with optimistic update and smart linking
  const updateStatus = useCallback(
    async (itemId: string, status: CycleItemStatus, actualAmount?: number) => {
      if (!userId || !cycleId) return;

      const item = items.find((i) => i.id === itemId);
      if (!item) return;

      const previousStatus = item.status;
      const now = Timestamp.now();
      // The effective paid amount: use actualAmount if provided, else existing actualAmount, else committed amount
      const effectiveAmount = actualAmount ?? item.actualAmount ?? item.amount;

      // Optimistic update
      const optimisticItem: CycleItem = {
        ...item,
        status,
        actualAmount: status === 'paid' && actualAmount !== undefined ? actualAmount : item.actualAmount,
        paidDate: status === 'paid' ? now : undefined,
        updatedAt: now,
      };
      setOptimisticItem(itemId, optimisticItem);

      try {
        const itemRef = doc(db, `users/${userId}/cycleItems`, itemId);
        const updateData: Record<string, unknown> = {
          status,
          paidDate: status === 'paid' ? now : null,
          updatedAt: now,
        };
        if (status === 'paid' && actualAmount !== undefined) {
          updateData.actualAmount = actualAmount;
        }
        await updateDoc(itemRef, updateData);

        // Update cycle totals using effective amount
        const cycleRef = doc(db, `users/${userId}/cycles`, cycleId);
        const previousEffective = item.actualAmount ?? item.amount;
        if (status === 'paid' && previousStatus !== 'paid') {
          await updateDoc(cycleRef, {
            totalPaid: increment(effectiveAmount),
            paidCount: increment(1),
            updatedAt: now,
          });
        } else if (previousStatus === 'paid' && status !== 'paid') {
          await updateDoc(cycleRef, {
            totalPaid: increment(-previousEffective),
            paidCount: increment(-1),
            updatedAt: now,
          });
        }

        // Smart linking: use effective amount for goal contribution
        if (item.linkedGoalId && status === 'paid' && previousStatus !== 'paid') {
          const goalRef = doc(db, `users/${userId}/goals`, item.linkedGoalId);
          await updateDoc(goalRef, {
            currentAmount: increment(effectiveAmount),
            contributions: arrayUnion({
              id: `${itemId}-${Date.now()}`,
              date: now,
              amount: effectiveAmount,
              cycleId,
              cycleItemId: itemId,
            }),
            updatedAt: now,
          });
        }

        if (item.linkedGoalId && previousStatus === 'paid' && status !== 'paid') {
          const goalRef = doc(db, `users/${userId}/goals`, item.linkedGoalId);
          await updateDoc(goalRef, {
            currentAmount: increment(-previousEffective),
            updatedAt: now,
          });
        }

        removeOptimisticItem(itemId);
      } catch (error) {
        removeOptimisticItem(itemId);
        throw error;
      }
    },
    [userId, cycleId, items, setOptimisticItem, removeOptimisticItem]
  );

  // Update amount with optimistic update
  const updateAmount = useCallback(
    async (itemId: string, newAmount: number) => {
      if (!userId || !cycleId) return;

      const item = items.find((i) => i.id === itemId);
      if (!item) return;

      const previousAmount = item.amount;
      const amountDiff = newAmount - previousAmount;
      const now = Timestamp.now();

      // Optimistic update
      const optimisticItem: CycleItem = {
        ...item,
        amount: newAmount,
        updatedAt: now,
      };
      setOptimisticItem(itemId, optimisticItem);

      try {
        // Update item
        const itemRef = doc(db, `users/${userId}/cycleItems`, itemId);
        await updateDoc(itemRef, {
          amount: newAmount,
          updatedAt: now,
        });

        // Update cycle totals
        const cycleRef = doc(db, `users/${userId}/cycles`, cycleId);
        await updateDoc(cycleRef, {
          totalCommitted: increment(amountDiff),
          ...(item.status === 'paid' ? { totalPaid: increment(amountDiff) } : {}),
          updatedAt: now,
        });

        // Clear optimistic update
        removeOptimisticItem(itemId);
      } catch (error) {
        // Rollback on error
        removeOptimisticItem(itemId);
        throw error;
      }
    },
    [userId, cycleId, items, setOptimisticItem, removeOptimisticItem]
  );

  return {
    items,
    loading,
    itemsByCategory,
    attentionItems,
    totalCommitted,
    totalPaid,
    updateStatus,
    updateAmount,
  };
}
