'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useCycles } from '@/hooks/use-cycles';
import { useCycleItems } from '@/hooks/use-cycle-items';
import { useGoals } from '@/hooks/use-goals';
import { useUserProfile } from '@/hooks/use-user-profile';
import { usePayDay } from '@/hooks/use-pay-day';
import { useAppStore } from '@/stores/app-store';
import { FilterBar } from '@/components/shared/filter-bar';
import { AmountDisplay } from '@/components/shared/amount-display';
import type { CycleItem, CycleItemStatus, Goal } from '@/types';

export default function DashboardPage() {
  const { cycles, loading: cyclesLoading } = useCycles();
  const { activeGoals, loading: goalsLoading } = useGoals();
  const { profile } = useUserProfile();
  const { daysUntilPayDay } = usePayDay(profile?.preferences);
  const { selectedYear, accountFilter } = useAppStore();

  // Filter cycles by selected year
  const yearCycles = cycles.filter((c) => {
    const cycleYear = parseInt(c.id.split('-')[0], 10);
    return cycleYear === selectedYear;
  });

  // Get the most recent cycle for the selected year (or active one)
  const currentCycle = yearCycles.find((c) => c.status === 'active') ?? yearCycles[0] ?? null;

  const {
    items,
    loading: itemsLoading,
    totalCommitted,
    totalPaid,
    updateStatus,
  } = useCycleItems(currentCycle?.id ?? null);

  // Available years from cycles
  const availableYears = [...new Set(cycles.map((c) => parseInt(c.id.split('-')[0], 10)))].sort(
    (a, b) => b - a
  );

  // Calculate separate totals for personal/business
  const personalTotal = items
    .filter((i) => i.accountType === 'personal')
    .reduce((sum, i) => sum + i.amount, 0);
  const businessTotal = items
    .filter((i) => i.accountType === 'business')
    .reduce((sum, i) => sum + i.amount, 0);
  const personalPaid = items
    .filter((i) => i.accountType === 'personal' && i.status === 'paid')
    .reduce((sum, i) => sum + i.amount, 0);
  const businessPaid = items
    .filter((i) => i.accountType === 'business' && i.status === 'paid')
    .reduce((sum, i) => sum + i.amount, 0);

  const loading = cyclesLoading || itemsLoading || goalsLoading;

  // Group items by status
  const dueItems = items.filter((i) => i.status === 'due');
  const upcomingItems = items.filter((i) => i.status === 'upcoming');
  const paidItems = items.filter((i) => i.status === 'paid');
  const skippedItems = items.filter((i) => i.status === 'skipped');

  const remaining = totalCommitted - totalPaid;
  const progressPercent = totalCommitted > 0 ? Math.round((totalPaid / totalCommitted) * 100) : 0;

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 bg-surface rounded" />
        <div className="h-32 bg-surface rounded-xl" />
        <div className="h-24 bg-surface rounded-xl" />
        <div className="h-24 bg-surface rounded-xl" />
      </div>
    );
  }

  if (!currentCycle) {
    return (
      <div className="space-y-6">
        <FilterBar availableYears={availableYears.length > 0 ? availableYears : undefined} />
        <div className="text-center py-12 text-text-secondary">
          <p className="mb-2">No cycle found for {selectedYear}.</p>
          <p className="text-sm">Create a new cycle to start tracking.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with filters */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Dashboard</h1>
          {daysUntilPayDay !== null && (
            <p className="text-sm text-text-secondary">
              {daysUntilPayDay > 0
                ? `${daysUntilPayDay} day${daysUntilPayDay !== 1 ? 's' : ''} until pay day`
                : daysUntilPayDay === 0
                ? 'Pay day is today'
                : `${Math.abs(daysUntilPayDay)} day${Math.abs(daysUntilPayDay) !== 1 ? 's' : ''} since pay day`}
            </p>
          )}
        </div>
        <FilterBar availableYears={availableYears.length > 0 ? availableYears : undefined} />
      </div>

      {/* Cycle Summary */}
      <div className="p-4 rounded-xl border border-border bg-surface">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm text-text-secondary">Current Cycle</h2>
            <p className="text-lg font-semibold text-text-primary">{formatCycleId(currentCycle.id)}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-text-secondary">Remaining</p>
            <AmountDisplay amount={remaining} size="lg" />
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-3">
          <div className="flex justify-between text-xs text-text-secondary mb-1">
            <span>Paid: <AmountDisplay amount={totalPaid} size="xs" className="inline" /></span>
            <span>{progressPercent}%</span>
          </div>
          <div className="h-2 bg-background rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Account breakdown */}
        {accountFilter === 'all' && (personalTotal > 0 || businessTotal > 0) && (
          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border">
            <div className="text-center">
              <p className="text-xs text-text-secondary mb-1">Personal</p>
              <p className="text-sm font-medium text-text-primary">
                <AmountDisplay amount={personalPaid} size="sm" className="inline" />
                <span className="text-text-secondary"> / </span>
                <AmountDisplay amount={personalTotal} size="sm" className="inline text-text-secondary" />
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-text-secondary mb-1">Business</p>
              <p className="text-sm font-medium text-text-primary">
                <AmountDisplay amount={businessPaid} size="sm" className="inline" />
                <span className="text-text-secondary"> / </span>
                <AmountDisplay amount={businessTotal} size="sm" className="inline text-text-secondary" />
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Goals Summary */}
      {activeGoals.length > 0 && (
        <div className="p-4 rounded-xl border border-border bg-surface">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-text-primary">Goals</h2>
            <Link
              href="/goals"
              className="text-xs text-primary hover:text-primary/80 transition-colors"
            >
              View all
            </Link>
          </div>
          <div className="space-y-3">
            {activeGoals.slice(0, 3).map((goal) => (
              <GoalSummaryRow key={goal.id} goal={goal} />
            ))}
          </div>
        </div>
      )}

      {/* Due Items - Needs attention */}
      {dueItems.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-warning mb-2 flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 4v4M8 10v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Due ({dueItems.length})
          </h3>
          <div className="space-y-2">
            {dueItems.map((item) => (
              <CycleItemRow key={item.id} item={item} onStatusChange={updateStatus} />
            ))}
          </div>
        </section>
      )}

      {/* Upcoming Items */}
      {upcomingItems.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-text-secondary mb-2">
            Upcoming ({upcomingItems.length})
          </h3>
          <div className="space-y-2">
            {upcomingItems.map((item) => (
              <CycleItemRow key={item.id} item={item} onStatusChange={updateStatus} />
            ))}
          </div>
        </section>
      )}

      {/* Paid Items */}
      {paidItems.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-text-secondary mb-2 flex items-center gap-1.5">
            <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 16 16">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
              <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Paid ({paidItems.length})
          </h3>
          <div className="space-y-2">
            {paidItems.map((item) => (
              <CycleItemRow key={item.id} item={item} onStatusChange={updateStatus} />
            ))}
          </div>
        </section>
      )}

      {/* Skipped Items */}
      {skippedItems.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-text-secondary mb-2">
            Skipped ({skippedItems.length})
          </h3>
          <div className="space-y-2 opacity-60">
            {skippedItems.map((item) => (
              <CycleItemRow key={item.id} item={item} onStatusChange={updateStatus} />
            ))}
          </div>
        </section>
      )}

      {items.length === 0 && (
        <div className="text-center py-8 text-text-secondary">
          <p>No items in this cycle yet.</p>
        </div>
      )}

      {/* Floating Add Button */}
      <AddItemButton cycleId={currentCycle.id} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCycleId(id: string): string {
  const [year, month] = id.split('-');
  const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1);
  return date.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// GoalSummaryRow Component
