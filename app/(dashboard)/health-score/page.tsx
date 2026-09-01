'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ProgressRing } from '@/components/shared/progress-ring';
import { PillarCard } from '@/components/health-score/pillar-card';
import { useHealthScore, PILLAR_NAMES, PILLAR_ICONS } from '@/hooks/use-health-score';
import { useAppStore } from '@/stores/app-store';
import type { HealthScore, HealthScoreTip } from '@/types';

type PillarKey = keyof HealthScore['pillars'];

export default function HealthScorePage() {
  const { currentCycleId } = useAppStore();
  const {
    score,
    loading,
    refreshing,
    refresh,
    weakestPillar,
    scoreColor,
    scoreLabel,
    trendIcon,
    trendColor,
  } = useHealthScore(currentCycleId);

  const [history, setHistory] = useState<{ cycleId: string; score: number }[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Fetch 6-month history
  useEffect(() => {
    async function fetchHistory() {
      if (!currentCycleId) return;

      setHistoryLoading(true);
      const historyData: { cycleId: string; score: number }[] = [];

      // Get last 6 months
      const [year, month] = currentCycleId.split('-').map(Number);
      for (let i = 0; i < 6; i++) {
        const m = month - i;
        const y = m <= 0 ? year - 1 : year;
        const adjustedMonth = m <= 0 ? 12 + m : m;
        const cycleId = `${y}-${String(adjustedMonth).padStart(2, '0')}`;

        try {
          const res = await fetch(`/api/health-score?cycleId=${cycleId}`);
          const data = await res.json();
          if (data.healthScore) {
            historyData.push({
              cycleId,
              score: data.healthScore.totalScore,
            });
          }
        } catch {
          // Skip failed fetches
        }
      }

      setHistory(historyData.reverse());
      setHistoryLoading(false);
    }

    fetchHistory();
  }, [currentCycleId]);

  // Auto-calculate if no score
  useEffect(() => {
    if (!loading && !score && currentCycleId) {
      refresh();
    }
  }, [loading, score, currentCycleId, refresh]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-surface rounded animate-pulse" />
        <div className="h-40 bg-surface rounded-xl animate-pulse" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-24 bg-surface rounded-lg animate-pulse" />
          <div className="h-24 bg-surface rounded-lg animate-pulse" />
          <div className="h-24 bg-surface rounded-lg animate-pulse" />
          <div className="h-24 bg-surface rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  if (!score) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-surface transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-semibold text-text-primary">Health Score</h1>
        </div>

        <div className="p-6 rounded-xl border border-border bg-surface text-center">
          <p className="text-text-secondary mb-4">No health score calculated for this cycle yet.</p>
          <button
            onClick={refresh}
            disabled={refreshing}
            className="px-4 py-2 rounded-lg bg-primary text-background font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {refreshing ? 'Calculating...' : 'Calculate Score'}
          </button>
        </div>
      </div>
    );
  }

  const scoreDiff = score.previousScore !== null
    ? score.totalScore - score.previousScore
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-surface transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-semibold text-text-primary">Health Score</h1>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-surface transition-colors disabled:opacity-50"
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Score Display */}
      <div className="p-6 rounded-xl border border-border bg-surface">
        <div className="flex items-center gap-6">
          <ProgressRing
            value={score.totalScore / 100}
            size={96}
            strokeWidth={6}
          >
            <div className="text-center">
              <span className={`text-2xl font-bold ${scoreColor}`}>
                {score.totalScore}
              </span>
            </div>
          </ProgressRing>

          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-lg font-semibold px-2 py-0.5 rounded ${
                score.totalScore >= 75
                  ? 'bg-success/10 text-success'
                  : score.totalScore >= 50
                  ? 'bg-primary/10 text-primary'
                  : 'bg-warning/10 text-warning'
              }`}>
                {scoreLabel}
              </span>
            </div>

            {scoreDiff !== null && (
              <div className="flex items-center gap-2">
                <span className={`text-sm flex items-center gap-1 ${trendColor}`}>
                  {trendIcon}
                  {scoreDiff > 0 && '+'}
                  {scoreDiff} pts
                </span>
                <span className="text-sm text-text-secondary">vs last month</span>
              </div>
            )}

            <p className="text-xs text-text-secondary mt-2">
              Based on 4 pillars: budget discipline, savings rate, goal momentum, and stability buffer.
            </p>
          </div>
        </div>
      </div>

      {/* Pillar Cards */}
      <div>
        <h2 className="text-sm font-medium text-text-primary mb-3">Score Breakdown</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(Object.keys(score.pillars) as PillarKey[]).map((pillar) => (
            <PillarCard
              key={pillar}
              pillar={pillar}
              data={score.pillars[pillar]}
              isWeakest={weakestPillar === pillar}
            />
          ))}
        </div>
      </div>

      {/* Tips Section */}
      {score.tips.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-text-primary mb-3">Tips to Improve</h2>
          <div className="space-y-2">
            {score.tips.map((tip, index) => (
              <TipCard key={index} tip={tip} />
            ))}
          </div>
        </div>
      )}

      {/* History Chart */}
      {!historyLoading && history.length > 1 && (
        <div>
          <h2 className="text-sm font-medium text-text-primary mb-3">Score History</h2>
          <div className="p-4 rounded-xl border border-border bg-surface">
            <HistoryChart data={history} />
          </div>
        </div>
      )}
    </div>
  );
}

// Tip Card Component
function TipCard({ tip }: { tip: HealthScoreTip }) {
  const icon = PILLAR_ICONS[tip.pillar];
  const pillarName = PILLAR_NAMES[tip.pillar];

  const priorityColors = {
    high: 'border-warning/50 bg-warning/5',
    medium: 'border-primary/50 bg-primary/5',
    low: 'border-border bg-surface',
  };

  return (
    <div className={`p-3 rounded-lg border ${priorityColors[tip.priority]}`}>
      <div className="flex items-start gap-3">
        <span className="text-lg">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="text-sm font-medium text-text-primary">{tip.title}</h3>
            <span className="text-[10px] text-text-secondary uppercase">{pillarName}</span>
          </div>
          <p className="text-xs text-text-secondary">{tip.message}</p>
        </div>
      </div>
    </div>
  );
}

// Simple History Chart Component
function HistoryChart({ data }: { data: { cycleId: string; score: number }[] }) {
  if (data.length === 0) return null;

  const maxScore = 100;
  const chartHeight = 80;

  return (
    <div className="relative">
      {/* Score line chart */}
      <div className="flex items-end justify-between h-20 gap-2">
        {data.map((item, index) => {
          const height = (item.score / maxScore) * chartHeight;
          const [, month] = item.cycleId.split('-');
          const monthName = new Date(2026, parseInt(month) - 1).toLocaleDateString('en-ZA', { month: 'short' });

          return (
            <div key={item.cycleId} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-xs text-text-secondary">{item.score}</span>
              <div
                className={`w-full rounded-t transition-all ${
                  index === data.length - 1
                    ? 'bg-primary'
                    : 'bg-primary/30'
                }`}
                style={{ height: `${height}px` }}
              />
              <span className="text-[10px] text-text-secondary">{monthName}</span>
            </div>
          );
        })}
      </div>

      {/* Reference lines */}
      <div className="absolute left-0 right-0 top-0 h-20 pointer-events-none">
        <div className="absolute top-0 left-0 right-0 border-t border-dashed border-success/20" />
        <div className="absolute top-1/4 left-0 right-0 border-t border-dashed border-primary/20" />
        <div className="absolute top-1/2 left-0 right-0 border-t border-dashed border-warning/20" />
      </div>
    </div>
  );
}
