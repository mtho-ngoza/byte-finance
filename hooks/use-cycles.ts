'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  collection,
  query,
  where,
  limit,
  onSnapshot,
  doc,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserId } from './use-user-id';
import type { Cycle, Commitment, CycleItem } from '@/types';

interface UseCyclesResult {
  cycles: Cycle[];
  currentCycle: Cycle | null;
  loading: boolean;
}

export function useCycles(): UseCyclesResult {
  const userId = useUserId();
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, `users/${userId}/cycles`),
      limit(12)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const docs = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Cycle)
        .sort((a, b) => {
          // Sort by id descending (format: YYYY-MM) as fallback
          return b.id.localeCompare(a.id);
        });
      setCycles(docs);
      setLoading(false);
    });

    return unsubscribe;
  }, [userId]);

  // Current cycle is the one with status 'active' or the most recent
  const currentCycle = cycles.find((c) => c.status === 'active') ?? cycles[0] ?? null;

  return { cycles, currentCycle, loading };
}

/**
 * Hook to get or create the current cycle
 */
export function useCurrentCycle() {
  const userId = useUserId();
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    // Listen for active cycle
    const q = query(
      collection(db, `users/${userId}/cycles`),
      where('status', '==', 'active'),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      if (snap.docs.length > 0) {
        setCycle({ id: snap.docs[0].id, ...snap.docs[0].data() } as Cycle);
      } else {
        setCycle(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, [userId]);

  return { cycle, loading };
}

/**
 * Create a new cycle and spawn items from active commitments
 */
export async function createCycle(
  userId: string,
  cycleId: string,
  startDate: Date,
  endDate: Date,
  commitments: Commitment[]
): Promise<void> {
  const now = Timestamp.now();

  // Create cycle document
  const cycleRef = doc(db, `users/${userId}/cycles`, cycleId);
  const cycleData: Omit<Cycle, 'id'> = {
    startDate: Timestamp.fromDate(startDate),
    endDate: Timestamp.fromDate(endDate),
    totalCommitted: commitments.reduce((sum, c) => sum + c.amount, 0),
    totalPaid: 0,
    itemCount: commitments.length,
    paidCount: 0,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(cycleRef, cycleData);

  // Spawn cycle items from commitments
  for (let i = 0; i < commitments.length; i++) {
    const commitment = commitments[i];
    const itemRef = doc(collection(db, `users/${userId}/cycleItems`));

    const itemData: Omit<CycleItem, 'id'> = {
      cycleId,
      commitmentId: commitment.id,
      label: commitment.label,
      amount: commitment.amount,
      category: commitment.category,
      accountType: commitment.accountType,
      status: 'upcoming',
      linkedGoalId: commitment.linkedGoalId,
      sortOrder: i,
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(itemRef, itemData);
  }
}