// ---------------------------------------------------------------------------

interface GoalSummaryRowProps {
  goal: Goal;
}

function GoalSummaryRow({ goal }: GoalSummaryRowProps) {
  const progressPercent = goal.targetAmount > 0
    ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100))
    : 0;

  const typeIcon = {
    savings: '💰',
    debt_payoff: '📉',
    investment: '📈',
  }[goal.type];

  return (
    <div className="flex items-center gap-3">
      <span className="text-base">{typeIcon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-medium text-text-primary truncate">{goal.name}</p>
          <span className="text-xs text-text-secondary ml-2">{progressPercent}%</span>
        </div>
        <div className="h-1.5 bg-background rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              goal.isOnTrack ? 'bg-primary' : 'bg-warning'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <AmountDisplay amount={goal.currentAmount} size="xs" className="text-text-secondary" />
          <AmountDisplay amount={goal.targetAmount} size="xs" className="text-text-secondary" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CycleItemRow Component
// ---------------------------------------------------------------------------

interface CycleItemRowProps {
  item: CycleItem;
  onStatusChange: (id: string, status: CycleItemStatus) => Promise<void>;
}

function CycleItemRow({ item, onStatusChange }: CycleItemRowProps) {
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    setLoading(true);
    try {
      const newStatus: CycleItemStatus = item.status === 'paid' ? 'upcoming' : 'paid';
      await onStatusChange(item.id, newStatus);
    } finally {
      setLoading(false);
    }
  };

  const isPaid = item.status === 'paid';
  const isDue = item.status === 'due';

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
        isDue
          ? 'border-warning/50 bg-warning/5'
          : 'border-border bg-surface'
      }`}
    >
      {/* Toggle button */}
      <button
        onClick={handleToggle}
        disabled={loading || item.status === 'skipped'}
        className={`w-5 h-5 rounded border-2 shrink-0 flex items-center justify-center transition-colors disabled:opacity-50 ${
          isPaid
            ? 'bg-primary border-primary'
            : 'bg-transparent border-border hover:border-primary'
        }`}
        aria-label={isPaid ? 'Mark as unpaid' : 'Mark as paid'}
      >
        {isPaid && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="black" strokeWidth="2">
            <polyline points="1.5,5 4,7.5 8.5,2.5" />
          </svg>
        )}
      </button>

      {/* Label + category */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${isPaid ? 'text-text-secondary line-through' : 'text-text-primary'}`}>
          {item.label}
        </p>
        <p className="text-xs text-text-secondary capitalize">
          {item.category}
          {item.accountType === 'business' && (
            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[10px] uppercase">
              Biz
            </span>
          )}
          {item.linkedGoalId && (
            <span className="ml-1.5 text-primary">linked</span>
          )}
        </p>
      </div>

      {/* Amount */}
      <AmountDisplay
        amount={item.amount}
        size="sm"
        className={isPaid ? 'opacity-50' : ''}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// AddItemButton Component (Floating)
