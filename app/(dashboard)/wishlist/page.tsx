'use client';

import { useState, useMemo, useEffect } from 'react';
import { useWishlist } from '@/hooks/use-wishlist';
import { useGoals } from '@/hooks/use-goals';
import { AmountDisplay } from '@/components/shared/amount-display';
import { CurrencyInput } from '@/components/shared/currency-input';
import { useToast } from '@/components/shared/toast';
import type { WishlistItem, Goal } from '@/types';

// ---------------------------------------------------------------------------
// Main Wishlist Page
// ---------------------------------------------------------------------------

export default function WishlistPage() {
  const {
    items,
    loading,
    getItemsForYear,
    getYearStats,
    getYearsWithItems,
    createItem,
    updateItem,
    deleteItem,
    completeItem,
    abandonItem,
    carryForward,
    syncProgress,
  } = useWishlist();
  const { goals } = useGoals();
  const { toast, confirm } = useToast();

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<WishlistItem | null>(null);

  // Get years for the selector (current + any years with items)
  const availableYears = useMemo(() => {
    const years = new Set([currentYear, currentYear - 1, currentYear + 1]);
    getYearsWithItems().forEach((y) => years.add(y));
    return Array.from(years).sort((a, b) => b - a);
  }, [currentYear, getYearsWithItems]);

  // Sync progress on mount
  useEffect(() => {
    syncProgress().catch(console.error);
  }, [syncProgress]);

  const yearItems = getItemsForYear(selectedYear);
  const yearStats = getYearStats(selectedYear);

  // Group items by status
  const activeItems = yearItems.filter((i) => i.status === 'active');
  const completedItems = yearItems.filter((i) => i.status === 'completed');
  const otherItems = yearItems.filter((i) => i.status === 'abandoned' || i.status === 'carried-forward');

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 bg-surface rounded" />
        <div className="h-24 bg-surface rounded-xl" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-surface rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Wishlist</h1>
          <p className="text-sm text-text-secondary">Your financial priorities & goals</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="w-10 h-10 rounded-full bg-primary text-background flex items-center justify-center hover:bg-primary/90 transition-colors"
          aria-label="Add item"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Year Selector */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {availableYears.map((year) => (
          <button
            key={year}
            onClick={() => setSelectedYear(year)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              selectedYear === year
                ? 'bg-primary text-background'
                : 'bg-surface border border-border text-text-secondary hover:border-primary'
            }`}
          >
            {year}
          </button>
        ))}
      </div>

      {/* Year Summary Card */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-text-primary">{selectedYear} Summary</h2>
          {yearStats.total > 0 && (
            <span className="text-2xl font-bold text-primary">{yearStats.completionRate}%</span>
          )}
        </div>

        {yearStats.total > 0 ? (
          <>
            {/* Progress bar */}
            <div className="h-3 bg-background rounded-full overflow-hidden mb-3">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${yearStats.completionRate}%` }}
              />
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <p className="text-lg font-semibold text-text-primary">{yearStats.total}</p>
                <p className="text-[10px] text-text-secondary uppercase">Total</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-primary">{yearStats.completed}</p>
                <p className="text-[10px] text-text-secondary uppercase">Done</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-warning">{yearStats.active}</p>
                <p className="text-[10px] text-text-secondary uppercase">Active</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-text-secondary">{yearStats.abandoned + yearStats.carriedForward}</p>
                <p className="text-[10px] text-text-secondary uppercase">Other</p>
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-text-secondary text-center py-4">
            No items for {selectedYear}. Add your first priority!
          </p>
        )}
      </div>

      {/* Active Items */}
      {activeItems.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-text-secondary mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-warning" />
            In Progress ({activeItems.length})
          </h3>
          <div className="space-y-2">
            {activeItems.map((item) => (
              <WishlistItemCard
                key={item.id}
                item={item}
                goals={goals}
                onEdit={() => setEditingItem(item)}
                onComplete={() => handleComplete(item)}
                onAbandon={() => handleAbandon(item)}
                onCarryForward={() => handleCarryForward(item)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Completed Items */}
      {completedItems.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-text-secondary mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary" />
            Completed ({completedItems.length})
          </h3>
          <div className="space-y-2">
            {completedItems.map((item) => (
              <WishlistItemCard
                key={item.id}
                item={item}
                goals={goals}
                onEdit={() => setEditingItem(item)}
                compact
              />
            ))}
          </div>
        </section>
      )}

      {/* Other Items (Abandoned/Carried Forward) */}
      {otherItems.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-text-secondary mb-3">
            Other ({otherItems.length})
          </h3>
          <div className="space-y-2">
            {otherItems.map((item) => (
              <WishlistItemCard
                key={item.id}
                item={item}
                goals={goals}
                onEdit={() => setEditingItem(item)}
                compact
              />
            ))}
          </div>
        </section>
      )}

      {/* Empty State */}
      {yearItems.length === 0 && (
        <div className="text-center py-12">
          <p className="text-4xl mb-3">🎯</p>
          <p className="text-sm font-medium text-text-primary mb-1">No priorities set for {selectedYear}</p>
          <p className="text-xs text-text-secondary mb-4">What do you want to achieve this year?</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-primary text-background rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Add First Priority
          </button>
        </div>
      )}

      {/* Year Comparison (show past years) */}
      {availableYears.filter((y) => y < currentYear).length > 0 && (
        <section className="pt-4 border-t border-border">
          <h3 className="text-sm font-medium text-text-secondary mb-3">Past Years</h3>
          <div className="space-y-2">
            {availableYears
              .filter((y) => y < currentYear)
              .slice(0, 3)
              .map((year) => {
                const stats = getYearStats(year);
                if (stats.total === 0) return null;
                return (
                  <button
                    key={year}
                    onClick={() => setSelectedYear(year)}
                    className="w-full flex items-center justify-between p-3 rounded-lg bg-surface border border-border hover:border-primary transition-colors"
                  >
                    <span className="text-sm font-medium text-text-primary">{year}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-24 h-2 bg-background rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${stats.completionRate}%` }}
                        />
                      </div>
                      <span className="text-sm text-text-secondary">
                        {stats.completed}/{stats.total}
                      </span>
                    </div>
                  </button>
                );
              })}
          </div>
        </section>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <AddEditModal
          goals={goals}
          targetYear={selectedYear}
          onClose={() => setShowAddModal(false)}
          onSave={async (data) => {
            await createItem(data);
            setShowAddModal(false);
            toast('Priority added', 'success');
          }}
        />
      )}

      {/* Edit Modal */}
      {editingItem && (
        <AddEditModal
          item={editingItem}
          goals={goals}
          targetYear={selectedYear}
          onClose={() => setEditingItem(null)}
          onSave={async (data) => {
            await updateItem(editingItem.id, data);
            setEditingItem(null);
            toast('Priority updated', 'success');
          }}
          onDelete={async () => {
            confirm('This will permanently delete this priority.', async () => {
              await deleteItem(editingItem.id);
              setEditingItem(null);
              toast('Priority deleted', 'success');
            }, { title: 'Delete Priority', confirmLabel: 'Delete', danger: true });
          }}
        />
      )}
    </div>
  );

  async function handleComplete(item: WishlistItem) {
    try {
      await completeItem(item.id);
      toast('Marked as completed!', 'success');
    } catch (err) {
      toast('Failed to update', 'error');
    }
  }

  async function handleAbandon(item: WishlistItem) {
    confirm('This priority will be marked as abandoned.', async () => {
      try {
        await abandonItem(item.id);
        toast('Marked as abandoned', 'info');
      } catch (err) {
        toast('Failed to update', 'error');
      }
    }, { title: 'Abandon Priority', confirmLabel: 'Abandon' });
  }

  async function handleCarryForward(item: WishlistItem) {
    try {
      await carryForward(item.id, selectedYear);
      toast(`Carried forward to ${selectedYear + 1}`, 'success');
    } catch (err) {
      toast('Failed to carry forward', 'error');
    }
  }
}

// ---------------------------------------------------------------------------
// WishlistItemCard Component
// ---------------------------------------------------------------------------

interface WishlistItemCardProps {
  item: WishlistItem;
  goals: Goal[];
  onEdit: () => void;
  onComplete?: () => void;
  onAbandon?: () => void;
  onCarryForward?: () => void;
  compact?: boolean;
}

function WishlistItemCard({
  item,
  goals,
  onEdit,
  onComplete,
  onAbandon,
  onCarryForward,
  compact,
}: WishlistItemCardProps) {
  const linkedGoal = item.linkedGoalId ? goals.find((g) => g.id === item.linkedGoalId) : null;
  const isCompleted = item.status === 'completed';
  const isAbandoned = item.status === 'abandoned';
  const isCarried = item.status === 'carried-forward';

  return (
    <div
      className={`rounded-xl border bg-surface p-4 transition-colors ${
        isCompleted ? 'border-primary/30 bg-primary/5' : isAbandoned ? 'border-border opacity-60' : 'border-border'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Progress circle or status icon */}
        <div className="flex-shrink-0">
          {isCompleted ? (
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          ) : isAbandoned ? (
            <div className="w-10 h-10 rounded-full bg-text-secondary/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          ) : isCarried ? (
            <div className="w-10 h-10 rounded-full bg-warning/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </div>
          ) : (
            <div className="relative w-10 h-10">
              <svg className="w-10 h-10 -rotate-90">
                <circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" strokeWidth="3" className="text-background" />
                <circle
                  cx="20"
                  cy="20"
                  r="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeDasharray={`${item.progress} 100`}
                  strokeLinecap="round"
                  className="text-primary"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-text-primary">
                {item.progress}%
              </span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className={`text-sm font-medium ${isCompleted ? 'text-primary' : isAbandoned ? 'text-text-secondary line-through' : 'text-text-primary'}`}>
                {item.title}
              </h4>
              {item.description && !compact && (
                <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">{item.description}</p>
              )}
            </div>
            <button
              onClick={onEdit}
              className="p-1.5 rounded-lg hover:bg-background transition-colors"
              aria-label="Edit"
            >
              <svg className="w-4 h-4 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          </div>

          {/* Meta info */}
          <div className="flex items-center gap-3 mt-2 text-xs text-text-secondary">
            <span className={`px-1.5 py-0.5 rounded ${item.type === 'long-term' ? 'bg-purple-500/10 text-purple-400' : 'bg-blue-500/10 text-blue-400'}`}>
              {item.type === 'long-term' ? 'Long-term' : 'Short-term'}
            </span>
            {linkedGoal && (
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                </svg>
                {linkedGoal.name}
              </span>
            )}
            {item.targetAmount && (
              <AmountDisplay amount={item.targetAmount} size="xs" />
            )}
            {item.carriedFromYear && (
              <span className="text-warning">from {item.carriedFromYear}</span>
            )}
          </div>

          {/* Actions for active items */}
          {!compact && item.status === 'active' && (
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={onComplete}
                className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
              >
                Complete
              </button>
              <button
                onClick={onCarryForward}
                className="px-3 py-1.5 rounded-lg bg-background text-text-secondary text-xs hover:text-text-primary transition-colors"
              >
                Carry Forward
              </button>
              <button
                onClick={onAbandon}
                className="px-3 py-1.5 rounded-lg text-text-secondary text-xs hover:text-danger transition-colors"
              >
                Abandon
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AddEditModal Component
// ---------------------------------------------------------------------------

interface AddEditModalProps {
  item?: WishlistItem;
  goals: Goal[];
  targetYear: number;
  onClose: () => void;
  onSave: (data: {
    title: string;
    description?: string;
    type: 'short-term' | 'long-term';
    targetYear: number;
    targetYearEnd?: number;
    linkedGoalId?: string;
    targetAmount?: number;
    priority?: number;
  }) => Promise<void>;
  onDelete?: () => void;
}

function AddEditModal({ item, goals, targetYear, onClose, onSave, onDelete }: AddEditModalProps) {
  const [title, setTitle] = useState(item?.title || '');
  const [description, setDescription] = useState(item?.description || '');
  const [type, setType] = useState<'short-term' | 'long-term'>(item?.type || 'short-term');
  const [year, setYear] = useState(item?.targetYear || targetYear);
  const [yearEnd, setYearEnd] = useState(item?.targetYearEnd || 0);
  const [linkedGoalId, setLinkedGoalId] = useState(item?.linkedGoalId || '');
  const [amount, setAmount] = useState(item?.targetAmount || 0);
  const [saving, setSaving] = useState(false);

  const activeGoals = goals.filter((g) => g.status === 'active');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || undefined,
        type,
        targetYear: year,
        targetYearEnd: type === 'long-term' && yearEnd > year ? yearEnd : undefined,
        linkedGoalId: linkedGoalId || undefined,
        targetAmount: amount > 0 ? amount : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-surface w-full sm:max-w-md sm:rounded-xl rounded-t-xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-primary">
              {item ? 'Edit Priority' : 'Add Priority'}
            </h2>
            <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-background">
              <svg className="w-5 h-5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs text-text-secondary mb-1">What do you want to achieve?</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Pay off car loan"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-primary text-sm"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs text-text-secondary mb-1">Why does this matter? (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Motivation or context..."
              rows={2}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-primary text-sm resize-none"
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs text-text-secondary mb-2">Timeframe</label>
            <div className="grid grid-cols-2 gap-2">
              {(['short-term', 'long-term'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`py-2.5 px-3 rounded-lg border text-sm transition-colors ${
                    type === t
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-text-secondary hover:border-primary/50'
                  }`}
                >
                  {t === 'short-term' ? '📅 This Year' : '🎯 Multi-Year'}
                </button>
              ))}
            </div>
          </div>

          {/* Year selection for long-term */}
          {type === 'long-term' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-secondary mb-1">Start Year</label>
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-primary"
                >
                  {[targetYear - 1, targetYear, targetYear + 1, targetYear + 2].map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Target Year</label>
                <select
                  value={yearEnd || year + 1}
                  onChange={(e) => setYearEnd(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-primary"
                >
                  {[year + 1, year + 2, year + 3, year + 4, year + 5].map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Link to Goal */}
          <div>
            <label className="block text-xs text-text-secondary mb-1">Link to existing goal (optional)</label>
            <select
              value={linkedGoalId}
              onChange={(e) => setLinkedGoalId(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-primary"
            >
              <option value="">No link - track manually</option>
              {activeGoals.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.name} ({Math.round((goal.currentAmount / goal.targetAmount) * 100)}%)
                </option>
              ))}
            </select>
            <p className="text-[10px] text-text-secondary mt-1">
              Linking auto-syncs progress when your goal updates
            </p>
          </div>

          {/* Target Amount (if not linked) */}
          {!linkedGoalId && (
            <div>
              <label className="block text-xs text-text-secondary mb-1">Target amount (optional)</label>
              <CurrencyInput value={amount} onChange={setAmount} />
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            {item && onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="px-4 py-2.5 border border-danger/40 text-danger rounded-lg text-sm hover:bg-danger/5 transition-colors"
              >
                Delete
              </button>
            )}
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="flex-1 py-2.5 bg-primary text-background font-medium rounded-lg text-sm disabled:opacity-50 hover:bg-primary/90 transition-colors"
            >
              {saving ? 'Saving...' : item ? 'Save Changes' : 'Add Priority'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
