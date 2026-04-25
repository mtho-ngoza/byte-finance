'use client';

import { useState, useEffect, useCallback } from 'react';
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
import { CurrencyInput } from '@/components/shared/currency-input';
import { AmountDisplay } from '@/components/shared/amount-display';
import { Skeleton } from '@/components/shared/skeleton';
import type { Commitment, Category } from '@/types/index';

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
}

const CATEGORIES: Category[] = [
  'housing',
  'transport',
  'family',
  'utilities',
  'health',
  'education',
  'savings',
  'lifestyle',
  'business',
  'other',
];

const EMPTY_FORM: CommitmentFormData = {
  label: '',
  amount: 0,
  category: 'other',
  accountType: 'personal',
  isVariable: false,
};

// ---------------------------------------------------------------------------
// Sortable row component
// ---------------------------------------------------------------------------

interface SortableRowProps {
  item: Commitment;
  onToggleActive: (item: Commitment) => void;
  onEdit: (item: Commitment) => void;
  onDelete: (id: string) => void;
}

function SortableRow({ item, onToggleActive, onEdit, onDelete }: SortableRowProps) {
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
      className="flex items-center gap-3 p-3 bg-surface border border-border rounded-lg"
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="text-text-secondary hover:text-text-primary cursor-grab active:cursor-grabbing shrink-0 touch-none"
        aria-label="Drag to reorder"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="5" cy="4" r="1.5" />
          <circle cx="11" cy="4" r="1.5" />
          <circle cx="5" cy="8" r="1.5" />
          <circle cx="11" cy="8" r="1.5" />
          <circle cx="5" cy="12" r="1.5" />
          <circle cx="11" cy="12" r="1.5" />
        </svg>
      </button>

      {/* Active toggle */}
      <button
        onClick={() => onToggleActive(item)}
        className={`w-5 h-5 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
          item.isActive
            ? 'bg-primary border-primary'
            : 'bg-transparent border-border'
        }`}
        aria-label={item.isActive ? 'Deactivate' : 'Activate'}
        title={item.isActive ? 'Active — click to deactivate' : 'Inactive — click to activate'}
      >
        {item.isActive && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="black" strokeWidth="2">
            <polyline points="1.5,5 4,7.5 8.5,2.5" />
          </svg>
        )}
      </button>

      {/* Label + category */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${item.isActive ? 'text-text-primary' : 'text-text-secondary line-through'}`}>
          {item.label}
        </p>
        <p className="text-xs text-text-secondary capitalize">
          {item.category} · {item.accountType}
          {item.isVariable && ' · Variable'}
          {item.dueDay && ` · Due ${item.dueDay}${getDaySuffix(item.dueDay)}`}
        </p>
      </div>

      {/* Amount */}
      <AmountDisplay amount={item.amount} size="sm" className="shrink-0" />

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

function getDaySuffix(day: number): string {
  if (day >= 11 && day <= 13) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

// ---------------------------------------------------------------------------
// Add / Edit form
// ---------------------------------------------------------------------------

interface CommitmentFormProps {
  initial?: CommitmentFormData;
  onSave: (data: CommitmentFormData) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}

function CommitmentForm({ initial = EMPTY_FORM, onSave, onCancel, saving }: CommitmentFormProps) {
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
            {CATEGORIES.map((c) => (
              <option key={c} value={c} className="capitalize">
                {c}
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

      {/* Due day + Variable toggle */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-text-secondary mb-1">Due Day (optional)</label>
          <input
            type="number"
            value={form.dueDay ?? ''}
            onChange={(e) => set('dueDay', e.target.value ? parseInt(e.target.value, 10) : undefined)}
            min={1}
            max={31}
            placeholder="1-31"
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-primary text-sm"
          />
        </div>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
            <input
              type="checkbox"
              checked={form.isVariable}
              onChange={(e) => set('isVariable', e.target.checked)}
              className="w-4 h-4 rounded border-border bg-background accent-primary"
            />
            Variable amount
          </label>
        </div>
      </div>

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
// Main settings page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const [items, setItems] = useState<Commitment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<Commitment | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    // Optimistic update
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
      // Revert on failure
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, isActive: item.isActive } : i))
      );
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  // Delete
  async function handleDelete(id: string) {
    if (!confirm('Delete this commitment? This cannot be undone.')) return;
    // Optimistic remove
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

  // Drag end — reorder and persist sortOrder
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(items, oldIndex, newIndex);

    // Assign new sortOrder values
    const withOrder = reordered.map((item, idx) => ({ ...item, sortOrder: idx }));
    setItems(withOrder);

    // Persist sortOrder for all items that moved
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

  const activeCount = items.filter((i) => i.isActive).length;

  return (
    <div className="max-w-2xl space-y-8">
      {/* Page title */}
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Settings</h1>
      </div>

      {/* Commitments section */}
      <section>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-text-primary">Commitments</h2>
          <p className="text-sm text-text-secondary mt-1">
            Recurring monthly obligations that auto-populate each pay cycle.
            Active commitments spawn items when you create a new cycle.
          </p>
          {!loading && items.length > 0 && (
            <p className="text-xs text-text-secondary mt-1">
              {activeCount} of {items.length} active
            </p>
          )}
        </div>

        {error && (
          <div className="mb-3 px-3 py-2 bg-danger/10 border border-danger/30 rounded-lg text-sm text-danger">
            {error}
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((n) => (
              <Skeleton key={n} height={56} className="w-full" />
            ))}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={items.map((i) => i.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {items.map((item) => (
                  editingItem?.id === item.id ? (
                    <CommitmentForm
                      key={item.id}
                      initial={{
                        label: item.label,
                        amount: item.amount,
                        category: item.category,
                        accountType: item.accountType,
                        dueDay: item.dueDay,
                        isVariable: item.isVariable,
                      }}
                      onSave={handleUpdate}
                      onCancel={() => setEditingItem(null)}
                      saving={saving}
                    />
                  ) : (
                    <SortableRow
                      key={item.id}
                      item={item}
                      onToggleActive={handleToggleActive}
                      onEdit={setEditingItem}
                      onDelete={handleDelete}
                    />
                  )
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {/* Add form or button */}
        {!loading && (
          <div className="mt-3">
            {showForm ? (
              <CommitmentForm
                onSave={handleCreate}
                onCancel={() => setShowForm(false)}
                saving={saving}
              />
            ) : (
              <button
                onClick={() => setShowForm(true)}
                className="w-full py-2.5 border border-dashed border-border rounded-lg text-sm text-text-secondary hover:text-text-primary hover:border-primary transition-colors"
              >
                + Add commitment
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
