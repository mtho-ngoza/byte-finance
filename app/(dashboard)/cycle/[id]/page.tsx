'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { doc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserId } from '@/hooks/use-user-id';
import { useCycleItems } from '@/hooks/use-cycle-items';
import { useCycles } from '@/hooks/use-cycles';
import { AmountDisplay } from '@/components/shared/amount-display';
import type { CycleItem, CycleItemStatus, Category, Cycle } from '@/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'housing', label: 'Housing' },
  { value: 'transport', label: 'Transport' },
  { value: 'family', label: 'Family' },
  { value: 'health', label: 'Health' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'education', label: 'Education' },
  { value: 'savings', label: 'Savings' },
  { value: 'lifestyle', label: 'Lifestyle' },
  { value: 'business', label: 'Business' },
  { value: 'other', label: 'Other' },
];

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
  const { items, loading: itemsLoading, totalCommitted, totalPaid, updateStatus, updateAmount } =
    useCycleItems(cycleId);

  const cycle = cycles.find((c) => c.id === cycleId);
  const loading = cyclesLoading || itemsLoading;

  // Group items by category
  const itemsByCategory = useMemo(() => {
    const grouped = new Map<Category, CycleItem[]>();
    for (const item of items) {
      const list = grouped.get(item.category) ?? [];
      list.push(item);
      grouped.set(item.category, list);
    }
    return grouped;
  }, [items]);

  // Calculate stats
  const remaining = totalCommitted - totalPaid;
  const progressPercent = totalCommitted > 0 ? Math.round((totalPaid / totalCommitted) * 100) : 0;

  const paidCount = items.filter((i) => i.status === 'paid').length;
  const skippedCount = items.filter((i) => i.status === 'skipped').length;

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
            <p className="text-sm text-text-secondary">Remaining</p>
            <AmountDisplay amount={remaining} size="lg" />
          </div>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-xs text-text-secondary mb-1">
            <span>
              Paid: <AmountDisplay amount={totalPaid} size="xs" className="inline" />
            </span>
            <span>{progressPercent}%</span>
          </div>
          <div className="h-2 bg-background rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Items by Category */}
      {CATEGORY_ORDER.map((category) => {
        const categoryItems = itemsByCategory.get(category);
        if (!categoryItems || categoryItems.length === 0) return null;

        const categoryTotal = categoryItems.reduce((sum, i) => sum + i.amount, 0);
        const categoryPaid = categoryItems
          .filter((i) => i.status === 'paid')
          .reduce((sum, i) => sum + i.amount, 0);

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
          />
        );
      })}

      {items.length === 0 && (
        <div className="text-center py-8 text-text-secondary">
          <p>No items in this cycle.</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CategorySection with DnD
// ---------------------------------------------------------------------------

interface CategorySectionProps {
  category: Category;
  items: CycleItem[];
  totalAmount: number;
  paidAmount: number;
  cycleId: string;
  userId: string | undefined;
  updateStatus: (id: string, status: CycleItemStatus) => Promise<void>;
  updateAmount: (id: string, amount: number) => Promise<void>;
}

function CategorySection({
  category,
  items,
  totalAmount,
  paidAmount,
  cycleId,
  userId,
  updateStatus,
  updateAmount,
}: CategorySectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [localItems, setLocalItems] = useState(items);

  // Sync with props
  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !userId) return;

    const oldIndex = localItems.findIndex((i) => i.id === active.id);
    const newIndex = localItems.findIndex((i) => i.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    // Optimistic reorder
    const newItems = [...localItems];
    const [movedItem] = newItems.splice(oldIndex, 1);
    newItems.splice(newIndex, 0, movedItem);
    setLocalItems(newItems);

    // Update sort orders in Firestore
    const updates = newItems.map((item, index) => ({
      id: item.id,
      sortOrder: index,
    }));

    for (const { id, sortOrder } of updates) {
      const ref = doc(db, `users/${userId}/cycleItems`, id);
      await updateDoc(ref, { sortOrder, updatedAt: Timestamp.now() });
    }
  };

  const categoryLabel = CATEGORIES.find((c) => c.value === category)?.label ?? category;

  return (
    <section className="border border-border rounded-xl overflow-hidden bg-surface">
      {/* Category Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between p-4 hover:bg-background/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-4 h-4 text-text-secondary transition-transform ${collapsed ? '' : 'rotate-90'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <h3 className="text-sm font-semibold text-text-primary capitalize">{categoryLabel}</h3>
          <span className="text-xs text-text-secondary">({items.length})</span>
        </div>
        <div className="text-right">
          <AmountDisplay amount={paidAmount} size="sm" className="inline" />
          <span className="text-text-secondary text-sm"> / </span>
          <AmountDisplay amount={totalAmount} size="sm" className="inline text-text-secondary" />
        </div>
      </button>

      {/* Items */}
      {!collapsed && (
        <div className="border-t border-border">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={localItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              {localItems.map((item) => (
                <SortableItemRow
                  key={item.id}
                  item={item}
                  cycleId={cycleId}
                  userId={userId}
                  onStatusChange={updateStatus}
                  onAmountChange={updateAmount}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// SortableItemRow
// ---------------------------------------------------------------------------

interface SortableItemRowProps {
  item: CycleItem;
  cycleId: string;
  userId: string | undefined;
  onStatusChange: (id: string, status: CycleItemStatus) => Promise<void>;
  onAmountChange: (id: string, amount: number) => Promise<void>;
}

function SortableItemRow({ item, cycleId, userId, onStatusChange, onAmountChange }: SortableItemRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [loading, setLoading] = useState(false);
  const [editingAmount, setEditingAmount] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [editingItem, setEditingItem] = useState(false);

  const isPaid = item.status === 'paid';
  const isSkipped = item.status === 'skipped';
  const isDue = item.status === 'due';

  const handleToggle = async () => {
    setLoading(true);
    try {
      const newStatus: CycleItemStatus = isPaid ? 'upcoming' : 'paid';
      await onStatusChange(item.id, newStatus);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    setLoading(true);
    setShowMenu(false);
    try {
      const newStatus: CycleItemStatus = isSkipped ? 'upcoming' : 'skipped';
      await onStatusChange(item.id, newStatus);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!userId || !confirm('Delete this item?')) return;
    setShowMenu(false);
    try {
      await deleteDoc(doc(db, `users/${userId}/cycleItems`, item.id));
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const handleAmountClick = () => {
    if (!isSkipped) {
      setEditValue((item.amount / 100).toFixed(2));
      setEditingAmount(true);
    }
  };

  const handleAmountSave = async () => {
    const newAmount = Math.round(parseFloat(editValue) * 100);
    if (!isNaN(newAmount) && newAmount >= 0 && newAmount !== item.amount) {
      setLoading(true);
      try {
        await onAmountChange(item.id, newAmount);
      } finally {
        setLoading(false);
      }
    }
    setEditingAmount(false);
  };

  const handleAmountKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAmountSave();
    else if (e.key === 'Escape') setEditingAmount(false);
  };

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={`flex items-center gap-2 p-3 border-b border-border last:border-b-0 ${
          isDue ? 'bg-warning/5' : isSkipped ? 'opacity-50' : ''
        }`}
      >
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="w-6 h-6 flex items-center justify-center text-text-secondary hover:text-text-primary cursor-grab active:cursor-grabbing touch-none"
          aria-label="Drag to reorder"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
            <circle cx="4" cy="4" r="1.5" />
            <circle cx="4" cy="8" r="1.5" />
            <circle cx="4" cy="12" r="1.5" />
            <circle cx="10" cy="4" r="1.5" />
            <circle cx="10" cy="8" r="1.5" />
            <circle cx="10" cy="12" r="1.5" />
          </svg>
        </button>

        {/* Toggle button */}
        <button
          onClick={handleToggle}
          disabled={loading || isSkipped}
          className={`w-5 h-5 rounded border-2 shrink-0 flex items-center justify-center transition-colors disabled:opacity-50 ${
            isPaid ? 'bg-primary border-primary' : 'bg-transparent border-border hover:border-primary'
          }`}
          aria-label={isPaid ? 'Mark as unpaid' : 'Mark as paid'}
        >
          {isPaid && (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="black" strokeWidth="2">
              <polyline points="1.5,5 4,7.5 8.5,2.5" />
            </svg>
          )}
        </button>

        {/* Label + tags */}
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm font-medium truncate ${
              isPaid || isSkipped ? 'text-text-secondary line-through' : 'text-text-primary'
            }`}
          >
            {item.label}
          </p>
          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
            {item.accountType === 'business' && (
              <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[10px] uppercase">
                Biz
              </span>
            )}
            {item.linkedGoalId && <span className="text-primary">linked</span>}
            {!item.commitmentId && (
              <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 text-[10px]">
                one-off
              </span>
            )}
            {isSkipped && <span className="text-warning">skipped</span>}
          </div>
        </div>

        {/* Amount */}
        {editingAmount ? (
          <div className="flex items-center gap-1">
            <span className="text-sm text-text-secondary">R</span>
            <input
              type="number"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleAmountSave}
              onKeyDown={handleAmountKeyDown}
              autoFocus
              step="0.01"
              min="0"
              className="w-20 px-2 py-1 text-sm text-right rounded border border-primary bg-background text-text-primary focus:outline-none"
            />
          </div>
        ) : (
          <button
            onClick={handleAmountClick}
            disabled={isSkipped}
            className={`hover:bg-background px-2 py-1 rounded transition-colors ${isPaid ? 'opacity-50' : ''}`}
            title="Click to edit amount"
          >
            <AmountDisplay amount={item.amount} size="sm" />
          </button>
        )}

        {/* Menu button */}
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-background text-text-secondary hover:text-text-primary transition-colors"
            aria-label="Item menu"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
              <circle cx="8" cy="3" r="1.5" />
              <circle cx="8" cy="8" r="1.5" />
              <circle cx="8" cy="13" r="1.5" />
            </svg>
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-full mt-1 w-36 bg-surface border border-border rounded-lg shadow-lg z-20 py-1">
                <button
                  onClick={() => {
                    setShowMenu(false);
                    setEditingItem(true);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-background transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={handleSkip}
                  className="w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-background transition-colors"
                >
                  {isSkipped ? 'Unskip' : 'Skip'}
                </button>
                <button
                  onClick={handleDelete}
                  className="w-full px-3 py-2 text-left text-sm text-error hover:bg-background transition-colors"
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editingItem && (
        <EditItemModal
          item={item}
          cycleId={cycleId}
          userId={userId}
          onClose={() => setEditingItem(false)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// EditItemModal
// ---------------------------------------------------------------------------

interface EditItemModalProps {
  item: CycleItem;
  cycleId: string;
  userId: string | undefined;
  onClose: () => void;
}

function EditItemModal({ item, cycleId, userId, onClose }: EditItemModalProps) {
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState(item.label);
  const [amount, setAmount] = useState((item.amount / 100).toFixed(2));
  const [category, setCategory] = useState<Category>(item.category);
  const [accountType, setAccountType] = useState<'personal' | 'business'>(item.accountType);

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);

    try {
      const ref = doc(db, `users/${userId}/cycleItems`, item.id);
      await updateDoc(ref, {
        label,
        amount: Math.round(parseFloat(amount) * 100),
        category,
        accountType,
        updatedAt: Timestamp.now(),
      });
      onClose();
    } catch (err) {
      console.error('Update failed:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-border rounded-xl w-full max-w-md p-4 space-y-4">
        <h3 className="text-base font-semibold text-text-primary">Edit Item</h3>

        <div>
          <label className="block text-xs text-text-secondary mb-1">Label</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm"
          />
        </div>

        <div>
          <label className="block text-xs text-text-secondary mb-1">Amount (R)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="0"
            step="0.01"
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Account</label>
            <select
              value={accountType}
              onChange={(e) => setAccountType(e.target.value as 'personal' | 'business')}
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
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-border text-text-secondary text-sm hover:bg-background transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !label.trim()}
            className="flex-1 py-2 rounded-lg bg-primary text-background font-medium text-sm disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
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
