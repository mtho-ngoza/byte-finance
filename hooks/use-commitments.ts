'use client';

import { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserId } from './use-user-id';
import type { Commitment, Category } from '@/types';

interface UseCommitmentsResult {
  commitments: Commitment[];
  allCommitments: Commitment[];
  loading: boolean;
  /** Commitments grouped by category */
  commitmentsByCategory: Map<Category, Commitment[]>;
  /** All commitments (including inactive) grouped by category */
  allCommitmentsByCategory: Map<Category, Commitment[]>;
  /** Total of all active commitments in cents */
  totalMonthly: number;
}

export function useCommitments(): UseCommitmentsResult {
  const userId = useUserId();
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [allCommitments, setAllCommitments] = useState<Commitment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    // Subscribe to ALL commitments (active + inactive)
    const q = query(
      collection(db, `users/${userId}/commitments`),
      orderBy('sortOrder')
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Commitment);
      setAllCommitments(docs);
      setCommitments(docs.filter((c) => c.isActive));
      setLoading(false);
    });

    return unsubscribe;
  }, [userId]);

  // Group active by category
  const commitmentsByCategory = new Map<Category, Commitment[]>();
  for (const commitment of commitments) {
    const list = commitmentsByCategory.get(commitment.category) ?? [];
    list.push(commitment);
    commitmentsByCategory.set(commitment.category, list);
  }

  // Group all by category
  const allCommitmentsByCategory = new Map<Category, Commitment[]>();
  for (const commitment of allCommitments) {
    const list = allCommitmentsByCategory.get(commitment.category) ?? [];
    list.push(commitment);
    allCommitmentsByCategory.set(commitment.category, list);
  }

  // Calculate total (active only)
  const totalMonthly = commitments.reduce((sum, c) => sum + c.amount, 0);

  return { commitments, allCommitments, loading, commitmentsByCategory, allCommitmentsByCategory, totalMonthly };
}
