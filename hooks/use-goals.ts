'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserId } from './use-user-id';
import type { Goal } from '@/types';

/**
 * Compute isOnTrack based on contribution pace vs monthly target
 */
function computeIsOnTrack(goal: Goal): boolean {
  if (!goal.monthlyTarget || goal.monthlyTarget <= 0) {
    return true; // No target = always on track
  }

  // Calculate months since start
  const now = new Date();
  const contributions = goal.contributions ?? [];

  if (contributions.length === 0) {
    return false;
  }

  // Get earliest contribution date
  const firstContribution = contributions[0]?.date?.toDate?.() ?? now;
  const monthsElapsed = Math.max(
    1,
    (now.getFullYear() - firstContribution.getFullYear()) * 12 +
      (now.getMonth() - firstContribution.getMonth())
  );

  const expectedTotal = goal.monthlyTarget * monthsElapsed;
  return goal.currentAmount >= expectedTotal;
}

interface UseGoalsResult {
  goals: Goal[];
  loading: boolean;
  /** Active goals only */
  activeGoals: Goal[];
  /** Goals by type */
  goalsByType: {
    savings: Goal[];
    debt_payoff: Goal[];
    investment: Goal[];
  };
  /** Total current amount across all active goals */
  totalProgress: number;
  /** Total target amount across all active goals */
  totalTarget: number;
}

export function useGoals(): UseGoalsResult {
  const userId = useUserId();
  const [rawGoals, setRawGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, `users/${userId}/goals`),
      orderBy('priority'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Goal);
      setRawGoals(docs);
      setLoading(false);
    });

    return unsubscribe;
  }, [userId]);

  // Compute tracking fields
  const goals = rawGoals.map((g) => ({
    ...g,
    isOnTrack: computeIsOnTrack(g),
  }));

  // Filter active goals
  const activeGoals = goals.filter((g) => g.status === 'active');

  // Group by type
  const goalsByType = {
    savings: activeGoals.filter((g) => g.type === 'savings'),
    debt_payoff: activeGoals.filter((g) => g.type === 'debt_payoff'),
    investment: activeGoals.filter((g) => g.type === 'investment'),
  };

  // Calculate totals
  const totalProgress = activeGoals.reduce((sum, g) => sum + g.currentAmount, 0);
  const totalTarget = activeGoals.reduce((sum, g) => sum + g.targetAmount, 0);

  return {
    goals,
    loading,
    activeGoals,
    goalsByType,
    totalProgress,
    totalTarget,
  };
}
