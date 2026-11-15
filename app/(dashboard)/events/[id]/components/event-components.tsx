'use client';

import { useState } from 'react';
import { AmountDisplay } from '@/components/shared/amount-display';
import { CurrencyInput } from '@/components/shared/currency-input';
import { DateInput } from '@/components/shared/date-input';
import { useToast } from '@/components/shared/toast';
import type { Event, EventCategory, EventItem, EventPayment, EventContribution, Project } from '@/types';

// ============================================================================
// ItemRow Component
// ============================================================================
interface ItemRowProps {
  item: EventItem;
  parseDate: (d: unknown) => Date;
  onEdit: () => void;
  onDelete: () => void;
  onAddPayment: () => void;
  onDeletePayment: (paymentId: string) => void;
  onUpdateNotes: (notes: string) => void;
  onMove: (direction: 'up' | 'down') => void;
  siblingIndex: number;
  siblingTotal: number;
}

export function ItemRow({
  item,
  parseDate,
  onEdit,
  onDelete,
  onAddPayment,
  onDeletePayment,
  onUpdateNotes,
  onMove,
  siblingIndex,
  siblingTotal,
}: ItemRowProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showPayments, setShowPayments] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [notesValue, setNotesValue] = useState(item.notes || '');
  const [savingNotes, setSavingNotes] = useState(false);

  const hasNotes = !!item.notes && item.notes.trim().length > 0;

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      await onUpdateNotes(notesValue);
      setShowNotes(false);
    } finally {
      setSavingNotes(false);
    }
  };

  const subtotal = item.unitPrice * item.quantity;
  const totalPaid = (item.payments || []).reduce((sum, p) => sum + p.amount, 0);
  const remaining = subtotal - totalPaid;
  const progressPercent = subtotal > 0 ? Math.round((totalPaid / subtotal) * 100) : 0;

  const statusColors: Record<string, string> = {
    quoted: 'text-text-secondary',
    confirmed: 'text-primary',
    partial: 'text-yellow-500',
    paid: 'text-success',
    cancelled: 'text-text-secondary line-through',
  };

  if (confirmDelete) {
    return (
      <div className="flex items-center justify-between gap-3 border-b border-border p-3 bg-error/5">
        <span className="text-sm text-text-primary">Delete this item?</span>
        <div className="flex gap-2">
          <button onClick={() => setConfirmDelete(false)} className="px-3 py-1 rounded text-xs text-text-secondary border border-border">
            Cancel
          </button>
          <button onClick={onDelete} className="px-3 py-1 rounded text-xs text-white bg-error">
            Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-border last:border-b-0">
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-medium ${statusColors[item.status]}`}>{item.name}</span>
              {item.status === 'paid' && <span className="text-xs text-success">Paid</span>}
            </div>
            {item.vendor && <p className="text-xs text-text-secondary">{item.vendor}</p>}
            <p className="text-xs text-text-secondary">
              {item.quantity} x <AmountDisplay amount={item.unitPrice} size="xs" /> = <AmountDisplay amount={subtotal} size="xs" />
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {item.status !== 'paid' && item.status !== 'cancelled' && (
              <button onClick={onAddPayment} className="px-2 py-1 rounded text-xs bg-primary text-background">
                + Pay
              </button>
            )}
            <button
              onClick={() => onMove('up')}
              disabled={siblingIndex === 0}
              className="p-1 rounded text-text-secondary/50 hover:text-text-secondary disabled:opacity-30 disabled:cursor-not-allowed"
              title="Move up"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
              </svg>
            </button>
            <button
              onClick={() => onMove('down')}
              disabled={siblingIndex === siblingTotal - 1}
              className="p-1 rounded text-text-secondary/50 hover:text-text-secondary disabled:opacity-30 disabled:cursor-not-allowed"
              title="Move down"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <button
              onClick={() => setShowNotes(!showNotes)}
              className={`p-1 rounded relative ${hasNotes ? 'text-primary' : 'text-text-secondary/50 hover:text-text-secondary'}`}
              title={hasNotes ? 'View notes' : 'Add notes'}
            >
              <svg className="w-4 h-4" fill={hasNotes ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
              {hasNotes && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-primary rounded-full" />}
            </button>
            <button onClick={onEdit} className="p-1 rounded text-text-secondary/50 hover:text-text-secondary">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button onClick={() => setConfirmDelete(true)} className="p-1 rounded text-text-secondary/50 hover:text-error">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>

        {showNotes && (
          <div className="mt-2 p-2 bg-background rounded-lg border border-border">
            <textarea
              value={notesValue}
              onChange={(e) => setNotesValue(e.target.value)}
              placeholder="Add a note..."
              rows={2}
              className="w-full px-2 py-1 text-xs bg-surface border border-border rounded resize-none focus:outline-none focus:border-primary"
            />
            <div className="flex justify-end gap-2 mt-2">
              <button onClick={() => { setShowNotes(false); setNotesValue(item.notes || ''); }} className="px-2 py-1 text-xs text-text-secondary">
                Cancel
              </button>
              <button onClick={handleSaveNotes} disabled={savingNotes} className="px-2 py-1 text-xs bg-primary text-background rounded disabled:opacity-50">
                {savingNotes ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}

        {subtotal > 0 && totalPaid > 0 && (
          <div className="mt-2">
            <div className="h-1 bg-background rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="flex justify-between text-xs text-text-secondary mt-1">
              <span><AmountDisplay amount={totalPaid} size="xs" /> paid</span>
              <span><AmountDisplay amount={remaining} size="xs" /> remaining</span>
            </div>
          </div>
        )}

        {(item.payments || []).length > 0 && (
          <button
            onClick={() => setShowPayments(!showPayments)}
            className="text-xs text-primary mt-2 flex items-center gap-1"
          >
            {showPayments ? 'Hide' : 'Show'} payments ({item.payments!.length})
            <svg className={`w-3 h-3 transition-transform ${showPayments ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
      </div>

      {showPayments && (item.payments || []).length > 0 && (
        <div className="bg-background/50 px-3 pb-3 space-y-2">
          {item.payments!.map((payment) => (
            <PaymentRow key={payment.id} payment={payment} parseDate={parseDate} onDelete={() => onDeletePayment(payment.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// PaymentRow Component
// ============================================================================
interface PaymentRowProps {
  payment: EventPayment;
  parseDate: (d: unknown) => Date;
  onDelete: () => void;
}

export function PaymentRow({ payment, parseDate, onDelete }: PaymentRowProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const date = parseDate(payment.date);

  if (confirmDelete) {
    return (
      <div className="flex items-center justify-between gap-3 p-2 bg-error/5 rounded-lg">
        <span className="text-xs text-text-primary">Delete payment?</span>
        <div className="flex gap-2">
          <button onClick={() => setConfirmDelete(false)} className="px-2 py-0.5 rounded text-xs text-text-secondary border border-border">
            No
          </button>
          <button onClick={onDelete} className="px-2 py-0.5 rounded text-xs text-white bg-error">
            Yes
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 p-2 bg-background rounded-lg">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-text-primary">
          <AmountDisplay amount={payment.amount} size="xs" />
        </p>
        <p className="text-xs text-text-secondary">
          {date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
          {payment.note && ` • ${payment.note}`}
        </p>
      </div>
      <button onClick={() => setConfirmDelete(true)} className="p-1 rounded text-text-secondary/50 hover:text-error">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ============================================================================
// EditEventForm Component
// ============================================================================
interface EditEventFormProps {
  event: Event;
  projects: Project[];
  parseDate: (d: unknown) => Date;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}

export function EditEventForm({ event, projects, parseDate, onSave, onCancel }: EditEventFormProps) {
  const [name, setName] = useState(event.name);
  const [description, setDescription] = useState(event.description || '');
  const [eventDate, setEventDate] = useState(event.eventDate ? parseDate(event.eventDate).toISOString().split('T')[0] : '');
  const [linkedProjectId, setLinkedProjectId] = useState(event.linkedProjectId || '');
  const [status, setStatus] = useState(event.status);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        name,
        description,
        eventDate: eventDate ? new Date(eventDate).toISOString() : undefined,
        linkedProjectId: linkedProjectId || undefined,
        status,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
      <div className="bg-surface border border-border rounded-t-2xl sm:rounded-xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-text-primary">Edit Event</h3>
            <button type="button" onClick={onCancel} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-background text-text-secondary">
              ✕
            </button>
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">Event Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Event Date</label>
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
              >
                <option value="planning">Planning</option>
                <option value="confirmed">Confirmed</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          {projects.length > 0 && (
            <div>
              <label className="block text-xs text-text-secondary mb-1">Linked Project</label>
              <select
                value={linkedProjectId}
                onChange={(e) => setLinkedProjectId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
              >
                <option value="">No linked project</option>
                {projects.filter(p => p.status === 'active').map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-lg border border-border text-text-secondary text-sm font-medium">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-lg bg-primary text-background font-medium text-sm disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// CategoryForm Component
// ============================================================================
interface CategoryFormProps {
  category?: EventCategory;
  allCategories?: EventCategory[];
  onSave: (data: { name: string; parentId: string | null }) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
}

export function CategoryForm({ category, allCategories = [], onSave, onCancel, onDelete }: CategoryFormProps) {
  const [name, setName] = useState(category?.name || '');
  const [parentId, setParentId] = useState(category?.parentId || '');
  const [saving, setSaving] = useState(false);

  const getDescendantIds = (catId: string): string[] => {
    const children = allCategories.filter(c => c.parentId === catId);
    return children.flatMap(c => [c.id, ...getDescendantIds(c.id)]);
  };
  const excludeIds = category ? [category.id, ...getDescendantIds(category.id)] : [];
  const parentOptions = allCategories.filter(c => !excludeIds.includes(c.id)).sort((a, b) => a.name.localeCompare(b.name));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ name, parentId: parentId || null });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
      <div className="bg-surface border border-border rounded-t-2xl sm:rounded-xl w-full sm:max-w-md">
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-text-primary">{category ? 'Edit Category' : 'Add Category'}</h3>
            <button type="button" onClick={onCancel} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-background text-text-secondary">
              ✕
            </button>
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">Category Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Alcohol, Catering, Photography"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">Parent Category (optional)</label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
            >
              <option value="">None (top-level)</option>
              {parentOptions.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
            {parentOptions.length === 0 && <p className="text-xs text-text-secondary mt-1">Create more categories to enable nesting</p>}
          </div>

          <div className="flex gap-2 pt-2">
            {onDelete && (
              <button type="button" onClick={onDelete} className="px-4 py-2.5 rounded-lg text-error text-sm font-medium hover:bg-error/10">
                Delete
              </button>
            )}
            <div className="flex-1" />
            <button type="button" onClick={onCancel} className="px-4 py-2.5 rounded-lg border border-border text-text-secondary text-sm font-medium">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2.5 rounded-lg bg-primary text-background font-medium text-sm disabled:opacity-50">
              {saving ? 'Saving...' : category ? 'Save' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// ItemForm Component
// ============================================================================
interface ItemFormProps {
  item?: EventItem;
  categoryId?: string;
  categories: EventCategory[];
  onSave: (data: Partial<EventItem>) => Promise<void>;
  onCancel: () => void;
}

export function ItemForm({ item, categoryId, categories, onSave, onCancel }: ItemFormProps) {
  const [name, setName] = useState(item?.name || '');
  const [vendor, setVendor] = useState(item?.vendor || '');
  const [unitPrice, setUnitPrice] = useState(item?.unitPrice || 0);
  const [quantityStr, setQuantityStr] = useState(String(item?.quantity || 1));
  const [selectedCategoryId, setSelectedCategoryId] = useState(item?.categoryId || categoryId || '');
  const [status, setStatus] = useState(item?.status || 'quoted');
  const [saving, setSaving] = useState(false);

  const quantity = parseInt(quantityStr) || 0;
  const subtotal = unitPrice * quantity;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        name,
        vendor,
        unitPrice,
        quantity: parseInt(quantityStr) || 1,
        categoryId: selectedCategoryId,
        status,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
      <div className="bg-surface border border-border rounded-t-2xl sm:rounded-xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-text-primary">{item ? 'Edit Item' : 'Add Item'}</h3>
            <button type="button" onClick={onCancel} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-background text-text-secondary">
              ✕
            </button>
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">Item Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Whiskey, Cameraman Day Rate"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">Vendor (optional)</label>
            <input
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="e.g., ABC Liquors"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Unit Price</label>
              <CurrencyInput value={unitPrice} onChange={setUnitPrice} />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Quantity</label>
              <input
                type="number"
                required
                min={1}
                value={quantityStr}
                onChange={(e) => setQuantityStr(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="bg-background rounded-lg p-3 text-center">
            <p className="text-xs text-text-secondary">Subtotal</p>
            <p className="text-lg font-semibold text-text-primary"><AmountDisplay amount={subtotal} size="lg" /></p>
          </div>

          {!categoryId && (
            <div>
              <label className="block text-xs text-text-secondary mb-1">Category</label>
              <select
                required
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
              >
                <option value="">Select category</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
          )}

          {item && (
            <div>
              <label className="block text-xs text-text-secondary mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
              >
                <option value="quoted">Quoted</option>
                <option value="confirmed">Confirmed</option>
                <option value="partial">Partial</option>
                <option value="paid">Paid</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-lg border border-border text-text-secondary text-sm font-medium">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-lg bg-primary text-background font-medium text-sm disabled:opacity-50">
              {saving ? 'Saving...' : item ? 'Save' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// PaymentForm Component
// ============================================================================
interface PaymentFormProps {
  item: EventItem;
  onSave: (data: { amount: number; note: string; date: string }) => Promise<void>;
  onCancel: () => void;
}

export function PaymentForm({ item, onSave, onCancel }: PaymentFormProps) {
  const subtotal = item.unitPrice * item.quantity;
  const totalPaid = (item.payments || []).reduce((sum, p) => sum + p.amount, 0);
  const remaining = subtotal - totalPaid;

  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ amount, note, date });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
      <div className="bg-surface border border-border rounded-t-2xl sm:rounded-xl w-full sm:max-w-md">
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-text-primary">Add Payment</h3>
            <button type="button" onClick={onCancel} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-background text-text-secondary">
              ✕
            </button>
          </div>

          <div className="bg-background rounded-lg p-3">
            <p className="text-sm font-medium text-text-primary">{item.name}</p>
            <p className="text-xs text-text-secondary">
              Remaining: <AmountDisplay amount={remaining} size="xs" /> of <AmountDisplay amount={subtotal} size="xs" />
            </p>
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">Amount</label>
            <CurrencyInput value={amount} onChange={setAmount} />
            <button type="button" onClick={() => setAmount(remaining)} className="text-xs text-primary mt-1 hover:underline">
              Pay full remaining (<AmountDisplay amount={remaining} size="xs" />)
            </button>
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">Note (optional)</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g., Deposit, Final payment"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
            />
          </div>

          <DateInput label="Date" value={date} onChange={(e) => setDate(e.target.value)} />

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-lg border border-border text-text-secondary text-sm font-medium">
              Cancel
            </button>
            <button type="submit" disabled={saving || amount <= 0} className="flex-1 py-2.5 rounded-lg bg-primary text-background font-medium text-sm disabled:opacity-50">
              {saving ? 'Adding...' : 'Add Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// ShareModal Component
// ============================================================================
interface ShareModalProps {
  eventId: string;
  shareToken?: string;
  onClose: () => void;
  onUpdate: () => Promise<void>;
}

export function ShareModal({ eventId, shareToken, onClose, onUpdate }: ShareModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl = shareToken ? `${window.location.origin}/share/events/${shareToken}` : null;

  const handleGenerateLink = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/events/${eventId}/share`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to generate share link');
      await onUpdate();
      toast('Share link created', 'success');
    } catch (error) {
      console.error('Failed to generate share link:', error);
      toast('Failed to create share link', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeLink = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/events/${eventId}/share`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to revoke share link');
      await onUpdate();
      toast('Share link revoked', 'success');
    } catch (error) {
      console.error('Failed to revoke share link:', error);
      toast('Failed to revoke share link', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast('Link copied to clipboard', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast('Failed to copy link', 'error');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
      <div className="bg-surface border border-border rounded-t-2xl sm:rounded-xl w-full sm:max-w-md">
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-text-primary">Share Event</h3>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-background text-text-secondary">
              ✕
            </button>
          </div>

          {shareUrl ? (
            <>
              <div className="bg-background rounded-lg p-3">
                <p className="text-xs text-text-secondary mb-2">Anyone with this link can view and edit this event</p>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={shareUrl}
                    className="flex-1 px-3 py-2 rounded-lg border border-border bg-surface text-text-primary text-xs focus:outline-none"
                  />
                  <button onClick={handleCopy} className="px-3 py-2 rounded-lg bg-primary text-background text-sm font-medium shrink-0">
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <button
                  onClick={handleRevokeLink}
                  disabled={loading}
                  className="w-full py-2.5 rounded-lg border border-error text-error text-sm font-medium hover:bg-error/10 disabled:opacity-50"
                >
                  {loading ? 'Revoking...' : 'Revoke Access'}
                </button>
                <p className="text-xs text-text-secondary text-center mt-2">Revoking will disable the link and prevent further access</p>
              </div>
            </>
          ) : (
            <>
              <div className="bg-background rounded-lg p-4 text-center">
                <svg className="w-12 h-12 mx-auto mb-3 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                <h4 className="text-sm font-medium text-text-primary mb-1">Share with family & friends</h4>
                <p className="text-xs text-text-secondary">Create a link to let others view and contribute to this event budget without needing an account</p>
              </div>

              <button
                onClick={handleGenerateLink}
                disabled={loading}
                className="w-full py-2.5 rounded-lg bg-primary text-background font-medium text-sm disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create Share Link'}
              </button>
            </>
          )}

          <button onClick={onClose} className="w-full py-2.5 rounded-lg border border-border text-text-secondary text-sm font-medium">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ContributionsSection Component
// ============================================================================
interface ContributionsSectionProps {
  contributions: EventContribution[];
  parseDate: (d: unknown) => Date;
  onAdd: () => void;
  onEdit: (contribution: EventContribution) => void;
  onDelete: (id: string) => void;
}

export function ContributionsSection({ contributions, parseDate, onAdd, onEdit, onDelete }: ContributionsSectionProps) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  const sortedContributions = [...contributions].sort((a, b) => {
    const dateA = parseDate(a.date);
    const dateB = parseDate(b.date);
    return dateB.getTime() - dateA.getTime();
  });

  const cashTotal = contributions.filter(c => c.type === 'cash' && c.amount).reduce((sum, c) => sum + (c.amount || 0), 0);
  const itemCount = contributions.filter(c => c.type === 'item').length;

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between p-3 hover:bg-background/50 transition-colors">
        <div className="flex items-center gap-2">
          <svg className={`w-4 h-4 text-text-secondary transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="font-semibold text-text-primary">Contributions / Izipheko</span>
          <span className="text-xs text-text-secondary">({contributions.length})</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {cashTotal > 0 && <span className="text-success"><AmountDisplay amount={cashTotal} size="xs" /> cash</span>}
          {itemCount > 0 && <span className="text-text-secondary">{itemCount} items</span>}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border">
          {sortedContributions.length === 0 ? (
            <p className="text-sm text-text-secondary text-center py-6">No contributions yet</p>
          ) : (
            <div className="divide-y divide-border">
              {sortedContributions.map(contrib => {
                const date = parseDate(contrib.date);

                if (confirmDelete === contrib.id) {
                  return (
                    <div key={contrib.id} className="flex items-center justify-between gap-3 p-3 bg-error/5">
                      <span className="text-sm text-text-primary">Delete this contribution?</span>
                      <div className="flex gap-2">
                        <button onClick={() => setConfirmDelete(null)} className="px-3 py-1 rounded text-xs text-text-secondary border border-border">Cancel</button>
                        <button onClick={() => { onDelete(contrib.id); setConfirmDelete(null); }} className="px-3 py-1 rounded text-xs text-white bg-error">Delete</button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={contrib.id} className="flex items-center gap-3 p-3 hover:bg-background/30">
                    <div className="w-10 h-10 rounded-lg bg-background flex flex-col items-center justify-center shrink-0">
                      <span className="text-xs text-text-secondary leading-none">{date.toLocaleDateString('en-ZA', { month: 'short' })}</span>
                      <span className="text-sm font-semibold text-text-primary leading-none">{date.getDate()}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">
                        {contrib.type === 'cash' ? <span className="text-success"><AmountDisplay amount={contrib.amount || 0} size="sm" /></span> : contrib.itemDescription}
                      </p>
                      <p className="text-xs text-text-secondary truncate">
                        {contrib.contributorName || 'Anonymous'}{contrib.note && ` • ${contrib.note}`}
                      </p>
                    </div>

                    <span className={`px-2 py-0.5 rounded text-xs ${contrib.type === 'cash' ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}>
                      {contrib.type === 'cash' ? 'Cash' : 'Item'}
                    </span>

                    <div className="flex shrink-0">
                      <button onClick={() => onEdit(contrib)} className="p-1.5 rounded text-text-secondary/50 hover:text-text-secondary hover:bg-background" title="Edit">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button onClick={() => setConfirmDelete(contrib.id)} className="p-1.5 rounded text-text-secondary/50 hover:text-error hover:bg-background" title="Delete">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <button onClick={onAdd} className="w-full p-2.5 text-sm text-primary hover:bg-background/50 flex items-center justify-center gap-1 border-t border-border">
            <span>+</span> Add Contribution
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ContributionForm Component
// ============================================================================
interface ContributionFormProps {
  contribution?: EventContribution;
  onSave: (data: Partial<EventContribution>) => void;
  onCancel: () => void;
}

export function ContributionForm({ contribution, onSave, onCancel }: ContributionFormProps) {
  const [type, setType] = useState<'cash' | 'item'>(contribution?.type || 'cash');
  const [amount, setAmount] = useState(contribution?.amount || 0);
  const [itemDescription, setItemDescription] = useState(contribution?.itemDescription || '');
  const [contributorName, setContributorName] = useState(contribution?.contributorName || '');
  const [date, setDate] = useState(() => {
    if (!contribution?.date) return new Date().toISOString().split('T')[0];
    const d = contribution.date as unknown as { _seconds?: number; toDate?: () => Date };
    if (d._seconds) return new Date(d._seconds * 1000).toISOString().split('T')[0];
    if (d.toDate) return d.toDate().toISOString().split('T')[0];
    if (typeof contribution.date === 'string') return new Date(contribution.date).toISOString().split('T')[0];
    return new Date().toISOString().split('T')[0];
  });
  const [note, setNote] = useState(contribution?.note || '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        type,
        amount: type === 'cash' ? amount : undefined,
        itemDescription: type === 'item' ? itemDescription : undefined,
        contributorName: contributorName || undefined,
        date: date as unknown as EventContribution['date'],
        note: note || undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
      <div className="bg-surface border border-border rounded-t-2xl sm:rounded-xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-text-primary">{contribution ? 'Edit Contribution' : 'Add Contribution'}</h3>
            <button type="button" onClick={onCancel} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-background text-text-secondary">
              ✕
            </button>
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">Type</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setType('cash')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${type === 'cash' ? 'bg-success/10 border-success text-success' : 'border-border text-text-secondary hover:border-text-secondary'}`}
              >
                Cash
              </button>
              <button
                type="button"
                onClick={() => setType('item')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${type === 'item' ? 'bg-primary/10 border-primary text-primary' : 'border-border text-text-secondary hover:border-text-secondary'}`}
              >
                Item
              </button>
            </div>
          </div>

          {type === 'cash' && (
            <div>
              <label className="block text-xs text-text-secondary mb-1">Amount</label>
              <CurrencyInput value={amount} onChange={setAmount} />
            </div>
          )}

          {type === 'item' && (
            <div>
              <label className="block text-xs text-text-secondary mb-1">What was given?</label>
              <input
                required
                value={itemDescription}
                onChange={(e) => setItemDescription(e.target.value)}
                placeholder="e.g., 2 cases of beer, Tablecloths"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
              />
            </div>
          )}

          <div>
            <label className="block text-xs text-text-secondary mb-1">From (optional)</label>
            <input
              value={contributorName}
              onChange={(e) => setContributorName(e.target.value)}
              placeholder="e.g., Uncle Joe, Mom & Dad"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
            />
          </div>

          <DateInput label="Date" value={date} onChange={(e) => setDate(e.target.value)} />

          <div>
            <label className="block text-xs text-text-secondary mb-1">Note (optional)</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g., Wedding gift, Towards catering"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-lg border border-border text-text-secondary text-sm font-medium">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || (type === 'cash' && amount <= 0) || (type === 'item' && !itemDescription.trim())}
              className="flex-1 py-2.5 rounded-lg bg-primary text-background font-medium text-sm disabled:opacity-50"
            >
              {saving ? 'Saving...' : contribution ? 'Save Changes' : 'Add Contribution'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// CategoryNode Component (Recursive)
// ============================================================================
interface CategoryNodeProps {
  category: EventCategory;
  depth: number;
  items: EventItem[];
  getChildren: (parentId: string) => EventCategory[];
  hasChildren: (categoryId: string) => boolean;
  getCategoryTotals: (categoryId: string) => { total: number; paid: number; itemCount: number };
  expandedCategories: Set<string>;
  toggleCategory: (id: string) => void;
  parseDate: (d: unknown) => Date;
  onEditCategory: (cat: EventCategory) => void;
  onEditItem: (item: EventItem) => void;
  onDeleteItem: (id: string) => void;
  onAddPayment: (id: string) => void;
  onDeletePayment: (itemId: string, paymentId: string) => void;
  onUpdateNotes: (itemId: string, notes: string) => void;
  onAddItem: (categoryId: string) => void;
  onMoveCategory: (categoryId: string, direction: 'up' | 'down') => void;
  onMoveItem: (itemId: string, direction: 'up' | 'down') => void;
  siblingIndex: number;
  siblingTotal: number;
}

export function CategoryNode({
  category,
  depth,
  items,
  getChildren,
  hasChildren: checkHasChildren,
  getCategoryTotals,
  expandedCategories,
  toggleCategory,
  parseDate,
  onEditCategory,
  onEditItem,
  onDeleteItem,
  onAddPayment,
  onDeletePayment,
  onUpdateNotes,
  onAddItem,
  onMoveCategory,
  onMoveItem,
  siblingIndex,
  siblingTotal,
}: CategoryNodeProps) {
  const isExpanded = expandedCategories.has(category.id);
  const children = getChildren(category.id);
  const isParent = children.length > 0;
  const { total, paid, itemCount } = getCategoryTotals(category.id);

  const directItems = items.filter(i => i.categoryId === category.id).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const paddingLeft = depth === 0 ? 'pl-3' : `pl-${3 + depth * 3}`;
  const isRoot = depth === 0;

  return (
    <div className={isRoot ? 'bg-surface border border-border rounded-xl overflow-hidden' : 'border-b border-border last:border-b-0'}>
      <button onClick={() => toggleCategory(category.id)} className={`w-full flex items-center justify-between p-3 ${paddingLeft} hover:bg-background/50 transition-colors`}>
        <div className="flex items-center gap-2">
          <svg className={`w-4 h-4 text-text-secondary transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className={`${isParent ? 'font-semibold' : 'font-medium'} text-text-primary`}>{category.name}</span>
          <span className="text-xs text-text-secondary">({itemCount} items{isParent ? `, ${children.length} sub` : ''})</span>
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-text-secondary mr-1"><AmountDisplay amount={paid} size="xs" /> / <AmountDisplay amount={total} size="xs" /></span>
          <button onClick={(e) => { e.stopPropagation(); onMoveCategory(category.id, 'up'); }} disabled={siblingIndex === 0} className="p-1 rounded text-text-secondary/50 hover:text-text-secondary hover:bg-background disabled:opacity-30 disabled:cursor-not-allowed" title="Move up">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
          </button>
          <button onClick={(e) => { e.stopPropagation(); onMoveCategory(category.id, 'down'); }} disabled={siblingIndex === siblingTotal - 1} className="p-1 rounded text-text-secondary/50 hover:text-text-secondary hover:bg-background disabled:opacity-30 disabled:cursor-not-allowed" title="Move down">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </button>
          <button onClick={(e) => { e.stopPropagation(); onEditCategory(category); }} className="p-1 rounded text-text-secondary/50 hover:text-text-secondary hover:bg-background" title="Edit">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          </button>
        </div>
      </button>

      {isExpanded && (
        <div className={isRoot ? 'border-t border-border' : 'bg-background/20'}>
          {children.map((child, childIndex) => (
            <CategoryNode
              key={child.id}
              category={child}
              depth={depth + 1}
              items={items}
              getChildren={getChildren}
              hasChildren={checkHasChildren}
              getCategoryTotals={getCategoryTotals}
              expandedCategories={expandedCategories}
              toggleCategory={toggleCategory}
              parseDate={parseDate}
              onEditCategory={onEditCategory}
              onEditItem={onEditItem}
              onDeleteItem={onDeleteItem}
              onAddPayment={onAddPayment}
              onDeletePayment={onDeletePayment}
              onUpdateNotes={onUpdateNotes}
              onAddItem={onAddItem}
              onMoveCategory={onMoveCategory}
              onMoveItem={onMoveItem}
              siblingIndex={childIndex}
              siblingTotal={children.length}
            />
          ))}

          {directItems.length > 0 && (
            <div className={isParent ? 'border-b border-border' : ''}>
              {directItems.map((item, itemIndex) => (
                <div key={item.id} style={{ paddingLeft: `${depth * 12}px` }}>
                  <ItemRow
                    item={item}
                    parseDate={parseDate}
                    onEdit={() => onEditItem(item)}
                    onDelete={() => onDeleteItem(item.id)}
                    onAddPayment={() => onAddPayment(item.id)}
                    onDeletePayment={(paymentId) => onDeletePayment(item.id, paymentId)}
                    onUpdateNotes={(notes) => onUpdateNotes(item.id, notes)}
                    onMove={(direction) => onMoveItem(item.id, direction)}
                    siblingIndex={itemIndex}
                    siblingTotal={directItems.length}
                  />
                </div>
              ))}
            </div>
          )}

          {!isParent && directItems.length === 0 && <p className={`text-sm text-text-secondary text-center py-4 ${paddingLeft}`}>No items yet</p>}

          <button onClick={() => onAddItem(category.id)} className="w-full p-2 text-sm text-primary hover:bg-background/50 flex items-center justify-center gap-1" style={{ paddingLeft: `${(depth + 1) * 12}px` }}>
            <span>+</span> Add Item
          </button>
        </div>
      )}
    </div>
  );
}
