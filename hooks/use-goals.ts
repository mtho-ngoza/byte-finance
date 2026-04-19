'use client';

import { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserId } from './use-user-id';
import type { Goal } from '@/types';

/**
 * Compute isOnTrack and monthsBehind client-side on every render.
 *
 * isOnTrack: currentAmount / targetAmount >= elapsedMonths / totalPlannedMonths
 * monthsBehind: number of expected monthly contributions not yet received
 */
function computeTrackingFields(goal: Goal): Pick<Goal, 'isOnTrack' | 'monthsBehind'> {
  const now = new Date();

  // Without a targetAmount or targetDate we can't compute tracking
  if (!goal.targetAmount || !goal.targetDate || !goal.startDate) {
    return { isOnTrack: true, monthsBehind: 0 };
  }

  const start = goal.startDate.toDate();
  const target = goal.targetDate.toDate();

  const totalPlannedMonths =
    (target.getFullYear() - start.getFullYear()) * 12 +
    (target.getMonth() - start.getMonth());

  if (totalPlannedMonths <= 0) {
    return { isOnTrack: goal.currentAmount >= goal.targetAmount, monthsBehind: 0 };
  }

  const elapsedMonths =
    (now.getFullYear() - start.getFullYear()) * 12 +
    (now.getMonth() - start.getMonth());

  const clampedElapsed = Math.max(0, Math.min(elapsedMonths, totalPlannedMonths));

  const progressRatio = goal.currentAmount / goal.targetAmount;
  const timeRatio = clampedElapsed / totalPlannedMonths;

  const isOnTrack = progressRatio >= timeRatio;

  // monthsBehind: how many expected monthly contributions haven't arrived
  let monthsBehind = 0;
  if (!isOnTrack && goal.expectedMonthlyContribution && goal.expectedMonthlyContribution > 0) {
    const expectedTotal = goal.expectedMonthlyContribution * clampedElapsed;
    const deficit = expectedTotal - goal.currentAmount;
    monthsBehind = Math.max(0, Math.floor(deficit / goal.expectedMonthlyContribution));
  }

  return { isOnTrack, monthsBehind };
}

interface UseGoalsResult {
  goals: Goal[];
  loading: boolean;
  /** Goals grouped by year, sorted descending */
  goalsByYear: Map<number, Goal[]>;
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
      orderBy('year', 'desc'),
      orderBy('priority'),
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Goal);
      setRawGoals(docs);
      setLoading(false);
    });

    return unsubscribe;
  }, [userId]);

  // Compute tracking fields on every render
  const goals = rawGoals.map((g) => ({
    ...g,
    ...computeTrackingFields(g),
  }));

  // Group by year
  const goalsByYear = new Map<number, Goal[]>();
  for (const goal of goals) {
    const list = goalsByYear.get(goal.year) ?? [];
    list.push(goal);
    goalsByYear.set(goal.year, list);
  }

  return { goals, loading, goalsByYear };
}

export { computeTrackingFields };
