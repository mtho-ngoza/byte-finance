'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ProgressRing } from '@/components/shared/progress-ring';
import { useHealthScore } from '@/hooks/use-health-score';

interface HealthScoreWidgetProps {
  cycleId: string | null;
}

export function HealthScoreWidget({ cycleId }: HealthScoreWidgetProps) {
  const {
    score,
    loading,
    refreshing,
    refresh,
    scoreColor,
    scoreLabel,
    trendIcon,
    trendColor,
  } = useHealthScore(cycleId);

  // Auto-calculate score if not exists
  useEffect(() => {
    if (!loading && !score && cycleId) {
      refresh();
    }
  }, [loading, score, cycleId, refresh]);

  if (loading || refreshing) {
    return (
      <div className="p-4 rounded-xl border border-border bg-surface">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-background animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-24 bg-background rounded animate-pulse" />
            <div className="h-3 w-32 bg-background rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (!score) {
    return (
      <div className="p-4 rounded-xl border border-border bg-surface">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-text-primary">Health Score</h2>
            <p className="text-xs text-text-secondary mt-1">
              Calculate your financial health
            </p>
          </div>
          <button
            onClick={refresh}
            disabled={refreshing}
            className="px-3 py-1.5 text-xs rounded-lg bg-primary text-background font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {refreshing ? 'Calculating...' : 'Calculate'}
          </button>
        </div>
      </div>
    );
  }

  const progressValue = score.totalScore / 100;
  const scoreDiff = score.previousScore !== null
    ? score.totalScore - score.previousScore
    : null;

  return (
    <Link
      href="/health-score"
      className="block p-4 rounded-xl border border-border bg-surface hover:border-primary/50 transition-colors"
    >
      <div className="flex items-center gap-4">
        {/* Score ring */}
        <ProgressRing
          value={progressValue}
          size={64}
          strokeWidth={5}
          className="shrink-0"
        >
          <span className={`text-lg font-bold ${scoreColor}`}>
            {score.totalScore}
          </span>
        </ProgressRing>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium text-text-primary">Health Score</h2>
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
              score.totalScore >= 75
                ? 'bg-success/10 text-success'
                : score.totalScore >= 50
                ? 'bg-primary/10 text-primary'
                : 'bg-warning/10 text-warning'
            }`}>
              {scoreLabel}
            </span>
          </div>

          {/* Trend */}
          <div className="flex items-center gap-2 mt-1">
            {scoreDiff !== null && (
              <span className={`text-xs flex items-center gap-0.5 ${trendColor}`}>
                {trendIcon}
                {scoreDiff !== 0 && (
                  <span>{Math.abs(scoreDiff)} pts</span>
                )}
                {scoreDiff === 0 && <span>No change</span>}
              </span>
            )}
            <span className="text-xs text-text-secondary">vs last month</span>
          </div>

          {/* Pillar summary */}
          <div className="flex gap-2 mt-2">
            {Object.entries(score.pillars).map(([key, pillar]) => (
              <div
                key={key}
                className={`w-8 h-1.5 rounded-full ${
                  pillar.score >= 20
                    ? 'bg-success'
                    : pillar.score >= 15
                    ? 'bg-primary'
                    : pillar.score >= 10
                    ? 'bg-warning'
                    : 'bg-error'
                }`}
                title={`${key}: ${pillar.score}/25`}
              />
            ))}
          </div>
        </div>

        {/* Arrow */}
        <svg
          className="w-5 h-5 text-text-secondary shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
}
