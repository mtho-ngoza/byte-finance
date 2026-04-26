'use client';

import { useEffect, useState, useMemo } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserId } from './use-user-id';
import type { Goal, Commitment } from '@/types';

/**
 * Extended Goal with computed fields
 */
export interface GoalWithComputed extends Goal {
  /** Monthly contribution from linked commitments (computed) */
  linkedMonthlyAmount: number;
  /** Effective monthly target (linked amount or manual target) */
  effectiveMonthlyTarget: number;
  /** Commitments linked to this goal */
  linkedCommitments: Commitment[];
  /** Estimated completion date based on current pace */
  estimatedCompletionDate: Date | null;
  /** Days until target date (if set) */
  daysUntilDeadline: number | null;
}

/**
 * Compute isOnTrack based on contribution pace vs monthly target
 */
function computeIsOnTrack(goal: Goal, effectiveMonthlyTarget: number): boolean {
  if (effectiveMonthlyTarget <= 0) {
    return true; // No target = always on track
  }

  // Calculate months since start
  const now = new Date();
  const contributions = goal.contributions ?? [];

  if (contributions.length === 0) {
    // No contributions yet - check if we're past the first month
    const createdAt = goal.createdAt?.toDate?.() ?? now;
    const daysSinceCreation = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
    return daysSinceCreation < 30; // Grace period of 30 days
  }

  // Get earliest contribution date
  const firstContribution = contributions[0]?.date?.toDate?.() ?? now;
  const monthsElapsed = Math.max(
    1,
    (now.getFullYear() - firstContribution.getFullYear()) * 12 +
      (now.getMonth() - firstContribution.getMonth())
  );

  const expectedTotal = effectiveMonthlyTarget * monthsElapsed;
  return goal.currentAmount >= expectedTotal * 0.9; // 90% threshold
}

/**
 * Calculate estimated completion date
 */
function computeEstimatedCompletion(goal: Goal, effectiveMonthlyTarget: number): Date | null {
  if (effectiveMonthlyTarget <= 0) return null;

  const remaining = goal.targetAmount - goal.currentAmount;
  if (remaining <= 0) return new Date(); // Already complete

  const monthsNeeded = Math.ceil(remaining / effectiveMonthlyTarget);
  const estimated = new Date();
  estimated.setMonth(estimated.getMonth() + monthsNeeded);
  return estimated;
}

/**
 * Calculate days until deadline
 */
function computeDaysUntilDeadline(goal: Goal): number | null {
  if (!goal.targetDate) return null;

  const targetDate = goal.targetDate.toDate?.() ?? new Date(goal.targetDate as unknown as string);
  const now = new Date();
  const diffTime = targetDate.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

interface UseGoalsResult {
  goals: GoalWithComputed[];
  loading: boolean;
  /** Active goals only */
  activeGoals: GoalWithComputed[];
  /** Goals by type */
  goalsByType: {
    savings: GoalWithComputed[];
    debt_payoff: GoalWithComputed[];
    investment: GoalWithComputed[];
  };
  /** Total current amount across all active goals */
  totalProgress: number;
  /** Total target amount across all active goals */
  totalTarget: number;
  /** All commitments (for linking UI) */
  commitments: Commitment[];
}

export function useGoals(): UseGoalsResult {
  const userId = useUserId();
  const [rawGoals, setRawGoals] = useState<Goal[]>([]);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [loading, setLoading] = useState(true);

  // Subscribe to goals
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

  // Subscribe to commitments (to get linked amounts)
  useEffect(() => {
    if (!userId) return;

    const q = query(
      collection(db, `users/${userId}/commitments`),
      where('isActive', '==', true)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Commitment);
      setCommitments(docs);
    });

    return unsubscribe;
  }, [userId]);

  // Compute enhanced goals with linked commitment data
  const goals = useMemo(() => {
    return rawGoals.map((goal) => {
      // Find commitments linked to this goal
      const linkedCommitments = commitments.filter((c) => c.linkedGoalId === goal.id);

      // Sum of linked commitment amounts
      const linkedMonthlyAmount = linkedCommitments.reduce((sum, c) => sum + c.amount, 0);

      // Effective monthly target: use linked amount if available, otherwise manual target
      const effectiveMonthlyTarget = linkedMonthlyAmount > 0
        ? linkedMonthlyAmount
        : (goal.monthlyTarget ?? 0);

      const enhanced: GoalWithComputed = {
        ...goal,
        linkedMonthlyAmount,
        effectiveMonthlyTarget,
        linkedCommitments,
        isOnTrack: computeIsOnTrack(goal, effectiveMonthlyTarget),
        estimatedCompletionDate: computeEstimatedCompletion(goal, effectiveMonthlyTarget),
        daysUntilDeadline: computeDaysUntilDeadline(goal),
      };

      return enhanced;
    });
  }, [rawGoals, commitments]);

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
    commitments,
  };
}
