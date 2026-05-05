'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useCommitments } from '@/hooks/use-commitments';
import { useGoals, GoalWithComputed } from '@/hooks/use-goals';
import { AmountDisplay } from '@/components/shared/amount-display';
import { CurrencyInput } from '@/components/shared/currency-input';
import { useToast } from '@/components/shared/toast';
import type { Category, Commitment } from '@/types';

// ---------------------------------------------------------------------------
// Category display helpers
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<Category, string> = {
  housing: 'Housing',
  transport: 'Transport',
  family: 'Family',
  utilities: 'Utilities',
  health: 'Health',
  education: 'Education',
  savings: 'Savings',
  lifestyle: 'Lifestyle',
  business: 'Business',
  other: 'Other',
};

const CATEGORIES: Category[] = [
  'housing', 'transport', 'family', 'utilities', 'health',
  'education', 'savings', 'lifestyle', 'business', 'other',
];

const GOAL_TYPE_ICONS: Record<string, string> = {
  savings: '💰',
  debt_payoff: '📉',
  investment: '📈',
};

// ---------------------------------------------------------------------------
// Plan Page
// ---------------------------------------------------------------------------

export default function PlanPage() {
  const { commitments, loading: commitmentsLoading, commitmentsByCategory, totalMonthly } = useCommitments();
  const { activeGoals, loading: goalsLoading, commitments: allCommitments } = useGoals();

  const [showCommitmentForm, setShowCommitmentForm] = useState(false);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [editingCommitment, setEditingCommitment] = useState<Commitment | null>(null);
  const { toast, confirm } = useToast();

  const loading = commitmentsLoading || goalsLoading;

  if (loading) {
    return <PlanSkeleton />;
  }

  return (
    <div className="space-y-8 pb-8">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Your Financial Plan</h1>
      </div>

      {/* ── Monthly Commitments ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wide">
              Monthly Commitments
            </h2>
            <AmountDisplay amount={totalMonthly} size="lg" className="text-text-primary" />
          </div>
          {!showCommitmentForm && !editingCommitment && (
            <button
              onClick={() => setShowCommitmentForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-background text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Add Commitment
            </button>
          )}
        </div>

        {/* Inline add form */}
        {showCommitmentForm && (
          <CommitmentForm
            goals={activeGoals}
            onSave={async (data) => {
              await fetch('/api/commitments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...data, sortOrder: commitments.length }),
              });
              setShowCommitmentForm(false);
            }}
            onCancel={() => setShowCommitmentForm(false)}
          />
        )}

        {/* Edit form */}
        {editingCommitment && (
          <CommitmentForm
            initial={editingCommitment}
            goals={activeGoals}
            onSave={async (data) => {
              await fetch(`/api/commitments/${editingCommitment.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
              });
              setEditingCommitment(null);
            }}
            onCancel={() => setEditingCommitment(null)}
          />
        )}

        {/* Commitments grouped by category */}
        {commitments.length === 0 && !showCommitmentForm ? (
          <div className="text-center py-10 text-text-secondary text-sm">
            No commitments yet. Add your first recurring expense.
          </div>
        ) : (
          <div className="space-y-4">
            {CATEGORIES.map((cat) => {
              const items = commitmentsByCategory.get(cat);
              if (!items || items.length === 0) return null;
              const subtotal = items.reduce((s, c) => s + c.amount, 0);
              return (
                <CategoryGroup
                  key={cat}
                  category={cat}
                  items={items}
                  subtotal={subtotal}
                  goals={activeGoals}
                  onEdit={setEditingCommitment}
                  onDelete={async (id) => {
                    confirm('This will permanently delete the commitment.', async () => {
                      await fetch(`/api/commitments/${id}`, { method: 'DELETE' });
                      toast('Commitment deleted', 'success');
                    }, { title: 'Delete Commitment', confirmLabel: 'Delete', danger: true });
                  }}
                />
              );
            })}
          </div>
        )}
      </section>

      {/* ── Goals ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wide">Goals</h2>
          {!showGoalForm && (
            <button
              onClick={() => setShowGoalForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-background text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Add Goal
            </button>
          )}
        </div>

        {showGoalForm && (
          <GoalForm
            onSave={async (data) => {
              await fetch('/api/goals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
              });
              setShowGoalForm(false);
            }}
            onCancel={() => setShowGoalForm(false)}
          />
        )}

        {activeGoals.length === 0 && !showGoalForm ? (
          <div className="text-center py-10 text-text-secondary text-sm">
            No goals yet. Add a savings target, debt payoff, or investment goal.
          </div>
        ) : (
          <div className="space-y-3">
            {activeGoals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onDelete={async (id) => {
                  confirm('This will permanently delete the goal.', async () => {
                    await fetch(`/api/goals/${id}`, { method: 'DELETE' });
                    toast('Goal deleted', 'success');
                  }, { title: 'Delete Goal', confirmLabel: 'Delete', danger: true });
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CategoryGroup
// ---------------------------------------------------------------------------

interface CategoryGroupProps {
  category: Category;
  items: Commitment[];
  subtotal: number;
  goals: GoalWithComputed[];
  onEdit: (c: Commitment) => void;
  onDelete: (id: string) => void;
}

function CategoryGroup({ category, items, subtotal, goals, onEdit, onDelete }: CategoryGroupProps) {
  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      {/* Category header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-background/40">
        <span className="text-sm font-medium text-text-primary">{CATEGORY_LABELS[category]}</span>
        <AmountDisplay amount={subtotal} size="sm" className="text-text-secondary" />
      </div>

      {/* Items */}
      <div className="divide-y divide-border">
        {items.map((commitment) => (
          <CommitmentRow
            key={commitment.id}
            commitment={commitment}
            goals={goals}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CommitmentRow
// ---------------------------------------------------------------------------

interface CommitmentRowProps {
  commitment: Commitment;
  goals: GoalWithComputed[];
  onEdit: (c: Commitment) => void;
  onDelete: (id: string) => void;
}

function CommitmentRow({ commitment, goals, onEdit, onDelete }: CommitmentRowProps) {
  const linkedGoal = goals.find((g) => g.id === commitment.linkedGoalId);

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {/* Tree connector */}
      <span className="text-border text-sm select-none">├─</span>

      {/* Label + badges */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-text-primary truncate">{commitment.label}</span>
          {commitment.isVariable && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/10 text-warning font-medium uppercase tracking-wide">
              Variable
            </span>
          )}
          {linkedGoal && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium truncate max-w-[120px]">
              → {linkedGoal.name}
            </span>
          )}
        </div>
      </div>

      {/* Amount */}
      <AmountDisplay amount={commitment.amount} size="sm" className="text-text-primary shrink-0" />

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onEdit(commitment)}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-background text-text-secondary hover:text-text-primary transition-colors"
          aria-label="Edit commitment"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16">
            <path
              d="M11.5 2.5a1.414 1.414 0 012 2L5 13H3v-2L11.5 2.5z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          onClick={() => onDelete(commitment.id)}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-background text-text-secondary hover:text-danger transition-colors"
          aria-label="Delete commitment"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16">
            <path d="M3 4h10M6 4V2h4v2M5 4v9a1 1 0 001 1h4a1 1 0 001-1V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CommitmentForm (inline add / edit)
// ---------------------------------------------------------------------------

interface CommitmentFormProps {
  initial?: Commitment;
  goals: GoalWithComputed[];
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}

function CommitmentForm({ initial, goals, onSave, onCancel }: CommitmentFormProps) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [amount, setAmount] = useState(initial?.amount ?? 0);
  const [category, setCategory] = useState<Category>(initial?.category ?? 'other');
  const [accountType, setAccountType] = useState<'personal' | 'business'>(initial?.accountType ?? 'personal');
  const [isVariable, setIsVariable] = useState(initial?.isVariable ?? false);
  const [dueDay, setDueDay] = useState<string>(initial?.dueDay?.toString() ?? '');
  const [linkedGoalId, setLinkedGoalId] = useState(initial?.linkedGoalId ?? '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        label,
        amount,
        category,
        accountType,
        isVariable,
        dueDay: dueDay ? parseInt(dueDay, 10) : null,
        linkedGoalId: linkedGoalId || null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-4 p-4 rounded-xl border border-primary/40 bg-surface space-y-4"
    >
      <h3 className="text-sm font-semibold text-text-primary">
        {initial ? 'Edit Commitment' : 'New Commitment'}
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Label */}
        <div className="sm:col-span-2">
          <label className="block text-xs text-text-secondary mb-1">Label</label>
          <input
            required
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g., Bond, Medical Aid"
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
          />
        </div>

        {/* Amount */}
        <div>
          <label className="block text-xs text-text-secondary mb-1">Amount</label>
          <CurrencyInput value={amount} onChange={setAmount} />
        </div>

        {/* Category */}
        <div>
          <label className="block text-xs text-text-secondary mb-1">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </div>

        {/* Account type */}
        <div>
          <label className="block text-xs text-text-secondary mb-1">Account</label>
          <select
            value={accountType}
            onChange={(e) => setAccountType(e.target.value as 'personal' | 'business')}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
          >
            <option value="personal">Personal</option>
            <option value="business">Business</option>
          </select>
        </div>

        {/* Due day */}
        <div>
          <label className="block text-xs text-text-secondary mb-1">Due Day (optional)</label>
          <input
            type="number"
            min="1"
            max="31"
            value={dueDay}
            onChange={(e) => setDueDay(e.target.value)}
            placeholder="e.g., 25"
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
          />
        </div>

        {/* Link to goal */}
        <div className="sm:col-span-2">
          <label className="block text-xs text-text-secondary mb-1">Link to Goal (optional)</label>
          <select
            value={linkedGoalId}
            onChange={(e) => setLinkedGoalId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
          >
            <option value="">— No goal —</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {GOAL_TYPE_ICONS[g.type]} {g.name}
              </option>
            ))}
          </select>
        </div>

        {/* Variable toggle */}
        <div className="sm:col-span-2 flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={isVariable}
            onClick={() => setIsVariable(!isVariable)}
            className={`relative w-10 h-5 rounded-full transition-colors ${
              isVariable ? 'bg-primary' : 'bg-border'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                isVariable ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
          <span className="text-sm text-text-primary">Variable amount (changes each month)</span>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm text-text-secondary hover:bg-background transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !label || amount === 0}
          className="px-4 py-2 rounded-lg bg-primary text-background text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : initial ? 'Save Changes' : 'Add Commitment'}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// GoalCard
// ---------------------------------------------------------------------------

interface GoalCardProps {
  goal: GoalWithComputed;
  onDelete: (id: string) => void;
}

function GoalCard({ goal, onDelete }: GoalCardProps) {
  const progressPercent =
    goal.targetAmount > 0
      ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100))
      : 0;

  const icon = GOAL_TYPE_ICONS[goal.type] ?? '🎯';

  return (
    <Link
      href={`/goals/${goal.id}`}
      className="block p-4 rounded-xl border border-border bg-surface hover:border-primary/40 transition-colors"
    >
      {/* Header row */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg shrink-0">{icon}</span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-primary truncate">{goal.name}</p>
            <p className="text-xs text-text-secondary capitalize">{goal.type.replace('_', ' ')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {/* On-track badge */}
          {goal.isOnTrack ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
              On Track
            </span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded-full bg-warning/10 text-warning font-medium">
              Behind
            </span>
          )}
          <button
            onClick={(e) => {
              e.preventDefault();
              onDelete(goal.id);
            }}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-background text-text-secondary hover:text-danger transition-colors"
            aria-label="Delete goal"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16">
              <path d="M3 4h10M6 4V2h4v2M5 4v9a1 1 0 001 1h4a1 1 0 001-1V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-2">
        <div className="flex items-center justify-between text-xs text-text-secondary mb-1">
          <AmountDisplay amount={goal.currentAmount} size="xs" />
          <span>{progressPercent}%</span>
          <AmountDisplay amount={goal.targetAmount} size="xs" />
        </div>
        <div className="h-2 bg-background rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${goal.isOnTrack ? 'bg-primary' : 'bg-warning'}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Footer row */}
      <div className="flex items-center justify-between text-xs text-text-secondary">
        {goal.effectiveMonthlyTarget > 0 ? (
          <span>
            <AmountDisplay amount={goal.effectiveMonthlyTarget} size="xs" className="inline" />
            <span className="ml-1">/mo</span>
            {goal.linkedCommitments.length > 0 && (
              <span className="ml-1 text-primary">· {goal.linkedCommitments.length} linked</span>
            )}
          </span>
        ) : (
          <span>No monthly target set</span>
        )}
        {goal.estimatedCompletionDate && goal.currentAmount < goal.targetAmount && (
          <span>
            Est.{' '}
            {goal.estimatedCompletionDate.toLocaleDateString('en-ZA', {
              month: 'short',
              year: 'numeric',
            })}
          </span>
        )}
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// GoalForm (inline add)
// ---------------------------------------------------------------------------

interface GoalFormProps {
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}

function GoalForm({ onSave, onCancel }: GoalFormProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'savings' | 'debt_payoff' | 'investment'>('savings');
  const [targetAmount, setTargetAmount] = useState(0);
  const [monthlyTarget, setMonthlyTarget] = useState(0);
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        name,
        type,
        targetAmount,
        monthlyTarget: monthlyTarget || null,
        priority,
        notes: notes || null,
        allowWithdrawals: type === 'savings',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-4 p-4 rounded-xl border border-primary/40 bg-surface space-y-4"
    >
      <h3 className="text-sm font-semibold text-text-primary">New Goal</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Name */}
        <div className="sm:col-span-2">
          <label className="block text-xs text-text-secondary mb-1">Goal Name</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Emergency Fund, Pay off car"
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
          />
        </div>

        {/* Type */}
        <div>
          <label className="block text-xs text-text-secondary mb-1">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
          >
            <option value="savings">💰 Savings</option>
            <option value="debt_payoff">📉 Debt Payoff</option>
            <option value="investment">📈 Investment</option>
          </select>
        </div>

        {/* Priority */}
        <div>
          <label className="block text-xs text-text-secondary mb-1">Priority</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as typeof priority)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        {/* Target amount */}
        <div>
          <label className="block text-xs text-text-secondary mb-1">Target Amount</label>
          <CurrencyInput value={targetAmount} onChange={setTargetAmount} />
        </div>

        {/* Monthly target */}
        <div>
          <label className="block text-xs text-text-secondary mb-1">Monthly Target (optional)</label>
          <CurrencyInput value={monthlyTarget} onChange={setMonthlyTarget} />
        </div>

        {/* Notes */}
        <div className="sm:col-span-2">
          <label className="block text-xs text-text-secondary mb-1">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary resize-none"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm text-text-secondary hover:bg-background transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !name || targetAmount === 0}
          className="px-4 py-2 rounded-lg bg-primary text-background text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Add Goal'}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function PlanSkeleton() {
  return (
    <div className="space-y-8 pb-8 animate-pulse">
      <div className="h-7 w-48 bg-surface rounded" />
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="h-3 w-36 bg-surface rounded" />
            <div className="h-7 w-24 bg-surface rounded" />
          </div>
          <div className="h-8 w-32 bg-surface rounded-lg" />
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-28 bg-surface rounded-xl" />
        ))}
      </section>
      <section className="space-y-3">
        <div className="h-4 w-16 bg-surface rounded" />
        {[1, 2].map((i) => (
          <div key={i} className="h-24 bg-surface rounded-xl" />
        ))}
      </section>
    </div>
  );
}
