'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
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
import type { CycleItem, CycleItemStatus, Category, Cycle } from '@/types';

interface UseCycleItemsResult {
  items: CycleItem[];
  loading: boolean;
  itemsByCategory: Map<Category, CycleItem[]>;
  attentionItems: CycleItem[];
  totalCommitted: number;
  /** Total paid amount in cents (uses payments sum or actualAmount when set) */
  totalPaid: number;
  updateStatus: (itemId: string, status: CycleItemStatus, actualAmount?: number) => Promise<void>;
  updateAmount: (itemId: string, newAmount: number) => Promise<void>;
  /** Add a partial payment to a variable item */
  addPayment: (itemId: string, paymentAmount: number, note?: string, receiptId?: string, date?: string) => Promise<void>;
  /** Delete a specific payment from an item */
  deletePayment: (itemId: string, paymentId: string) => Promise<void>;
  /** Edit a specific payment's amount, note, and/or date */
  editPayment: (itemId: string, paymentId: string, amount: number, note?: string, date?: string) => Promise<void>;
}

export function useCycleItems(cycleId: string | null, cycle?: Cycle | null): UseCycleItemsResult {
  const userId = useUserId();
  const [rawItems, setRawItems] = useState<CycleItem[]>([]);
  const [allRecentItems, setAllRecentItems] = useState<CycleItem[]>([]);
  const [loading, setLoading] = useState(true);

  const optimisticItems = useAppStore((s) => s.optimisticCycleItems);
  const setOptimisticItem = useAppStore((s) => s.setOptimisticCycleItem);
  const removeOptimisticItem = useAppStore((s) => s.removeOptimisticCycleItem);
  const accountFilter = useAppStore((s) => s.accountFilter);

  // Fetch items by cycleId (planned items)
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

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CycleItem);
        setRawItems(docs);
        setLoading(false);
      },
      (err) => {
        console.error('Cycle items subscription error:', err);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [userId, cycleId]);

  // Also fetch paid items that might belong to this cycle's date range
  // Note: Firestore doesn't support range queries on multiple fields, so we fetch
  // items from a reasonable window and filter client-side
  useEffect(() => {
    if (!userId || !cycle?.startDate || !cycle?.endDate) {
      setAllRecentItems([]);
      return;
    }

    // Get date range from cycle
    const startDate = cycle.startDate.toDate ? cycle.startDate.toDate() : new Date(cycle.startDate as unknown as string);
    const endDate = cycle.endDate.toDate ? cycle.endDate.toDate() : new Date(cycle.endDate as unknown as string);

    // Add a day buffer to endDate for the query (we'll filter precisely client-side)
    const queryEndDate = new Date(endDate);
    queryEndDate.setDate(queryEndDate.getDate() + 1);

    // Query items with paidDate in the cycle's range
    const q = query(
      collection(db, `users/${userId}/cycleItems`),
      where('paidDate', '>=', Timestamp.fromDate(startDate)),
      where('paidDate', '<=', Timestamp.fromDate(queryEndDate))
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CycleItem);
        setAllRecentItems(docs);
      },
      (err) => {
        console.error('Recent items subscription error:', err);
      }
    );

    return unsubscribe;
  }, [userId, cycle?.startDate, cycle?.endDate]);

  // Helper to get earliest payment date from an item
  const getEarliestPaymentDate = (item: CycleItem): Date | null => {
    // First check paidDate field
    if (item.paidDate) {
      return item.paidDate.toDate ? item.paidDate.toDate() : new Date(item.paidDate as unknown as string);
    }
    // Fall back to earliest date in payments array
    if (item.payments && item.payments.length > 0) {
      let earliest: Date | null = null;
      for (const p of item.payments) {
        const pDate = p.date?.toDate ? p.date.toDate() : new Date(p.date as unknown as string);
        if (!earliest || pDate < earliest) {
          earliest = pDate;
        }
      }
      return earliest;
    }
    return null;
  };

  // Helper to check if an item's payment falls within a date range
  const isPaymentInRange = (item: CycleItem, startDate: Date, endDate: Date): boolean => {
    const paymentDate = getEarliestPaymentDate(item);
    if (!paymentDate) return false;
    return paymentDate >= startDate && paymentDate <= endDate;
  };

  // Combine and filter items based on date range
  // Key rule: paid items appear in the cycle where they were PAID, not where they were planned
  const filteredItems = useMemo(() => {
    if (!cycle?.startDate || !cycle?.endDate) {
      return rawItems; // Fallback to cycleId-based filtering
    }

    const startDate = cycle.startDate.toDate ? cycle.startDate.toDate() : new Date(cycle.startDate as unknown as string);
    startDate.setHours(0, 0, 0, 0); // Start of day

    const endDate = cycle.endDate.toDate ? cycle.endDate.toDate() : new Date(cycle.endDate as unknown as string);
    endDate.setHours(23, 59, 59, 999); // End of day

    // Use a Map to deduplicate by item ID
    const itemMap = new Map<string, CycleItem>();

    // 1. Add UNPAID items from this cycle (planned items that haven't been paid yet)
    for (const item of rawItems) {
      if (item.status === 'upcoming' || item.status === 'due' || item.status === 'skipped') {
        itemMap.set(item.id, item);
      }
    }

    // 2. Add PAID/PARTIAL items ONLY if their payment date is within this cycle's range
    // This includes items from rawItems (same cycleId) AND allRecentItems (different cycleId)
    // The payment date determines which cycle the item appears in, not the cycleId

    // First, collect all paid/partial items from both sources
    const allPaidItems = new Map<string, CycleItem>();

    for (const item of rawItems) {
      if (item.status === 'paid' || item.status === 'partial') {
        allPaidItems.set(item.id, item);
      }
    }

    for (const item of allRecentItems) {
      if (item.status === 'paid' || item.status === 'partial') {
        // allRecentItems may have fresher data, prefer it
        allPaidItems.set(item.id, item);
      }
    }

    // Now filter to only include items paid within this cycle's date range
    for (const item of allPaidItems.values()) {
      if (isPaymentInRange(item, startDate, endDate)) {
        itemMap.set(item.id, item);
      }
    }

    return Array.from(itemMap.values()).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [rawItems, allRecentItems, cycle?.startDate, cycle?.endDate]);

  // Merge optimistic updates
  const items = filteredItems
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

  // Totals — sum only payments within the cycle date range for accurate attribution
  const totalCommitted = items.reduce((sum, i) => sum + i.amount, 0);

  // Calculate totalPaid by summing payments within this cycle's date range
  const totalPaid = useMemo(() => {
    if (!cycle?.startDate || !cycle?.endDate) {
      // Fallback: use totalPaidAmount if no date range available
      return items
        .filter((i) => i.status === 'paid' || i.status === 'partial')
        .reduce((sum, i) => {
          if (i.totalPaidAmount !== undefined) return sum + i.totalPaidAmount;
          return sum + (i.actualAmount ?? i.amount);
        }, 0);
    }

    const startDate = cycle.startDate.toDate ? cycle.startDate.toDate() : new Date(cycle.startDate as unknown as string);
    startDate.setHours(0, 0, 0, 0);

    const endDate = cycle.endDate.toDate ? cycle.endDate.toDate() : new Date(cycle.endDate as unknown as string);
    endDate.setHours(23, 59, 59, 999);

    let total = 0;
    for (const item of items) {
      if (item.status !== 'paid' && item.status !== 'partial') continue;

      if (item.payments && item.payments.length > 0) {
        // Sum only payments within date range
        for (const p of item.payments) {
          const pDate = p.date?.toDate ? p.date.toDate() : new Date(p.date as unknown as string);
          if (pDate >= startDate && pDate <= endDate) {
            total += p.amount;
          }
        }
      } else {
        // Item without payments array - use paidDate to check if it belongs
        const paidDate = item.paidDate
          ? (item.paidDate.toDate ? item.paidDate.toDate() : new Date(item.paidDate as unknown as string))
          : null;
        if (paidDate && paidDate >= startDate && paidDate <= endDate) {
          total += item.totalPaidAmount ?? item.actualAmount ?? item.amount;
        }
      }
    }
    return total;
  }, [items, cycle?.startDate, cycle?.endDate]);

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

      // Optimistic update — preserve payments when reverting status
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
        // When reverting to unpaid, ensure item stays in current cycle
        // This handles items that were moved by payment date but now have no payment
        if (status !== 'paid' && status !== 'partial' && item.cycleId !== cycleId) {
          updateData.cycleId = cycleId;
        }
        await updateDoc(itemRef, updateData);

        // Update cycle totals — use totalPaidAmount when payments exist
        const cycleRef = doc(db, `users/${userId}/cycles`, cycleId);
        const previousEffective = item.totalPaidAmount ?? item.actualAmount ?? item.amount;
        const effectiveForCycle = item.totalPaidAmount ?? effectiveAmount;
        if (status === 'paid' && previousStatus !== 'paid') {
          await updateDoc(cycleRef, {
            totalPaid: increment(effectiveForCycle),
            paidCount: increment(1),
            updatedAt: now,
          });
        } else if ((previousStatus === 'paid' || previousStatus === 'partial') && status !== 'paid' && status !== 'partial') {
          // Reverting to upcoming/due/skipped — subtract what was counted
          await updateDoc(cycleRef, {
            totalPaid: increment(-previousEffective),
            paidCount: previousStatus === 'paid' ? increment(-1) : 0,
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

  // Add a partial payment to a variable item
  const addPayment = useCallback(
    async (itemId: string, paymentAmount: number, note?: string, receiptId?: string, date?: string) => {
      if (!userId || !cycleId) return;
      const item = items.find((i) => i.id === itemId);
      if (!item) return;

      const now = Timestamp.now();
      const paymentDate = date ? Timestamp.fromDate(new Date(date)) : now;
      const paymentId = `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const newPayment = {
        id: paymentId,
        amount: paymentAmount,
        date: paymentDate,
        note: note ?? undefined,
        receiptId: receiptId ?? undefined,
      };
      const newTotal = (item.totalPaidAmount ?? 0) + paymentAmount;
      // Auto-complete for non-variable items when paid in full.
      // Variable items stay partial to allow overspend tracking.
      const isVariable = item.isVariable ?? false;
      const paidInFull = newTotal >= item.amount;
      const newStatus: CycleItemStatus = (!isVariable && paidInFull) ? 'paid' : 'partial';

      // Optimistic update
      const optimisticItem: CycleItem = {
        ...item,
        payments: [...(item.payments ?? []), newPayment],
        totalPaidAmount: newTotal,
        status: newStatus,
        updatedAt: now,
      };
      setOptimisticItem(itemId, optimisticItem);

      try {
        const res = await fetch(`/api/cycle-items/${itemId}/pay`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: paymentAmount, note, receiptId, date }),
        });
        if (!res.ok) throw new Error('Payment failed');
        removeOptimisticItem(itemId);
      } catch (error) {
        removeOptimisticItem(itemId);
        throw error;
      }
    },
    [userId, cycleId, items, setOptimisticItem, removeOptimisticItem]
  );

  // Delete a specific payment from an item
  const deletePayment = useCallback(
    async (itemId: string, paymentId: string) => {
      if (!userId || !cycleId) return;
      const item = items.find((i) => i.id === itemId);
      if (!item) return;

      const paymentToDelete = (item.payments ?? []).find((p) => p.id === paymentId);
      if (!paymentToDelete) return;

      const remainingPayments = (item.payments ?? []).filter((p) => p.id !== paymentId);
      const newTotal = remainingPayments.reduce((sum, p) => sum + p.amount, 0);
      const newStatus: CycleItemStatus = remainingPayments.length === 0 ? 'upcoming' : 'partial';
      const now = Timestamp.now();

      // Optimistic update
      const optimisticItem: CycleItem = {
        ...item,
        payments: remainingPayments,
        totalPaidAmount: newTotal,
        status: newStatus,
        updatedAt: now,
      };
      setOptimisticItem(itemId, optimisticItem);

      try {
        const res = await fetch(`/api/cycle-items/${itemId}/delete-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentId }),
        });
        if (!res.ok) throw new Error('Delete payment failed');
        removeOptimisticItem(itemId);
      } catch (error) {
        removeOptimisticItem(itemId);
        throw error;
      }
    },
    [userId, cycleId, items, setOptimisticItem, removeOptimisticItem]
  );

  // Edit a specific payment's amount, note, and/or date
  const editPayment = useCallback(
    async (itemId: string, paymentId: string, amount: number, note?: string, date?: string) => {
      if (!userId || !cycleId) return;
      const item = items.find((i) => i.id === itemId);
      if (!item) return;

      const now = Timestamp.now();
      const updatedPayments = (item.payments ?? []).map((p) => {
        if (p.id !== paymentId) return p;
        const updated = { ...p, amount, note: note ?? p.note };
        if (date) updated.date = Timestamp.fromDate(new Date(date));
        return updated;
      });
      const newTotal = updatedPayments.reduce((sum, p) => sum + p.amount, 0);

      // Optimistic update
      const optimisticItem: CycleItem = {
        ...item,
        payments: updatedPayments,
        totalPaidAmount: newTotal,
        updatedAt: now,
      };
      setOptimisticItem(itemId, optimisticItem);

      try {
        const res = await fetch(`/api/cycle-items/${itemId}/edit-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentId, amount, note, date }),
        });
        if (!res.ok) throw new Error('Edit payment failed');
        removeOptimisticItem(itemId);
      } catch (error) {
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
    addPayment,
    deletePayment,
    editPayment,
  };
}
