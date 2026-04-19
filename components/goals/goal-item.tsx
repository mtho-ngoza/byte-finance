'use client';

import { useRef, useState } from 'react';
import { AmountDisplay } from '@/components/shared/amount-display';
import { ProgressRing } from '@/components/shared/progress-ring';
import type { Goal } from '@/types';

interface GoalItemProps {
  goal: Goal;
  onEdit: (goal: Goal) => void;
  onDelete: (id: string) => void;
}

const TYPE_LABELS: Record<Goal['type'], string> = {
  savings: 'Savings',
  purchase: 'Purchase',
  debt_payoff: 'Debt Payoff',
  milestone: 'Milestone',
};

const TYPE_COLORS: Record<Goal['type'], string> = {
  savings: 'bg-primary/10 text-primary',
  purchase: 'bg-purple-500/10 text-purple-500',
  debt_payoff: 'bg-orange-500/10 text-orange-500',
  milestone: 'bg-blue-500/10 text-blue-500',
};

const PRIORITY_INDICATORS: Record<Goal['priority'], { label: string; class: string }> = {
  high: { label: 'High', class: 'bg-danger/10 text-danger' },
  medium: { label: 'Med', class: 'bg-warning/10 text-warning' },
  low: { label: 'Low', class: 'bg-text-secondary/10 text-text-secondary' },
};

const STATUS_LABELS: Record<Goal['status'], { label: string; class: string }> = {
  pending: { label: 'Pending', class: 'bg-text-secondary/10 text-text-secondary' },
  in_progress: { label: 'Active', class: 'bg-primary/10 text-primary' },
  completed: { label: 'Done', class: 'bg-primary/10 text-primary' },
  cancelled: { label: 'Cancelled', class: 'bg-danger/10 text-danger' },
};

export function GoalItem({ goal, onEdit, onDelete }: GoalItemProps) {
  // Swipe gesture state
  const touchStartX = useRef<number | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swipeAction, setSwipeAction] = useState<'delete' | 'edit' | null>(null);

  const SWIPE_THRESHOLD = 60;

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    setSwipeOffset(0);
    setSwipeAction(null);
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const delta = e.touches[0].clientX - touchStartX.current;
    const clamped = Math.max(-100, Math.min(100, delta));
    setSwipeOffset(clamped);
    if (clamped < -SWIPE_THRESHOLD) setSwipeAction('delete');
    else if (clamped > SWIPE_THRESHOLD) setSwipeAction('edit');
    else setSwipeAction(null);
  }

  function handleTouchEnd() {
    if (swipeAction === 'delete') onDelete(goal.id);
    else if (swipeAction === 'edit') onEdit(goal);
    setSwipeOffset(0);
    setSwipeAction(null);
    touchStartX.current = null;
  }

  // Compute progress ratio (0-1)
  const progressRatio = goal.targetAmount && goal.targetAmount > 0
    ? Math.min(1, goal.currentAmount / goal.targetAmount)
    : goal.status === 'completed' ? 1 : 0;

  // Format target date
  const targetDateDisplay = goal.targetDate
    ? new Date((goal.targetDate as unknown as { seconds: number }).seconds * 1000).toLocaleDateString('en-ZA', {
        month: 'short',
        year: 'numeric',
      })
    : null;

  const isDebtPayoff = goal.type === 'debt_payoff' && goal.debtTracking;

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Swipe hint backgrounds */}
      <div className="absolute inset-0 flex">
        <div className="flex-1 bg-primary/20 flex items-center pl-4">
          <span className="text-primary text-sm font-medium">Edit</span>
        </div>
        <div className="flex-1 bg-danger/20 flex items-center justify-end pr-4">
          <span className="text-danger text-sm font-medium">Delete</span>
        </div>
      </div>

      {/* Main card */}
      <div
        className="relative bg-surface border border-border rounded-xl px-4 py-3 transition-transform"
        style={{ transform: `translateX(${swipeOffset}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex items-start gap-3">
          {/* Progress Ring */}
          <ProgressRing value={progressRatio} size={48} strokeWidth={4}>
            <span className="text-xs font-medium text-text-primary">
              {Math.round(progressRatio * 100)}%
            </span>
          </ProgressRing>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Title row */}
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-medium text-text-primary truncate">
                {goal.title}
              </h3>
            </div>

            {/* Badges row */}
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              {/* Type badge */}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${TYPE_COLORS[goal.type]}`}>
                {TYPE_LABELS[goal.type]}
              </span>

              {/* Priority badge */}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${PRIORITY_INDICATORS[goal.priority].class}`}>
                {PRIORITY_INDICATORS[goal.priority].label}
              </span>

              {/* Status badge */}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUS_LABELS[goal.status].class}`}>
                {STATUS_LABELS[goal.status].label}
              </span>

              {/* On-track indicator */}
              {goal.status === 'in_progress' && (
                goal.isOnTrack ? (
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                    On track
                  </span>
                ) : goal.monthsBehind > 0 ? (
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-warning/10 text-warning">
                    {goal.monthsBehind}mo behind
                  </span>
                ) : null
              )}
            </div>

            {/* Amounts */}
            <div className="flex items-center gap-2 text-xs">
              <AmountDisplay amount={goal.currentAmount} size="sm" className="text-text-primary" />
              {goal.targetAmount && (
                <>
                  <span className="text-text-secondary">/</span>
                  <AmountDisplay amount={goal.targetAmount} size="sm" className="text-text-secondary" />
                </>
              )}
              {targetDateDisplay && (
                <span className="text-text-secondary ml-auto">
                  Target: {targetDateDisplay}
                </span>
              )}
            </div>

            {/* Debt payoff details */}
            {isDebtPayoff && goal.debtTracking && (
              <div className="mt-2 pt-2 border-t border-border text-xs text-text-secondary space-y-0.5">
                <div className="flex justify-between">
                  <span>Current balance:</span>
                  <AmountDisplay amount={goal.debtTracking.currentBalance} size="sm" />
                </div>
                {goal.debtTracking.interestRate !== undefined && (
                  <div className="flex justify-between">
                    <span>Interest rate:</span>
                    <span>{goal.debtTracking.interestRate}%</span>
                  </div>
                )}
                {goal.debtTracking.projectedPayoffDate && (
                  <div className="flex justify-between">
                    <span>Projected payoff:</span>
                    <span>
                      {new Date((goal.debtTracking.projectedPayoffDate as unknown as { seconds: number }).seconds * 1000).toLocaleDateString('en-ZA', {
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Desktop action buttons */}
          <div className="hidden sm:flex items-center gap-1 shrink-0">
            <button
              onClick={() => onEdit(goal)}
              aria-label="Edit goal"
              className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-border transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16">
                <path d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              onClick={() => onDelete(goal.id)}
              aria-label="Delete goal"
              className="p-1.5 rounded-lg text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16">
                <path d="M3 4h10M6 4V2h4v2M5 4v9a1 1 0 001 1h4a1 1 0 001-1V4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