// ---------------------------------------------------------------------------

interface AddItemButtonProps {
  cycleId: string;
}

function AddItemButton({ cycleId }: AddItemButtonProps) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);

    const formData = new FormData(e.currentTarget);
    const body = {
      cycleId,
      label: formData.get('label'),
      amount: Number(formData.get('amount')) * 100, // Convert to cents
      category: formData.get('category'),
      accountType: formData.get('accountType'),
    };

    try {
      const res = await fetch('/api/cycle-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setShowForm(false);
        (e.target as HTMLFormElement).reset();
      }
    } finally {
      setSaving(false);
    }
  };

  if (showForm) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
        <div className="bg-surface border border-border rounded-xl w-full max-w-md p-4 space-y-4">
          <h3 className="text-base font-semibold text-text-primary">Add One-off Item</h3>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Label</label>
              <input
                name="label"
                required
                placeholder="e.g., Doctor visit"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Amount (R)</label>
              <input
                name="amount"
                type="number"
                required
                min="0"
                step="0.01"
                placeholder="0.00"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-secondary mb-1">Category</label>
                <select
                  name="category"
                  required
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm"
                >
                  <option value="housing">Housing</option>
                  <option value="transport">Transport</option>
                  <option value="family">Family</option>
                  <option value="utilities">Utilities</option>
                  <option value="health">Health</option>
                  <option value="education">Education</option>
                  <option value="savings">Savings</option>
                  <option value="lifestyle">Lifestyle</option>
                  <option value="business">Business</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Account</label>
                <select
                  name="accountType"
                  required
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm"
                >
                  <option value="personal">Personal</option>
                  <option value="business">Business</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 py-2 rounded-lg border border-border text-text-secondary text-sm hover:bg-background transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-2 rounded-lg bg-primary text-background font-medium text-sm disabled:opacity-50"
              >
                {saving ? 'Adding...' : 'Add Item'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setShowForm(true)}
      className="fixed bottom-20 right-4 w-14 h-14 rounded-full bg-primary text-background shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors z-40"
      aria-label="Add one-off item"
    >
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
      </svg>
    </button>
  );
}
