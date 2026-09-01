'use client';

import { ProgressBar } from '@/components/shared/progress-bar';
import { AmountDisplay } from '@/components/shared/amount-display';
import { PILLAR_NAMES, PILLAR_ICONS, PILLAR_DESCRIPTIONS } from '@/hooks/use-health-score';
import type { HealthScore } from '@/types';

type PillarKey = keyof HealthScore['pillars'];

interface PillarCardProps {
  pillar: PillarKey;
  data: HealthScore['pillars'][PillarKey];
  isWeakest?: boolean;
}

export function PillarCard({ pillar, data, isWeakest }: PillarCardProps) {
  const progressPercent = (data.score / 25) * 100;
  const icon = PILLAR_ICONS[pillar];
  const name = PILLAR_NAMES[pillar];
  const description = PILLAR_DESCRIPTIONS[pillar];

  // Get the key metric for each pillar
  const getMetricDisplay = () => {
    switch (pillar) {
      case 'budgetDiscipline': {
        const d = data as HealthScore['pillars']['budgetDiscipline'];
        return `${d.paidOnTimeItems}/${d.totalItems} on time`;
      }
      case 'savingsRate': {
        const d = data as HealthScore['pillars']['savingsRate'];
        return d.incomeAmount > 0
          ? `${d.rate}% of income`
          : 'No income set';
      }
      case 'goalMomentum': {
        const d = data as HealthScore['pillars']['goalMomentum'];
        return d.totalGoals > 0
          ? `${d.onTrackGoals}/${d.totalGoals} on track`
          : 'No active goals';
      }
      case 'stabilityBuffer': {
        const d = data as HealthScore['pillars']['stabilityBuffer'];
        return d.monthsCovered > 0
          ? `${d.monthsCovered} months covered`
          : 'No emergency fund';
      }
    }
  };

  // Get secondary metric
  const getSecondaryMetric = () => {
    switch (pillar) {
      case 'budgetDiscipline': {
        const d = data as HealthScore['pillars']['budgetDiscipline'];
        return d.totalItems > 0 ? `${d.paidOnTimePercent}%` : null;
      }
      case 'savingsRate': {
        const d = data as HealthScore['pillars']['savingsRate'];
        return d.savingsAmount > 0
          ? <AmountDisplay amount={d.savingsAmount} size="xs" className="inline" />
          : null;
      }
      case 'goalMomentum': {
        const d = data as HealthScore['pillars']['goalMomentum'];
        return d.recentContributions > 0
          ? `${d.recentContributions} contribution${d.recentContributions !== 1 ? 's' : ''}`
          : null;
      }
      case 'stabilityBuffer': {
        const d = data as HealthScore['pillars']['stabilityBuffer'];
        return d.emergencyFundBalance > 0
          ? <AmountDisplay amount={d.emergencyFundBalance} size="xs" className="inline" />
          : null;
      }
    }
  };

  return (
    <div
      className={`p-3 rounded-lg border transition-colors ${
        isWeakest
          ? 'border-warning/50 bg-warning/5'
          : 'border-border bg-surface'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="text-xl">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-medium text-text-primary">{name}</h3>
            <span
              className={`text-sm font-semibold ${
                data.score >= 20
                  ? 'text-success'
                  : data.score >= 15
                  ? 'text-primary'
                  : data.score >= 10
                  ? 'text-warning'
                  : 'text-error'
              }`}
            >
              {data.score}/25
            </span>
          </div>

          <ProgressBar
            value={progressPercent}
            size="sm"
            color={
              data.score >= 20
                ? 'bg-success'
                : data.score >= 15
                ? 'bg-primary'
                : data.score >= 10
                ? 'bg-warning'
                : 'bg-error'
            }
          />

          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-text-secondary">{getMetricDisplay()}</p>
            {getSecondaryMetric() && (
              <span className="text-xs text-text-secondary">
                {getSecondaryMetric()}
              </span>
            )}
          </div>

          {isWeakest && (
            <p className="text-[10px] text-warning mt-1.5 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 16 16">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 4v4M8 10v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Focus area - {description.toLowerCase()}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
