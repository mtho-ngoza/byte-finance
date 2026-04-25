'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserId } from './use-user-id';
import type { Commitment, Category } from '@/types';

interface UseCommitmentsResult {
  commitments: Commitment[];
  loading: boolean;
  /** Commitments grouped by category */
  commitmentsByCategory: Map<Category, Commitment[]>;
  /** Total of all active commitments in cents */
  totalMonthly: number;
}

export function useCommitments(): UseCommitmentsResult {
  const userId = useUserId();
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, `users/${userId}/commitments`),
      where('isActive', '==', true),
      orderBy('sortOrder')
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Commitment);
      setCommitments(docs);
      setLoading(false);
    });

    return unsubscribe;
  }, [userId]);

  // Group by category
  const commitmentsByCategory = new Map<Category, Commitment[]>();
  for (const commitment of commitments) {
    const list = commitmentsByCategory.get(commitment.category) ?? [];
    list.push(commitment);
    commitmentsByCategory.set(commitment.category, list);
  }

  // Calculate total
  const totalMonthly = commitments.reduce((sum, c) => sum + c.amount, 0);

  return { commitments, loading, commitmentsByCategory, totalMonthly };
}
