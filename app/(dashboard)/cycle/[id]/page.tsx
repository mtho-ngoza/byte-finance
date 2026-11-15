'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUserId } from '@/hooks/use-user-id';
import { useCycleItems } from '@/hooks/use-cycle-items';
import { useCycles } from '@/hooks/use-cycles';
import { useUserProfile } from '@/hooks/use-user-profile';
import { AmountDisplay } from '@/components/shared/amount-display';
import { ProgressBar } from '@/components/shared/progress-bar';
import type { Category } from '@/types';
import {
  CategorySection,
  IncomeEntry,
  SnapshotSection,
  formatCycleId,
} from './components/cycle-components';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_ORDER: Category[] = [
  'housing',
  'transport',
  'family',
  'health',
  'utilities',
  'education',
  'savings',
  'lifestyle',
  'business',
  'other',
];

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function CycleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const cycleId = params.id as string;

  const userId = useUserId();
  const { cycles, loading: cyclesLoading } = useCycles();
  const { profile } = useUserProfile();

  // Find cycle first so we can pass it to useCycleItems for date-based filtering
  const cycle = cycles.find((c) => c.id === cycleId);

  const { items, loading: itemsLoading, totalCommitted, totalPaid, updateStatus, updateAmount, addPayment, deletePayment, editPayment } =
    useCycleItems(cycleId, cycle);
  const loading = cyclesLoading || itemsLoading;
  const vatPercentage = profile?.preferences?.vatPercentage;

  const [itemSearch, setItemSearch] = useState('');

  // Group items by category (filtered by search)
  const itemsByCategory = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    const grouped = new Map<Category, typeof items>();
    for (const item of items) {
      if (q && !item.label.toLowerCase().includes(q) && !item.category.toLowerCase().includes(q)) continue;
      const list = grouped.get(item.category) ?? [];
      list.push(item);
      grouped.set(item.category, list);
    }
    return grouped;
  }, [items, itemSearch]);

  // Calculate stats
  const remaining = totalCommitted - totalPaid;
  const progressPercent = totalCommitted > 0 ? Math.round((totalPaid / totalCommitted) * 100) : 0;

  const paidCount = items.filter((i) => i.status === 'paid').length;
  const skippedCount = items.filter((i) => i.status === 'skipped').length;
  const unpaidCount = items.filter((i) => i.status === 'upcoming' || i.status === 'due').length;

  // Is this a past cycle?
  const isPastCycle = cycle?.status === 'closed';

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 bg-surface rounded" />
        <div className="h-32 bg-surface rounded-xl" />
        <div className="h-24 bg-surface rounded-xl" />
      </div>
    );
  }

  if (!cycle) {
    return (
      <div className="text-center py-12">
        <p className="text-text-secondary mb-4">Cycle not found</p>
        <Link href="/" className="text-primary hover:underline">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-surface transition-colors"
          aria-label="Go back"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-xl font-semibold text-text-primary">{formatCycleId(cycleId)}</h1>
          <p className="text-sm text-text-secondary">
            {cycle.status === 'active' ? 'Current Cycle' : 'Past Cycle'}
          </p>
        </div>
      </div>

      {/* Summary Card */}
      <div className="p-4 rounded-xl border border-border bg-surface">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm text-text-secondary">Progress</p>
            <p className="text-lg font-semibold text-text-primary">
              {paidCount} / {items.length} items
              {skippedCount > 0 && (
                <span className="text-sm text-text-secondary ml-1">({skippedCount} skipped)</span>
              )}
            </p>
          </div>
          <div className="text-right">
            {remaining < 0 ? (
              <>
                <p className="text-sm text-error">Over Budget</p>
                <AmountDisplay amount={Math.abs(remaining)} size="lg" className="text-error" />
              </>
            ) : (
              <>
                <p className="text-sm text-text-secondary">{isPastCycle ? 'Unpaid' : 'Remaining'}</p>
                <AmountDisplay amount={remaining} size="lg" />
                {isPastCycle && unpaidCount > 0 && (
                  <p className="text-xs text-error">{unpaidCount} item{unpaidCount !== 1 ? 's' : ''} not paid</p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-xs text-text-secondary mb-1">
            <span>
              Paid: <AmountDisplay amount={totalPaid} size="xs" className="inline" />
            </span>
            <span>{progressPercent > 100 ? '>100%' : `${progressPercent}%`}</span>
          </div>
          <ProgressBar
            value={progressPercent}
            color={totalPaid > totalCommitted ? 'bg-error' : 'bg-primary'}
            showOverflow
          />
          {totalPaid > totalCommitted && (
            <p className="text-xs text-error mt-1">
              +<AmountDisplay amount={totalPaid - totalCommitted} size="xs" className="inline" /> over budget
            </p>
          )}
        </div>
      </div>

      {/* Income Entry */}
      <IncomeEntry
        cycle={cycle}
        cycleId={cycleId}
        totalCommitted={totalCommitted}
        vatPercentage={vatPercentage}
      />

      {/* Snapshot */}
      <SnapshotSection cycleId={cycleId} />

      {/* Item search */}
      {items.length > 0 && (
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={itemSearch}
            onChange={(e) => setItemSearch(e.target.value)}
            placeholder="Search items..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-surface text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-primary"
          />
          {itemSearch.trim() && (
            <button onClick={() => setItemSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>
      )}

      {/* Items by Category */}
      {CATEGORY_ORDER.map((category) => {
        const categoryItems = itemsByCategory.get(category);
        if (!categoryItems || categoryItems.length === 0) return null;

        const categoryTotal = categoryItems.reduce((sum, i) => sum + i.amount, 0);
        const categoryPaid = categoryItems.reduce((sum, i) => {
          // Use totalPaidAmount for actual paid (supports partial payments)
          if (i.totalPaidAmount !== undefined) return sum + i.totalPaidAmount;
          if (i.status === 'paid') return sum + (i.actualAmount ?? i.amount);
          return sum;
        }, 0);

        return (
          <CategorySection
            key={category}
            category={category}
            items={categoryItems}
            totalAmount={categoryTotal}
            paidAmount={categoryPaid}
            cycleId={cycleId}
            userId={userId}
            updateStatus={updateStatus}
            updateAmount={updateAmount}
            addPayment={addPayment}
            deletePayment={deletePayment}
            editPayment={editPayment}
          />
        );
      })}

      {items.length === 0 && (
        <div className="text-center py-12 text-text-secondary">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-sm font-medium text-text-primary mb-1">No items yet</p>
          <p className="text-xs mb-4">Items are created from your commitments when a cycle starts, or you can add one-off items.</p>
          <Link
            href="/plan"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-background text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Manage Commitments
          </Link>
        </div>
      )}
    </div>
  );
}
