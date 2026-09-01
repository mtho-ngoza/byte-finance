'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserId } from './use-user-id';
import type { HealthScore } from '@/types';

type PillarKey = keyof HealthScore['pillars'];

interface UseHealthScoreResult {
  score: HealthScore | null;
  loading: boolean;
  refreshing: boolean;
  refresh: () => Promise<void>;
  weakestPillar: PillarKey | null;
  scoreColor: string;
  scoreLabel: string;
  trendIcon: string;
  trendColor: string;
}

// Score ranges
const SCORE_RANGES = [
  { min: 90, label: 'Excellent', color: 'text-success' },
  { min: 75, label: 'Good', color: 'text-primary' },
  { min: 50, label: 'Fair', color: 'text-warning' },
  { min: 25, label: 'Needs Work', color: 'text-orange-500' },
  { min: 0, label: 'Critical', color: 'text-error' },
];

export function useHealthScore(cycleId: string | null): UseHealthScoreResult {
  const userId = useUserId();
  const [score, setScore] = useState<HealthScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Subscribe to health score changes
  useEffect(() => {
    if (!userId || !cycleId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const docRef = doc(db, `users/${userId}/healthScores`, cycleId);

    const unsubscribe = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        setScore({ id: snap.id, ...snap.data() } as HealthScore);
      } else {
        setScore(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, [userId, cycleId]);

  // Refresh/calculate score
  const refresh = useCallback(async () => {
    if (!cycleId) return;

    setRefreshing(true);
    try {
      await fetch('/api/health-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cycleId }),
      });
    } catch (error) {
      console.error('Failed to refresh health score:', error);
    } finally {
      setRefreshing(false);
    }
  }, [cycleId]);

  // Find weakest pillar
  const weakestPillar = useMemo((): PillarKey | null => {
    if (!score) return null;

    const pillars = score.pillars;
    const pillarEntries = Object.entries(pillars) as [PillarKey, { score: number }][];

    let weakest: PillarKey | null = null;
    let lowestScore = 26;

    for (const [key, value] of pillarEntries) {
      if (value.score < lowestScore) {
        lowestScore = value.score;
        weakest = key;
      }
    }

    return weakest;
  }, [score]);

  // Get score color class
  const scoreColor = useMemo(() => {
    if (!score) return 'text-text-secondary';
    const range = SCORE_RANGES.find(r => score.totalScore >= r.min);
    return range?.color ?? 'text-text-secondary';
  }, [score]);

  // Get score label
  const scoreLabel = useMemo(() => {
    if (!score) return '';
    const range = SCORE_RANGES.find(r => score.totalScore >= r.min);
    return range?.label ?? '';
  }, [score]);

  // Trend icon and color
  const trendIcon = useMemo(() => {
    if (!score || score.trend === 'stable') return '';
    return score.trend === 'up' ? '↑' : '↓';
  }, [score]);

  const trendColor = useMemo(() => {
    if (!score || score.trend === 'stable') return 'text-text-secondary';
    return score.trend === 'up' ? 'text-success' : 'text-error';
  }, [score]);

  return {
    score,
    loading,
    refreshing,
    refresh,
    weakestPillar,
    scoreColor,
    scoreLabel,
    trendIcon,
    trendColor,
  };
}

// Pillar display names
export const PILLAR_NAMES: Record<PillarKey, string> = {
  budgetDiscipline: 'Budget Discipline',
  savingsRate: 'Savings Rate',
  goalMomentum: 'Goal Momentum',
  stabilityBuffer: 'Stability Buffer',
};

// Pillar icons
export const PILLAR_ICONS: Record<PillarKey, string> = {
  budgetDiscipline: '📅',
  savingsRate: '💰',
  goalMomentum: '🎯',
  stabilityBuffer: '🛡️',
};

// Pillar descriptions
export const PILLAR_DESCRIPTIONS: Record<PillarKey, string> = {
  budgetDiscipline: 'Items paid on time',
  savingsRate: 'Income saved to goals',
  goalMomentum: 'Goals on track + activity',
  stabilityBuffer: 'Emergency fund coverage',
};
