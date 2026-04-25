'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useGoals } from '@/hooks/use-goals';
import { CurrencyInput } from '@/components/shared/currency-input';
import { AmountDisplay } from '@/components/shared/amount-display';
import { Skeleton } from '@/components/shared/skeleton';
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommitmentFormData {
  label: string;
  amount: number;
  category: Category;
  accountType: 'personal' | 'business';
  dueDay?: number;
  isVariable: boolean;
  linkedGoalId?: string;
}

const EMPTY_FORM: CommitmentFormData = {
  label: '',
  amount: 0,
  category: 'other',
  accountType: 'personal',
  isVariable: false,
  linkedGoalId: undefined,
};

// ---------------------------------------------------------------------------
// Main Plan Page
// ---------------------------------------------------------------------------

export default function PlanPage() {
  const { activeGoals, loading: goalsLoading } = useGoals();
  const [items, setItems] = useState<Commitment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<Commitment | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<Category>>(new Set(CATEGORY_ORDER));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Fetch commitments
  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch('/api/commitments');
      if (!res.ok) throw new Error('Failed to load commitments');
      const data = await res.json();
      setItems(data.commitments ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Group by category
  const commitmentsByCategory = new Map<Category, Commitment[]>();
  for (const item of items.filter(i => i.isActive)) {
    const list = commitmentsByCategory.get(item.category) ?? [];
    list.push(item);
    commitmentsByCategory.set(item.category, list);
  }

  // Calculate totals
  const totalMonthly = items.filter(i => i.isActive).reduce((sum, c) => sum + c.amount, 0);
  const totalGoalsMonthly = activeGoals.reduce((sum, g) => sum + (g.monthlyTarget || 0), 0);

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

  // Create
  async function handleCreate(form: CommitmentFormData) {
    setSaving(true);
    setError(null);
    try {
      const nextOrder = items.length > 0 ? Math.max(...items.map((i) => i.sortOrder)) + 1 : 0;
      const res = await fetch('/api/commitments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, sortOrder: nextOrder, isActive: true }),
      });
      if (!res.ok) throw new Error('Failed to create commitment');
      const created = await res.json();
      setItems((prev) => [...prev, created as Commitment]);
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  // Update
  async function handleUpdate(form: CommitmentFormData) {
    if (!editingItem) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/commitments/${editingItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Failed to update commitment');
      const updated = await res.json();
      setItems((prev) => prev.map((i) => (i.id === editingItem.id ? (updated as Commitment) : i)));
      setEditingItem(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  // Toggle active
  async function handleToggleActive(item: Commitment) {
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, isActive: !i.isActive } : i))
    );
    try {
      const res = await fetch(`/api/commitments/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      if (!res.ok) throw new Error('Failed to update');
      const updated = await res.json();
      setItems((prev) => prev.map((i) => (i.id === item.id ? (updated as Commitment) : i)));
    } catch (err) {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, isActive: item.isActive } : i))
      );
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  // Delete
  async function handleDelete(id: string) {
    if (!confirm('Delete this commitment? This cannot be undone.')) return;
    const prev = items;
    setItems((p) => p.filter((i) => i.id !== id));
    try {
      const res = await fetch(`/api/commitments/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
    } catch (err) {
      setItems(prev);
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  // Drag end — reorder within category
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(items, oldIndex, newIndex);

    const withOrder = reordered.map((item, idx) => ({ ...item, sortOrder: idx }));
    setItems(withOrder);

    const prevOrderMap = new Map(items.map((i) => [i.id, i.sortOrder]));
    const changed = withOrder.filter((item) => prevOrderMap.get(item.id) !== item.sortOrder);
    await Promise.all(
      changed.map((item) =>
        fetch(`/api/commitments/${item.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sortOrder: item.sortOrder }),
        })
      )
    );
  }

  const isLoading = loading || goalsLoading;

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 bg-surface rounded" />
        <div className="h-32 bg-surface rounded-xl" />
        <div className="h-24 bg-surface rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Your Financial Plan</h1>
          <p className="text-sm text-text-secondary mt-1">
            {items.filter(i => i.isActive).length} commitments · {activeGoals.length} goals
          </p>
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 bg-danger/10 border border-danger/30 rounded-lg text-sm text-danger">
          {error}
        </div>
      )}

      {/* Monthly Commitments Section */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
            Monthly Commitments
          </h2>
          <AmountDisplay amount={totalMonthly} size="lg" />
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <div className="space-y-2">
            {CATEGORY_ORDER.map((category) => {
              const categoryItems = commitmentsByCategory.get(category);
              if (!categoryItems || categoryItems.length === 0) return null;

              const categoryTotal = categoryItems.reduce((sum, c) => sum + c.amount, 0);
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
                      <span className="text-xs text-text-secondary">({categoryItems.length})</span>
                    </div>
                    <AmountDisplay amount={categoryTotal} size="sm" />
                  </button>

                  {/* Category items */}
                  {isExpanded && (
                    <div className="border-t border-border">
                      <SortableContext
                        items={categoryItems.map((i) => i.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {categoryItems.map((item) => (
                          editingItem?.id === item.id ? (
                            <div key={item.id} className="p-3">
                              <CommitmentForm
                                initial={{
                                  label: item.label,
                                  amount: item.amount,
                                  category: item.category,
                                  accountType: item.accountType,
                                  dueDay: item.dueDay,
                                  isVariable: item.isVariable,
                                  linkedGoalId: item.linkedGoalId,
                                }}
                                goals={activeGoals}
                                onSave={handleUpdate}
                                onCancel={() => setEditingItem(null)}
                                saving={saving}
                              />
                            </div>
                          ) : (
                            <SortableCommitmentRow
                              key={item.id}
                              item={item}
                              onToggleActive={handleToggleActive}
                              onEdit={setEditingItem}
                              onDelete={handleDelete}
                            />
                          )
                        ))}
                      </SortableContext>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </DndContext>

        {/* Add commitment form or button */}
        <div className="mt-3">
          {showForm ? (
            <CommitmentForm
              goals={activeGoals}
              onSave={handleCreate}
              onCancel={() => setShowForm(false)}
              saving={saving}
            />
          ) : (
            <button
              onClick={() => setShowForm(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-border rounded-lg text-sm text-text-secondary hover:text-text-primary hover:border-primary transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add Commitment
            </button>
          )}
        </div>
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
// SortableCommitmentRow Component
// ---------------------------------------------------------------------------

interface SortableCommitmentRowProps {
  item: Commitment;
  onToggleActive: (item: Commitment) => void;
  onEdit: (item: Commitment) => void;
  onDelete: (id: string) => void;
}

function SortableCommitmentRow({ item, onToggleActive, onEdit, onDelete }: SortableCommitmentRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 px-3 py-2 hover:bg-background transition-colors"
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="text-text-secondary hover:text-text-primary cursor-grab active:cursor-grabbing shrink-0 touch-none"
        aria-label="Drag to reorder"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="5" cy="4" r="1.5" />
          <circle cx="11" cy="4" r="1.5" />
          <circle cx="5" cy="8" r="1.5" />
          <circle cx="11" cy="8" r="1.5" />
          <circle cx="5" cy="12" r="1.5" />
          <circle cx="11" cy="12" r="1.5" />
        </svg>
      </button>

      {/* Label + badges */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="text-sm text-text-primary truncate">{item.label}</span>
        {item.isVariable && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/10 text-warning uppercase shrink-0">
            Var
          </span>
        )}
        {item.accountType === 'business' && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 uppercase shrink-0">
            Biz
          </span>
        )}
        {item.linkedGoalId && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary shrink-0">
            linked
          </span>
        )}
      </div>

      {/* Amount */}
      <AmountDisplay amount={item.amount} size="sm" className="text-text-secondary shrink-0" />

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onEdit(item)}
          className="p-1.5 text-text-secondary hover:text-text-primary rounded transition-colors"
          aria-label={`Edit ${item.label}`}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9.5 1.5l3 3L4 13H1v-3L9.5 1.5z" />
          </svg>
        </button>
        <button
          onClick={() => onToggleActive(item)}
          className="p-1.5 text-text-secondary hover:text-warning rounded transition-colors"
          aria-label={item.isActive ? 'Deactivate' : 'Activate'}
          title={item.isActive ? 'Deactivate' : 'Activate'}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="7" cy="7" r="5.5" />
            {!item.isActive && <path d="M7 4v6M4 7h6" />}
          </svg>
        </button>
        <button
          onClick={() => onDelete(item.id)}
          className="p-1.5 text-text-secondary hover:text-danger rounded transition-colors"
          aria-label={`Delete ${item.label}`}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polyline points="1,3.5 13,3.5" />
            <path d="M5.5 3.5V2h3v1.5M3 3.5l.75 8.5h6.5L11 3.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CommitmentForm Component
// ---------------------------------------------------------------------------

interface CommitmentFormProps {
  initial?: CommitmentFormData;
  goals?: Goal[];
  onSave: (data: CommitmentFormData) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}

function CommitmentForm({ initial = EMPTY_FORM, goals = [], onSave, onCancel, saving }: CommitmentFormProps) {
  const [form, setForm] = useState<CommitmentFormData>(initial);

  function set<K extends keyof CommitmentFormData>(key: K, value: CommitmentFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.label.trim() || form.amount <= 0) return;
    await onSave(form);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-4 bg-surface border border-border rounded-lg">
      {/* Label */}
      <div>
        <label className="block text-xs text-text-secondary mb-1">Label</label>
        <input
          type="text"
          value={form.label}
          onChange={(e) => set('label', e.target.value)}
          placeholder="e.g. Rent, Medical Aid"
          required
          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-primary text-sm"
        />
      </div>

      {/* Amount */}
      <div>
        <label className="block text-xs text-text-secondary mb-1">Default Amount</label>
        <CurrencyInput value={form.amount} onChange={(cents) => set('amount', cents)} />
      </div>

      {/* Category + Account type */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-text-secondary mb-1">Category</label>
          <select
            value={form.category}
            onChange={(e) => set('category', e.target.value as Category)}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary text-sm capitalize"
          >
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c} className="capitalize">
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-text-secondary mb-1">Account</label>
          <select
            value={form.accountType}
            onChange={(e) => set('accountType', e.target.value as 'personal' | 'business')}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary text-sm"
          >
            <option value="personal">Personal</option>
            <option value="business">Business</option>
          </select>
        </div>
      </div>

      {/* Variable toggle */}
      <div className="flex items-center">
        <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
          <input
            type="checkbox"
            checked={form.isVariable}
            onChange={(e) => set('isVariable', e.target.checked)}
            className="w-4 h-4 rounded border-border bg-background accent-primary"
          />
          Variable amount (changes month to month)
        </label>
      </div>

      {/* Goal linking */}
      {goals.length > 0 && (
        <div>
          <label className="block text-xs text-text-secondary mb-1">
            Link to Goal (auto-contribute when paid)
          </label>
          <select
            value={form.linkedGoalId ?? ''}
            onChange={(e) => set('linkedGoalId', e.target.value || undefined)}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary text-sm"
          >
            <option value="">No linked goal</option>
            {goals.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.name} ({goal.type === 'debt_payoff' ? 'Debt' : goal.type === 'savings' ? 'Savings' : 'Investment'})
              </option>
            ))}
          </select>
          <p className="text-[10px] text-text-secondary mt-1">
            When marked paid, amount auto-adds to this goal
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving || !form.label.trim() || form.amount <= 0}
          className="flex-1 py-2 bg-primary text-black font-medium rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2 bg-surface border border-border text-text-primary rounded-lg text-sm hover:bg-background transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
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
          {!goal.isOnTrack && <span className="text-warning">Behind target</span>}
        </div>
        <div className="h-2 bg-background rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${goal.isOnTrack ? 'bg-primary' : 'bg-warning'}`}
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
          ~{monthsRemaining} month{monthsRemaining !== 1 ? 's' : ''} to goal
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
