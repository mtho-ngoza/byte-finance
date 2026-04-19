'use client';

import { useState } from 'react';
import { useGoals } from '@/hooks/use-goals';
import { GoalList } from '@/components/goals/goal-list';
import { GoalForm } from '@/components/goals/goal-form';
import type { Goal } from '@/types';

interface GoalFormValues {
  title: string;
  type: 'savings' | 'purchase' | 'debt_payoff' | 'milestone';
  targetAmount?: number;
  currentAmount: number;
  year: number;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  startDate?: string;
  targetDate?: string;
  expectedMonthlyContribution?: number;
  linkedExpenseLabel?: string;
  notes?: string;
  debtOriginalBalance?: number;
  debtCurrentBalance?: number;
  debtInterestRate?: number;
  debtMinimumPayment?: number;
  debtLender?: string;
  debtAccountNumber?: string;
}

function dateStringToTimestamp(dateStr: string | undefined): { seconds: number; nanoseconds: number } | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;
  return { seconds: Math.floor(date.getTime() / 1000), nanoseconds: 0 };
}

export default function GoalsPage() {
  const { goals, loading, goalsByYear } = useGoals();
  const [showForm, setShowForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);

  const handleCreate = async (values: GoalFormValues) => {
    const body: Record<string, unknown> = {
      title: values.title,
      type: values.type,
      targetAmount: values.targetAmount || null,
      currentAmount: values.currentAmount,
      year: values.year,
      priority: values.priority,
      status: values.status,
      startDate: dateStringToTimestamp(values.startDate),
      targetDate: dateStringToTimestamp(values.targetDate),
      expectedMonthlyContribution: values.expectedMonthlyContribution || null,
      linkedExpenseLabel: values.linkedExpenseLabel || null,
      notes: values.notes || null,
    };

    // Add debt tracking if type is debt_payoff
    if (values.type === 'debt_payoff') {
      body.debtTracking = {
        originalBalance: values.debtOriginalBalance || 0,
        currentBalance: values.debtCurrentBalance || 0,
        interestRate: values.debtInterestRate || null,
        minimumPayment: values.debtMinimumPayment || null,
        lender: values.debtLender || null,
        accountNumber: values.debtAccountNumber || null,
      };
    }

    await fetch('/api/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setShowForm(false);
  };

  const handleUpdate = async (values: GoalFormValues) => {
    if (!editingGoal) return;

    const body: Record<string, unknown> = {
      title: values.title,
      type: values.type,
      targetAmount: values.targetAmount || null,
      currentAmount: values.currentAmount,
      year: values.year,
      priority: values.priority,
      status: values.status,
      startDate: dateStringToTimestamp(values.startDate),
      targetDate: dateStringToTimestamp(values.targetDate),
      expectedMonthlyContribution: values.expectedMonthlyContribution || null,
      linkedExpenseLabel: values.linkedExpenseLabel || null,
      notes: values.notes || null,
    };

    // Add debt tracking if type is debt_payoff
    if (values.type === 'debt_payoff') {
      body.debtTracking = {
        originalBalance: values.debtOriginalBalance || 0,
        currentBalance: values.debtCurrentBalance || 0,
        interestRate: values.debtInterestRate || null,
        minimumPayment: values.debtMinimumPayment || null,
        lender: values.debtLender || null,
        accountNumber: values.debtAccountNumber || null,
      };
    } else {
      body.debtTracking = null;
    }

    await fetch(`/api/goals/${editingGoal.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setEditingGoal(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this goal?')) return;

    await fetch(`/api/goals/${id}`, {
      method: 'DELETE',
    });
  };

  const handleEdit = (goal: Goal) => {
    setEditingGoal(goal);
    setShowForm(false);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingGoal(null);
  };

  // Get years in descending order
  const years = Array.from(goalsByYear.keys()).sort((a, b) => b - a);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-text-primary">Goals</h1>
        {!showForm && !editingGoal && (
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

      {/* Form Panel */}
      {showForm && (
        <div className="mb-6 rounded-xl border border-border bg-surface p-4">
          <h2 className="text-base font-semibold text-text-primary mb-4">New Goal</h2>
          <GoalForm onSubmit={handleCreate} onCancel={handleCancel} />
        </div>
      )}

      {editingGoal && (
        <div className="mb-6 rounded-xl border border-border bg-surface p-4">
          <h2 className="text-base font-semibold text-text-primary mb-4">Edit Goal</h2>
          <GoalForm goal={editingGoal} onSubmit={handleUpdate} onCancel={handleCancel} />
        </div>
      )}

      {/* Goals grouped by year */}
      {loading ? (
        <GoalList goals={[]} loading={true} onEdit={handleEdit} onDelete={handleDelete} />
      ) : goals.length === 0 ? (
        <GoalList goals={[]} loading={false} onEdit={handleEdit} onDelete={handleDelete} />
      ) : (
        <div className="space-y-6">
          {years.map((year) => {
            const yearGoals = goalsByYear.get(year) ?? [];
            return (
              <div key={year}>
                <h2 className="text-sm font-medium text-text-secondary mb-3">{year}</h2>
                <GoalList
                  goals={yearGoals}
                  loading={false}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
