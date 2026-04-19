'use client';

import { useRef, useState } from 'react';
import { AmountDisplay } from '@/components/shared/amount-display';
import type { Expense } from '@/types';

export interface SuggestionTarget {
  id: string;
  name: string;
  type: 'goal' | 'investment' | 'savings_pot';
}

interface ExpenseItemProps {
  expense: Expense;
  onToggle: (id: string) => void;
  onEdit: (expense: Expense) => void;
  onDelete: (id: string) => void;
  /** When set, renders a dismissible "Link to [name]?" suggestion chip */
  suggestionTarget?: SuggestionTarget;
  onLinkSuggestion?: (expense: Expense, target: SuggestionTarget) => void;
}

const CATEGORY_ICONS: Record<string, string> = {
  housing: '🏠',
  transport: '🚗',
  family: '👨‍👩‍👧',
  business: '💼',
  living: '🛒',
  health: '❤️',
  education: '📚',
  savings: '💰',
  entertainment: '🎬',
  subscriptions: '📱',
  other: '📌',
};

const LINKED_TYPE_LABELS: Record<string, string> = {
  goal: 'Goal',
  investment: 'Investment',
  savings_pot: 'Pot',
};

export function ExpenseItem({ expense, onToggle, onEdit, onDelete, suggestionTarget, onLinkSuggestion }: ExpenseItemProps) {
  const isPaid = expense.status === 'paid';
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

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
    // Clamp to ±100px
    const clamped = Math.max(-100, Math.min(100, delta));
    setSwipeOffset(clamped);
    if (clamped < -SWIPE_THRESHOLD) setSwipeAction('delete');
    else if (clamped > SWIPE_THRESHOLD) setSwipeAction('edit');
    else setSwipeAction(null);
  }

  function handleTouchEnd() {
    if (swipeAction === 'delete') onDelete(expense.id);
    else if (swipeAction === 'edit') onEdit(expense);
    setSwipeOffset(0);
    setSwipeAction(null);
    touchStartX.current = null;
  }

  const isOverdue =
    expense.status === 'pending' &&
    expense.dueDate &&
    (expense.dueDate as unknown as { seconds: number }).seconds * 1000 < Date.now();

  return (
    <>
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

      {/* Main row */}
      <div
        className="relative bg-surface border border-border rounded-xl px-4 py-3 flex items-center gap-3 transition-transform"
        style={{ transform: `translateX(${swipeOffset}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Checkbox */}
        <button
          onClick={() => onToggle(expense.id)}
          aria-label={isPaid ? 'Mark as pending' : 'Mark as paid'}
          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
            isPaid
              ? 'bg-primary border-primary'
              : isOverdue
              ? 'border-danger'
              : 'border-border hover:border-primary'
          }`}
        >
          {isPaid && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12">
              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        {/* Category icon */}
        <span className="text-base shrink-0" aria-hidden="true">
          {CATEGORY_ICONS[expense.category] ?? '📌'}
        </span>

        {/* Label + meta */}
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm font-medium truncate ${
              isPaid ? 'line-through text-text-secondary' : 'text-text-primary'
            }`}
          >
            {expense.label}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {/* Account type badge */}
            <span className="text-xs text-text-secondary capitalize">{expense.accountType}</span>

            {/* Linked target badge */}
            {expense.linkedTo && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                {LINKED_TYPE_LABELS[expense.linkedTo.type] ?? expense.linkedTo.type}
              </span>
            )}

            {/* Overdue badge */}
            {isOverdue && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-danger/10 text-danger">
                Overdue
              </span>
            )}

            {/* Tags */}
            {expense.tags?.slice(0, 2).map((tag) => (
              <span key={tag} className="text-xs px-1.5 py-0.5 rounded-full bg-border text-text-secondary">
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Amount */}
        <AmountDisplay
          amount={expense.amount}
          size="sm"
          className={isPaid ? 'text-text-secondary' : isOverdue ? 'text-danger' : 'text-text-primary'}
        />

        {/* Desktop action buttons */}
        <div className="hidden sm:flex items-center gap-1 shrink-0">
          <button
            onClick={() => onEdit(expense)}
            aria-label="Edit expense"
            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-border transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16">
              <path d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            onClick={() => onDelete(expense.id)}
            aria-label="Delete expense"
            className="p-1.5 rounded-lg text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16">
              <path d="M3 4h10M6 4V2h4v2M5 4v9a1 1 0 001 1h4a1 1 0 001-1V4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    {/* Smart Link suggestion banner */}
    {suggestionTarget && !suggestionDismissed && !expense.linkedTo && (
      <div className="mt-1 mx-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20">
        <span className="text-xs text-primary flex-1">
          Link to <span className="font-semibold">{suggestionTarget.name}</span>?
        </span>
        <button
          onClick={() => onLinkSuggestion?.(expense, suggestionTarget)}
          className="text-xs font-medium text-primary hover:text-primary/80 transition-colors px-2 py-0.5 rounded-md bg-primary/10 hover:bg-primary/20"
        >
          Link
        </button>
        <button
          onClick={() => setSuggestionDismissed(true)}
          aria-label="Dismiss suggestion"
          className="text-text-secondary hover:text-text-primary transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 14 14">
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    )}
    </>
  );
}
