'use client';

import { use, useEffect, useState, useCallback } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserId } from '@/hooks/use-user-id';
import { usePayDay } from '@/hooks/use-pay-day';
import { useExpenses } from '@/hooks/use-expenses';
import { useAppStore } from '@/stores/app-store';
import { FolderForm } from '@/components/folders/folder-form';
import { AmountDisplay } from '@/components/shared/amount-display';
import { Skeleton } from '@/components/shared/skeleton';
import { ExpenseList } from '@/components/expenses/expense-list';
import { ExpenseSummary } from '@/components/expenses/expense-summary';
import { ExpenseForm } from '@/components/expenses/expense-form';
import type { Expense, Folder, UserProfile } from '@/types';

interface FolderDetailPageProps {
  params: Promise<{ id: string }>;
}

// ─── Confetti overlay ────────────────────────────────────────────────────────

function ConfettiOverlay({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 2500);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div
      className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center"
      aria-hidden="true"
    >
      <div className="text-center animate-bounce">
        <span className="text-6xl">🎉</span>
        <p className="mt-2 text-lg font-semibold text-primary">All paid!</p>
      </div>
      {/* Simple CSS confetti dots */}
      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        .confetti-dot {
          position: fixed;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          animation: confetti-fall 2.5s ease-in forwards;
        }
      `}</style>
      {Array.from({ length: 20 }).map((_, i) => (
        <div
          key={i}
          className="confetti-dot"
          style={{
            left: `${Math.random() * 100}%`,
            top: '-10px',
            backgroundColor: ['#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#a855f7'][i % 5],
            animationDelay: `${Math.random() * 0.8}s`,
            animationDuration: `${1.5 + Math.random()}s`,
          }}
        />
      ))}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function FolderDetailPage({ params }: FolderDetailPageProps) {
  const { id } = use(params);
  const userId = useUserId();

  const [folder, setFolder] = useState<Folder | null>(null);
  const [folderLoading, setFolderLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  // Expense form state
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  // Celebratory animation
  const [showConfetti, setShowConfetti] = useState(false);
  const prevAllPaidRef = useState(false);

  // User prefs for pay day
  const [prefs, setPrefs] = useState<UserProfile['preferences'] | undefined>(undefined);

  // Zustand store
  const { activeFilter, setActiveFilter, setOptimisticExpense, removeOptimisticExpense } = useAppStore();

  // Load user prefs
  useEffect(() => {
    if (!userId) return;
    const userRef = doc(db, `users/${userId}`);
    return onSnapshot(userRef, (snap) => {
      if (snap.exists()) setPrefs((snap.data() as UserProfile).preferences);
    });
  }, [userId]);

  // Load folder
  useEffect(() => {
    if (!userId) return;
    const ref = doc(db, `users/${userId}/folders/${id}`);
    return onSnapshot(ref, (snap) => {
      if (snap.exists()) setFolder({ id: snap.id, ...snap.data() } as Folder);
      setFolderLoading(false);
    });
  }, [userId, id]);

  const { daysUntilPayDay } = usePayDay(prefs);
  const { expenses, loading: expensesLoading } = useExpenses(id);

  // Filter expenses by account type
  const filteredExpenses =
    activeFilter === 'all' ? expenses : expenses.filter((e) => e.accountType === activeFilter);

  // Detect all-paid → show confetti
  useEffect(() => {
    if (expenses.length === 0) return;
    const allPaid = expenses.every((e) => e.status === 'paid');
    const wasPaid = prevAllPaidRef[0];
    if (allPaid && !wasPaid) {
      setShowConfetti(true);
    }
    prevAllPaidRef[0] = allPaid;
  }, [expenses, prevAllPaidRef]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleToggle = useCallback(
    async (expenseId: string) => {
      const expense = expenses.find((e) => e.id === expenseId);
      if (!expense) return;

      const nowIso = new Date().toISOString();
      const nowTs = { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 };
      const markingPaid = expense.status === 'pending';

      const optimisticUpdate: Expense = markingPaid
        ? { ...expense, status: 'paid', paidDate: nowTs as unknown as Expense['paidDate'] }
        : { ...expense, status: 'pending', paidDate: undefined };

      // Optimistic update
      setOptimisticExpense(expenseId, optimisticUpdate);

      try {
        const patch = markingPaid
          ? { status: 'paid', paidDate: nowIso }
          : { status: 'pending', paidDate: null };

        await fetch(`/api/expenses/${expenseId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });

        // If expense has a linked target, record or reverse the contribution
        if (expense.linkedTo) {
          await fetch('/api/smart-link/contribute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              expenseId,
              action: markingPaid ? 'record' : 'reverse',
            }),
          });
        }

        // Haptic feedback on mobile
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate(30);
        }
      } finally {
        removeOptimisticExpense(expenseId);
      }
    },
    [expenses, setOptimisticExpense, removeOptimisticExpense],
  );

  const handleDelete = useCallback(async (expenseId: string) => {
    if (!confirm('Delete this expense?')) return;
    await fetch(`/api/expenses/${expenseId}`, { method: 'DELETE' });
  }, []);

  const handleEdit = useCallback((expense: Expense) => {
    setEditingExpense(expense);
    setShowForm(true);
  }, []);

  const handleFormSubmit = useCallback(
    async (data: Partial<Expense>) => {
      if (editingExpense) {
        await fetch(`/api/expenses/${editingExpense.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
      } else {
        const maxOrder = expenses.reduce((m, e) => Math.max(m, e.sortOrder), -1);
        await fetch('/api/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...data, folderId: id, sortOrder: maxOrder + 1 }),
        });
      }
      setShowForm(false);
      setEditingExpense(null);
    },
    [editingExpense, expenses, id],
  );

  const handleReorder = useCallback(
    async (reordered: Expense[]) => {
      // Persist new sortOrder values via bulk API
      const operations = reordered.map((e) => ({
        type: 'update' as const,
        id: e.id,
        data: { sortOrder: e.sortOrder },
      }));
      await fetch('/api/expenses/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operations }),
      });
    },
    [],
  );

  const handleFolderUpdate = async (values: {
    name: string;
    type: Folder['type'];
    icon?: string;
    color?: string;
    period?: { month: number; year: number };
    income?: { amount: number; source?: string; verified: boolean };
  }) => {
    await fetch(`/api/folders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    setEditing(false);
  };

  const handleArchive = async () => {
    if (!confirm('Archive this folder? It will be hidden but not deleted.')) return;
    await fetch(`/api/folders/${id}`, { method: 'DELETE' });
    window.location.href = '/folders';
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (folderLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    );
  }

  if (!folder) {
    return <p className="text-text-secondary">Folder not found.</p>;
  }

  return (
    <div>
      {showConfetti && <ConfettiOverlay onDone={() => setShowConfetti(false)} />}

      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <div className="flex items-center gap-2">
            {folder.icon && <span className="text-2xl">{folder.icon}</span>}
            <h1 className="text-xl font-semibold text-text-primary">{folder.name}</h1>
          </div>
          <p className="text-sm text-text-secondary capitalize mt-0.5">{folder.type}</p>
        </div>

        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setEditing(!editing)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            {editing ? 'Cancel' : 'Edit'}
          </button>
          <button
            onClick={handleArchive}
            className="rounded-lg border border-danger/40 px-3 py-1.5 text-sm text-danger hover:bg-danger/10 transition-colors"
          >
            Archive
          </button>
        </div>
      </div>

      {/* Edit folder form */}
      {editing && (
        <div className="mb-6 rounded-xl border border-border bg-surface p-4">
          <FolderForm folder={folder} onSubmit={handleFolderUpdate} onCancel={() => setEditing(false)} />
        </div>
      )}

      {/* Days until pay day */}
      {folder.type === 'monthly' && daysUntilPayDay !== null && (
        <div className="mb-4 rounded-xl border border-border bg-surface p-4 flex items-center justify-between">
          <span className="text-sm text-text-secondary">Days until pay day</span>
          <span
            className={`font-mono font-semibold text-lg ${
              daysUntilPayDay <= 3 ? 'text-warning' : 'text-primary'
            }`}
          >
            {daysUntilPayDay > 0 ? daysUntilPayDay : daysUntilPayDay === 0 ? 'Today!' : 'Passed'}
          </span>
        </div>
      )}

      {/* Income card */}
      {folder.income && (
        <div className="mb-4 rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-text-secondary mb-0.5">
                Income{folder.income.source ? ` · ${folder.income.source}` : ''}
              </p>
              <AmountDisplay amount={folder.income.amount} size="lg" />
            </div>
            <span
              className={`text-xs px-2 py-1 rounded-full ${
                folder.income.verified
                  ? 'bg-primary/10 text-primary'
                  : 'bg-warning/10 text-warning'
              }`}
            >
              {folder.income.verified ? 'Verified' : 'Unverified'}
            </span>
          </div>
        </div>
      )}

      {/* Summary */}
      {!expensesLoading && expenses.length > 0 && (
        <div className="mb-4">
          <ExpenseSummary expenses={expenses} folder={folder} />
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 bg-surface rounded-lg p-1 border border-border">
        {(['all', 'personal', 'business'] as const).map((filter) => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className={`flex-1 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
              activeFilter === filter
                ? 'bg-primary text-white'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      {/* Expense list */}
      <ExpenseList
        expenses={filteredExpenses}
        loading={expensesLoading}
        onToggle={handleToggle}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onReorder={handleReorder}
      />

      {/* Add expense button */}
      <button
        onClick={() => { setEditingExpense(null); setShowForm(true); }}
        className="mt-4 w-full py-3 rounded-xl border border-dashed border-primary/40 text-primary text-sm font-medium hover:bg-primary/5 transition-colors flex items-center justify-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16">
          <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        Add Expense
      </button>

      {/* Add/Edit form bottom sheet */}
      {showForm && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => { setShowForm(false); setEditingExpense(null); }}
          />
          {/* Sheet */}
          <div className="relative z-10 w-full sm:max-w-md bg-surface rounded-t-2xl sm:rounded-2xl border border-border p-6 max-h-[90vh] overflow-y-auto">
            <ExpenseForm
              folderId={id}
              expense={editingExpense}
              onSubmit={handleFormSubmit}
              onCancel={() => { setShowForm(false); setEditingExpense(null); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
