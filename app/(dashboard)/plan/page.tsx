'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useCommitments } from '@/hooks/use-commitments';
import { useGoals } from '@/hooks/use-goals';
import { AmountDisplay } from '@/components/shared/amount-display';
import type { Commitment, Goal, Category } from '@/types';

// Category display order and labels
const CATEGORY_ORDER: Category[] = [
  'housing',
  'transport',
  'family',
  'health',
  'utilities',
  'savings',
  'education',
  'lifestyle',
  'business',
  'other',
];

const CATEGORY_LABELS: Record<Category, string> = {
  housing: 'Housing',
  transport: 'Transport',
  family: 'Family',
  health: 'Health',
  utilities: 'Utilities',
  savings: 'Savings',
  education: 'Education',
  lifestyle: 'Lifestyle',
  business: 'Business',
  other: 'Other',
};

export default function PlanPage() {
  const { commitments, commitmentsByCategory, totalMonthly, loading: commitmentsLoading } = useCommitments();
  const { activeGoals, loading: goalsLoading } = useGoals();
  const [expandedCategories, setExpandedCategories] = useState<Set<Category>>(new Set(CATEGORY_ORDER));

  const loading = commitmentsLoading || goalsLoading;

  const toggleCategory = (category: Category) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 bg-surface rounded" />
        <div className="h-32 bg-surface rounded-xl" />
        <div className="h-24 bg-surface rounded-xl" />
      </div>
    );
  }

  // Calculate total for goals monthly contributions
  const totalGoalsMonthly = activeGoals.reduce((sum, g) => sum + (g.monthlyTarget || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Your Financial Plan</h1>
          <p className="text-sm text-text-secondary mt-1">
            {commitments.length} commitments · {activeGoals.length} goals
          </p>
        </div>
      </div>

      {/* Monthly Commitments Section */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
            Monthly Commitments
          </h2>
          <AmountDisplay amount={totalMonthly} size="lg" />
        </div>

        <div className="space-y-2">
          {CATEGORY_ORDER.map((category) => {
            const items = commitmentsByCategory.get(category);
            if (!items || items.length === 0) return null;

            const categoryTotal = items.reduce((sum, c) => sum + c.amount, 0);
            const isExpanded = expandedCategories.has(category);

            return (
              <div key={category} className="bg-surface border border-border rounded-lg overflow-hidden">
                {/* Category header */}
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full flex items-center justify-between p-3 hover:bg-background transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <svg
                      className={`w-4 h-4 text-text-secondary transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="text-sm font-medium text-text-primary">
                      {CATEGORY_LABELS[category]}
                    </span>
                    <span className="text-xs text-text-secondary">({items.length})</span>
                  </div>
                  <AmountDisplay amount={categoryTotal} size="sm" />
                </button>

                {/* Category items */}
                {isExpanded && (
                  <div className="border-t border-border">
                    {items.map((item) => (
                      <CommitmentRow key={item.id} commitment={item} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Add commitment link */}
        <Link
          href="/settings"
          className="mt-3 flex items-center justify-center gap-2 w-full py-2.5 border border-dashed border-border rounded-lg text-sm text-text-secondary hover:text-text-primary hover:border-primary transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Commitment
        </Link>
      </section>

      {/* Goals Section */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
            Goals
          </h2>
          {totalGoalsMonthly > 0 && (
            <div className="text-right">
              <span className="text-xs text-text-secondary">Monthly: </span>
              <AmountDisplay amount={totalGoalsMonthly} size="sm" className="inline" />
            </div>
          )}
        </div>

        {activeGoals.length === 0 ? (
          <div className="text-center py-8 text-text-secondary">
            <p>No active goals yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeGoals.map((goal) => (
              <GoalCard key={goal.id} goal={goal} />
            ))}
          </div>
        )}

        {/* Add goal link */}
        <Link
          href="/goals"
          className="mt-3 flex items-center justify-center gap-2 w-full py-2.5 border border-dashed border-border rounded-lg text-sm text-text-secondary hover:text-text-primary hover:border-primary transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Goal
        </Link>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CommitmentRow Component
// ---------------------------------------------------------------------------

interface CommitmentRowProps {
  commitment: Commitment;
}

function CommitmentRow({ commitment }: CommitmentRowProps) {
  return (
    <div className="flex items-center justify-between px-3 py-2 pl-9 hover:bg-background transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm text-text-primary truncate">{commitment.label}</span>
        {commitment.isVariable && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/10 text-warning uppercase">
            Variable
          </span>
        )}
        {commitment.linkedGoalId && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary uppercase">
            Linked
          </span>
        )}
        {commitment.accountType === 'business' && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 uppercase">
            Biz
          </span>
        )}
      </div>
      <AmountDisplay amount={commitment.amount} size="sm" className="text-text-secondary" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// GoalCard Component
// ---------------------------------------------------------------------------

interface GoalCardProps {
  goal: Goal;
}

function GoalCard({ goal }: GoalCardProps) {
  const progressPercent = goal.targetAmount > 0
    ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100))
    : 0;

  const remaining = goal.targetAmount - goal.currentAmount;

  // Calculate months to reach goal at current monthly rate
  const monthsRemaining = goal.monthlyTarget && goal.monthlyTarget > 0
    ? Math.ceil(remaining / goal.monthlyTarget)
    : null;

  const typeIcon = {
    savings: '💰',
    debt_payoff: '📉',
    investment: '📈',
  }[goal.type];

  const typeLabel = {
    savings: 'Savings',
    debt_payoff: 'Debt Payoff',
    investment: 'Investment',
  }[goal.type];

  return (
    <div className="p-4 bg-surface border border-border rounded-lg">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{typeIcon}</span>
          <div>
            <h3 className="text-sm font-medium text-text-primary">{goal.name}</h3>
            <p className="text-xs text-text-secondary">{typeLabel}</p>
          </div>
        </div>
        {goal.monthlyTarget && goal.monthlyTarget > 0 && (
          <div className="text-right">
            <AmountDisplay amount={goal.monthlyTarget} size="sm" />
            <p className="text-[10px] text-text-secondary">/month</p>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="mb-2">
        <div className="flex justify-between text-xs text-text-secondary mb-1">
          <span>{progressPercent}% complete</span>
          {!goal.isOnTrack && (
            <span className="text-warning">Behind target</span>
          )}
        </div>
        <div className="h-2 bg-background rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              goal.isOnTrack ? 'bg-primary' : 'bg-warning'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Amounts */}
      <div className="flex items-center justify-between text-xs">
        <div>
          <span className="text-text-secondary">Saved: </span>
          <AmountDisplay amount={goal.currentAmount} size="xs" className="inline text-text-primary" />
        </div>
        <div>
          <span className="text-text-secondary">Target: </span>
          <AmountDisplay amount={goal.targetAmount} size="xs" className="inline text-text-primary" />
        </div>
      </div>

      {/* Time estimate */}
      {monthsRemaining !== null && monthsRemaining > 0 && (
        <p className="text-xs text-text-secondary mt-2">
          ~{monthsRemaining} month{monthsRemaining !== 1 ? 's' : ''} to goal at current rate
        </p>
      )}

      {/* Maturity date for investments */}
      {goal.type === 'investment' && goal.investmentTracking?.maturityDate && (
        <p className="text-xs text-text-secondary mt-2">
          Matures: {goal.investmentTracking.maturityDate.toDate().toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })}
        </p>
      )}
    </div>
  );
}
