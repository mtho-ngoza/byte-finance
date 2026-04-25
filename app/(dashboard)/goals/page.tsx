'use client';

import { useState } from 'react';
import { useGoals } from '@/hooks/use-goals';
import type { Goal } from '@/types';

export default function GoalsPage() {
  const { goals, loading, activeGoals, goalsByType, totalProgress, totalTarget } = useGoals();
  const [showForm, setShowForm] = useState(false);

  const formatAmount = (cents: number) => {
    return `R${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 0 })}`;
  };

  const getProgressPercentage = (current: number, target: number) => {
    if (target === 0) return 0;
    return Math.min(100, Math.round((current / target) * 100));
  };

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const body = {
      name: formData.get('name'),
      type: formData.get('type'),
      targetAmount: Number(formData.get('targetAmount')) * 100, // Convert to cents
      monthlyTarget: formData.get('monthlyTarget') ? Number(formData.get('monthlyTarget')) * 100 : null,
      priority: formData.get('priority'),
      notes: formData.get('notes') || null,
    };

    await fetch('/api/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    setShowForm(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this goal?')) return;
    await fetch(`/api/goals/${id}`, { method: 'DELETE' });
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-32 bg-surface rounded" />
        <div className="h-24 bg-surface rounded-xl" />
        <div className="h-24 bg-surface rounded-xl" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-text-primary">Goals</h1>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-background text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Add Goal
          </button>
        )}
      </div>

      {/* Overall Progress */}
      {totalTarget > 0 && (
        <div className="mb-6 p-4 rounded-xl border border-border bg-surface">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-text-secondary">Overall Progress</span>
            <span className="text-sm font-medium text-text-primary">
              {formatAmount(totalProgress)} / {formatAmount(totalTarget)}
            </span>
          </div>
          <div className="h-2 bg-background rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${getProgressPercentage(totalProgress, totalTarget)}%` }}
            />
          </div>
        </div>
      )}

      {/* Add Form */}
      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 p-4 rounded-xl border border-border bg-surface space-y-4">
          <h2 className="text-base font-semibold text-text-primary">New Goal</h2>

          <div>
            <label className="block text-sm text-text-secondary mb-1">Name</label>
            <input
              name="name"
              required
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary"
              placeholder="e.g., Emergency Fund"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1">Type</label>
              <select
                name="type"
                required
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary"
              >
                <option value="savings">Savings</option>
                <option value="debt_payoff">Debt Payoff</option>
                <option value="investment">Investment</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">Priority</label>
              <select
                name="priority"
                required
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1">Target Amount (R)</label>
              <input
                name="targetAmount"
                type="number"
                required
                min="0"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary"
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">Monthly Target (R)</label>
              <input
                name="monthlyTarget"
                type="number"
                min="0"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1">Notes</label>
            <textarea
              name="notes"
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg text-text-secondary hover:bg-surface transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-primary text-background font-medium hover:bg-primary/90 transition-colors"
            >
              Create Goal
            </button>
          </div>
        </form>
      )}

      {/* Goals List */}
      {activeGoals.length === 0 ? (
        <div className="text-center py-12 text-text-secondary">
          <p>No goals yet. Create one to start tracking your progress.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {activeGoals.map((goal) => (
            <div
              key={goal.id}
              className="p-4 rounded-xl border border-border bg-surface"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-medium text-text-primary">{goal.name}</h3>
                  <span className="text-xs text-text-secondary capitalize">{goal.type.replace('_', ' ')}</span>
                </div>
                <div className="flex items-center gap-2">
                  {goal.isOnTrack ? (
                    <span className="text-xs text-primary">On Track</span>
                  ) : (
                    <span className="text-xs text-warning">Behind</span>
                  )}
                  <button
                    onClick={() => handleDelete(goal.id)}
                    className="p-1 text-text-secondary hover:text-danger transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16">
                      <path d="M5 5l6 6M11 5l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-text-secondary">Progress</span>
                <span className="font-mono text-text-primary">
                  {formatAmount(goal.currentAmount)} / {formatAmount(goal.targetAmount)}
                </span>
              </div>

              <div className="h-2 bg-background rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${getProgressPercentage(goal.currentAmount, goal.targetAmount)}%` }}
                />
              </div>

              {goal.monthlyTarget && (
                <p className="mt-2 text-xs text-text-secondary">
                  Monthly target: {formatAmount(goal.monthlyTarget)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
