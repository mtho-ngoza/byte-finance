'use client';

import { use, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { AmountDisplay } from '@/components/shared/amount-display';
import { CurrencyInput } from '@/components/shared/currency-input';
import { DateInput } from '@/components/shared/date-input';
import type { EventCategory, EventItem, EventPayment } from '@/types';

interface SharedEventPageProps {
  params: Promise<{ token: string }>;
}

interface SharedEvent {
  id: string;
  ownerId?: string;
  name: string;
  description?: string;
  eventDate?: any;
  status: string;
  categories: EventCategory[];
  items: EventItem[];
  totalQuoted: number;
  totalPaid: number;
  remaining: number;
  itemCount: number;
  paidCount: number;
  isSharedView: boolean;
}

export default function SharedEventPage({ params }: SharedEventPageProps) {
  const { token } = use(params);
  const { data: session, status: sessionStatus } = useSession();

  const [event, setEvent] = useState<SharedEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showAddItem, setShowAddItem] = useState<string | null>(null);
  const [showAddPayment, setShowAddPayment] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<EventCategory | null>(null);
  const [editingItem, setEditingItem] = useState<EventItem | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Membership state
  const [membershipStatus, setMembershipStatus] = useState<'none' | 'joining' | 'member'>('none');
  const [joinedEventId, setJoinedEventId] = useState<{ ownerId: string; eventId: string } | null>(null);

  // Check if user is logged in
  const isLoggedIn = sessionStatus === 'authenticated' && !!session?.user?.id;

  useEffect(() => {
    fetchEvent();
  }, [token]);

  // Store share token for PWA install scenario
  useEffect(() => {
    if (token) {
      localStorage.setItem('pending_share_token', token);
    }
  }, [token]);

  // Auto-join when logged in user views share page
  useEffect(() => {
    if (!isLoggedIn || !event) return;
    autoJoinIfNeeded();
  }, [isLoggedIn, event?.id]);

  const autoJoinIfNeeded = async () => {
    // Check if already a member
    try {
      const res = await fetch('/api/memberships');
      if (!res.ok) return;
      const memberships = await res.json();
      const found = memberships.find((m: any) => m.eventId === event?.id);
      if (found) {
        setMembershipStatus('member');
        setJoinedEventId({ ownerId: found.ownerId, eventId: found.eventId });
        // Clear pending token since we're already a member
        localStorage.removeItem('pending_share_token');
      } else {
        // Auto-join since they have access via share link
        await handleJoin();
        // Clear pending token after joining
        localStorage.removeItem('pending_share_token');
      }
    } catch (err) {
      console.error('Failed to check/join membership:', err);
    }
  };

  const handleJoin = async () => {
    setMembershipStatus('joining');
    try {
      const res = await fetch(`/api/share/events/${token}/join`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to join');
      }
      const data = await res.json();
      setMembershipStatus('member');
      setJoinedEventId({ ownerId: data.ownerId, eventId: data.eventId });
      showToast('Joined event successfully!', 'success');
    } catch (err: any) {
      console.error('Failed to join:', err);
      showToast(err.message || 'Failed to join event', 'error');
      setMembershipStatus('none');
    }
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const [refreshing, setRefreshing] = useState(false);

  const fetchEvent = async (forceRefresh = false) => {
    if (forceRefresh) setRefreshing(true);
    try {
      // Add cache-busting param for force refresh
      const url = forceRefresh
        ? `/api/share/events/${token}?_t=${Date.now()}`
        : `/api/share/events/${token}`;
      const res = await fetch(url, {
        cache: 'no-store',
        headers: forceRefresh ? { 'Cache-Control': 'no-cache' } : {},
      });
      if (!res.ok) {
        if (res.status === 404) {
          setError('This share link is invalid or has expired.');
        } else {
          setError('Failed to load event.');
        }
        return;
      }
      const data = await res.json();
      setEvent(data);
      // Categories collapsed by default
    } catch (err) {
      console.error('Failed to fetch event:', err);
      setError('Failed to load event.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleAddCategory = async (data: { name: string }) => {
    try {
      const res = await fetch(`/api/share/events/${token}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to add category');
      const newCategory = await res.json();
      await fetchEvent();
      setShowAddCategory(false);
      setExpandedCategories(prev => new Set([...prev, newCategory.id]));
      showToast('Category added', 'success');
    } catch (err) {
      console.error('Failed to add category:', err);
      showToast('Failed to add category', 'error');
    }
  };

  const handleUpdateCategory = async (categoryId: string, data: any) => {
    try {
      const res = await fetch(`/api/share/events/${token}/categories/${categoryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update');
      await fetchEvent();
      setEditingCategory(null);
      showToast('Category updated', 'success');
    } catch (err) {
      showToast('Failed to update category', 'error');
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    try {
      const res = await fetch(`/api/share/events/${token}/categories/${categoryId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete');
      await fetchEvent();
      showToast('Category deleted', 'success');
    } catch (err) {
      showToast('Failed to delete category', 'error');
    }
  };

  const handleAddItem = async (data: any) => {
    try {
      const res = await fetch(`/api/share/events/${token}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to add item');
      await fetchEvent();
      setShowAddItem(null);
      showToast('Item added', 'success');
    } catch (err) {
      showToast('Failed to add item', 'error');
    }
  };

  const handleUpdateItem = async (itemId: string, data: any) => {
    try {
      const res = await fetch(`/api/share/events/${token}/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update');
      await fetchEvent();
      setEditingItem(null);
      showToast('Item updated', 'success');
    } catch (err) {
      showToast('Failed to update item', 'error');
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      const res = await fetch(`/api/share/events/${token}/items/${itemId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete');
      await fetchEvent();
      showToast('Item deleted', 'success');
    } catch (err) {
      showToast('Failed to delete item', 'error');
    }
  };

  const handleAddPayment = async (itemId: string, data: any) => {
    try {
      const res = await fetch(`/api/share/events/${token}/items/${itemId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to add payment');
      }
      await fetchEvent();
      setShowAddPayment(null);
      showToast('Payment added', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to add payment', 'error');
    }
  };

  const handleDeletePayment = async (itemId: string, paymentId: string) => {
    try {
      const res = await fetch(`/api/share/events/${token}/items/${itemId}/payments/${paymentId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete');
      await fetchEvent();
      showToast('Payment deleted', 'success');
    } catch (err) {
      showToast('Failed to delete payment', 'error');
    }
  };

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const parseDate = (dateValue: unknown): Date => {
    if (!dateValue) return new Date();
    if (typeof dateValue === 'string') return new Date(dateValue);
    if (dateValue instanceof Date) return dateValue;
    if (typeof dateValue === 'object' && '_seconds' in (dateValue as object)) {
      return new Date((dateValue as { _seconds: number })._seconds * 1000);
    }
    return new Date();
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 bg-surface rounded" />
        <div className="h-24 bg-surface rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-4">🔗</div>
        <h1 className="text-xl font-semibold text-text-primary mb-2">Link Not Found</h1>
        <p className="text-sm text-text-secondary">{error}</p>
      </div>
    );
  }

  if (!event) return null;

  const { totalQuoted, totalPaid, remaining, itemCount, paidCount } = event;
  const progressPercent = totalQuoted > 0 ? Math.round((totalPaid / totalQuoted) * 100) : 0;
  const eventDate = event.eventDate ? parseDate(event.eventDate) : null;

  const statusColors: Record<string, string> = {
    planning: 'bg-blue-500/10 text-blue-500',
    confirmed: 'bg-primary/10 text-primary',
    in_progress: 'bg-yellow-500/10 text-yellow-500',
    completed: 'bg-success/10 text-success',
    cancelled: 'bg-text-secondary/10 text-text-secondary',
  };

  return (
    <div className="space-y-4 pb-8">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-sm font-medium ${
          toast.type === 'success' ? 'bg-success text-white' : 'bg-error text-white'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Membership Banner */}
      {membershipStatus === 'member' && joinedEventId ? (
        <div className="bg-success/10 border border-success/20 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-success">✓</span>
              <span className="text-sm text-text-primary">Saved to your account</span>
            </div>
            <Link
              href={`/shared/${joinedEventId.ownerId}/${joinedEventId.eventId}`}
              className="px-3 py-1.5 bg-primary text-background text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
            >
              Open in App
            </Link>
          </div>
        </div>
      ) : isLoggedIn && membershipStatus === 'joining' ? (
        <div className="bg-primary/10 border border-primary/20 rounded-xl p-4">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm text-text-primary">Saving to your account...</span>
          </div>
        </div>
      ) : sessionStatus !== 'loading' && !isLoggedIn ? (
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-text-primary">Save this event to your account</p>
              <p className="text-xs text-text-secondary">Sign in to access it anytime from the app</p>
            </div>
            <Link
              href={`/login?callbackUrl=${encodeURIComponent(`/share/events/${token}`)}`}
              className="px-4 py-2 bg-primary text-background text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      ) : null}

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold text-text-primary">{event.name}</h1>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[event.status] || statusColors.planning}`}>
              {event.status.replace('_', ' ')}
            </span>
          </div>
          {eventDate && (
            <p className="text-sm text-text-secondary mt-0.5">
              {eventDate.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          )}
          {event.description && (
            <p className="text-sm text-text-secondary mt-1">{event.description}</p>
          )}
        </div>
        {/* Refresh button */}
        <button
          onClick={() => fetchEvent(true)}
          disabled={refreshing}
          className="p-2 rounded-lg hover:bg-surface text-text-secondary shrink-0"
          title="Refresh"
        >
          <svg
            className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-surface border border-border rounded-xl p-3">
          <p className="text-xs text-text-secondary mb-0.5">Quoted</p>
          <AmountDisplay amount={totalQuoted} size="sm" />
        </div>
        <div className="bg-surface border border-border rounded-xl p-3">
          <p className="text-xs text-text-secondary mb-0.5">Paid</p>
          <p className="text-success"><AmountDisplay amount={totalPaid} size="sm" /></p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-3">
          <p className="text-xs text-text-secondary mb-0.5">Remaining</p>
          <p className={remaining > 0 ? 'text-error' : 'text-success'}><AmountDisplay amount={remaining} size="sm" /></p>
        </div>
      </div>

      {/* Progress Bar */}
      {totalQuoted > 0 && (
        <div className="bg-surface border border-border rounded-xl p-3">
          <div className="flex justify-between text-xs text-text-secondary mb-2">
            <span>Progress</span>
            <span>{progressPercent}% ({paidCount}/{itemCount} items paid)</span>
          </div>
          <div className="h-2 bg-background rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Categories - Recursive Tree */}
      <div className="space-y-3">
        {(() => {
          const allCategories = event.categories || [];
          const rootCategories = allCategories.filter(c => !c.parentId).sort((a, b) => a.sortOrder - b.sortOrder);
          const getChildren = (parentId: string) =>
            allCategories.filter(c => c.parentId === parentId).sort((a, b) => a.sortOrder - b.sortOrder);
          const hasChildren = (categoryId: string) => allCategories.some(c => c.parentId === categoryId);
          const getDescendantIds = (categoryId: string): string[] => {
            const children = getChildren(categoryId);
            return children.flatMap(c => [c.id, ...getDescendantIds(c.id)]);
          };
          const getCategoryTotals = (categoryId: string) => {
            const descendantIds = [categoryId, ...getDescendantIds(categoryId)];
            const categoryItems = event.items.filter(i => descendantIds.includes(i.categoryId));
            const total = categoryItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
            const paid = categoryItems.reduce((sum, i) => sum + (i.payments || []).reduce((s, p) => s + p.amount, 0), 0);
            return { total, paid, itemCount: categoryItems.length };
          };
          // Leaf categories only (for dropdowns)
          const leafCategories = allCategories.filter(c => !hasChildren(c.id));

          return (
            <>
              {rootCategories.map((category) => (
                <ShareCategoryNode
                  key={category.id}
                  category={category}
                  depth={0}
                  items={event.items}
                  getChildren={getChildren}
                  hasChildren={hasChildren}
                  getCategoryTotals={getCategoryTotals}
                  expandedCategories={expandedCategories}
                  toggleCategory={toggleCategory}
                  parseDate={parseDate}
                  onEditCategory={setEditingCategory}
                  onEditItem={setEditingItem}
                  onDeleteItem={handleDeleteItem}
                  onAddPayment={setShowAddPayment}
                  onDeletePayment={handleDeletePayment}
                  onAddItem={setShowAddItem}
                />
              ))}
            </>
          );
        })()}

        {/* Add Category Button */}
        <button
          onClick={() => setShowAddCategory(true)}
          className="w-full py-2.5 rounded-lg border border-dashed border-border text-text-secondary text-sm hover:border-primary hover:text-primary transition-colors"
        >
          + Add Category
        </button>
      </div>

      {/* Modals */}
      {showAddCategory && (
        <CategoryForm
          onSave={handleAddCategory}
          onCancel={() => setShowAddCategory(false)}
        />
      )}

      {editingCategory && (
        <CategoryForm
          category={editingCategory}
          onSave={(data) => handleUpdateCategory(editingCategory.id, data)}
          onCancel={() => setEditingCategory(null)}
          onDelete={() => { handleDeleteCategory(editingCategory.id); setEditingCategory(null); }}
        />
      )}

      {showAddItem && (() => {
        // Only show leaf categories (no children) in dropdown
        const leafCategories = event.categories.filter(c =>
          !event.categories.some(child => child.parentId === c.id)
        );
        return (
          <ItemForm
            categoryId={showAddItem}
            categories={leafCategories}
            onSave={handleAddItem}
            onCancel={() => setShowAddItem(null)}
          />
        );
      })()}

      {editingItem && (() => {
        // Only show leaf categories (no children) in dropdown
        const leafCategories = event.categories.filter(c =>
          !event.categories.some(child => child.parentId === c.id)
        );
        return (
          <ItemForm
            item={editingItem}
            categories={leafCategories}
            onSave={(data) => handleUpdateItem(editingItem.id, data)}
            onCancel={() => setEditingItem(null)}
          />
        );
      })()}

      {showAddPayment && (
        <PaymentForm
          item={event.items.find(i => i.id === showAddPayment)!}
          onSave={(data) => handleAddPayment(showAddPayment, data)}
          onCancel={() => setShowAddPayment(null)}
        />
      )}
    </div>
  );
}

// Item Row Component
function ItemRow({
  item,
  parseDate,
  onEdit,
  onDelete,
  onAddPayment,
  onDeletePayment,
}: {
  item: EventItem;
  parseDate: (d: unknown) => Date;
  onEdit: () => void;
  onDelete: () => void;
  onAddPayment: () => void;
  onDeletePayment: (paymentId: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showPayments, setShowPayments] = useState(false);

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
              <button
                onClick={onAddPayment}
                className="px-2 py-1 rounded text-xs bg-primary text-background"
              >
                + Pay
              </button>
            )}
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

        {/* Progress */}
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

        {/* Payment history toggle */}
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

      {/* Payment history */}
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

// Payment Row Component
function PaymentRow({
  payment,
  parseDate,
  onDelete,
}: {
  payment: EventPayment & { addedBy?: string };
  parseDate: (d: unknown) => Date;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const date = parseDate(payment.date);

  if (confirmDelete) {
    return (
      <div className="flex items-center justify-between gap-2 bg-error/5 p-2 rounded">
        <span className="text-xs text-text-primary">Delete payment?</span>
        <div className="flex gap-1">
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
    <div className="flex items-center justify-between gap-2 bg-surface p-2 rounded border border-border">
      <div>
        <p className="text-xs font-medium text-success">
          <AmountDisplay amount={payment.amount} size="xs" />
        </p>
        <p className="text-xs text-text-secondary">
          {date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
          {payment.note && ` - ${payment.note}`}
          {(payment as any).addedBy && ` (by ${(payment as any).addedBy})`}
        </p>
      </div>
      <button onClick={() => setConfirmDelete(true)} className="p-1 rounded text-text-secondary/50 hover:text-error">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
}

// Category Form Modal
function CategoryForm({
  category,
  onSave,
  onCancel,
  onDelete,
}: {
  category?: EventCategory;
  onSave: (data: { name: string }) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(category?.name || '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ name });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
      <div className="bg-surface border border-border rounded-t-2xl sm:rounded-xl w-full sm:max-w-md">
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-text-primary">
              {category ? 'Edit Category' : 'Add Category'}
            </h3>
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

// Item Form Modal
function ItemForm({
  item,
  categoryId,
  categories,
  onSave,
  onCancel,
}: {
  item?: EventItem;
  categoryId?: string;
  categories: EventCategory[];
  onSave: (data: any) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(item?.name || '');
  const [vendor, setVendor] = useState(item?.vendor || '');
  const [unitPrice, setUnitPrice] = useState(item?.unitPrice || 0);
  const [quantity, setQuantity] = useState(item?.quantity || 1);
  const [selectedCategoryId, setSelectedCategoryId] = useState(item?.categoryId || categoryId || '');
  const [status, setStatus] = useState(item?.status || 'quoted');
  const [saving, setSaving] = useState(false);

  const subtotal = unitPrice * quantity;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        name,
        vendor,
        unitPrice,
        quantity,
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
            <h3 className="text-base font-semibold text-text-primary">
              {item ? 'Edit Item' : 'Add Item'}
            </h3>
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
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Subtotal display */}
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
                onChange={(e) => setStatus(e.target.value as any)}
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

// Recursive Category Node for nested categories
function ShareCategoryNode({
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
  onAddItem,
}: {
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
  onAddItem: (categoryId: string) => void;
}) {
  const isExpanded = expandedCategories.has(category.id);
  const children = getChildren(category.id);
  const isParent = children.length > 0;
  const { total, paid, itemCount } = getCategoryTotals(category.id);

  // Direct items (only for leaf categories)
  const directItems = items
    .filter(i => i.categoryId === category.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const isRoot = depth === 0;

  return (
    <div className={isRoot ? 'bg-surface border border-border rounded-xl overflow-hidden' : 'border-b border-border last:border-b-0'}>
      {/* Category Header */}
      <button
        onClick={() => toggleCategory(category.id)}
        className={`w-full flex items-center justify-between p-3 hover:bg-background/50 transition-colors`}
        style={{ paddingLeft: `${12 + depth * 12}px` }}
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
          <span className={`${isParent ? 'font-semibold' : 'font-medium'} text-text-primary`}>{category.name}</span>
          <span className="text-xs text-text-secondary">
            {isParent ? `(${children.length})` : `(${directItems.length})`}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-text-secondary">
            <AmountDisplay amount={paid} size="xs" /> / <AmountDisplay amount={total} size="xs" />
          </span>
          {!isParent && (
            <button
              onClick={(e) => { e.stopPropagation(); onEditCategory(category); }}
              className="p-1 rounded text-text-secondary/50 hover:text-text-secondary hover:bg-background"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className={isRoot ? 'border-t border-border' : 'bg-background/20'}>
          {/* Render child categories recursively */}
          {children.map((child) => (
            <ShareCategoryNode
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
              onAddItem={onAddItem}
            />
          ))}

          {/* Render items for leaf categories */}
          {!isParent && (
            <>
              {directItems.length === 0 ? (
                <p className="text-sm text-text-secondary text-center py-4" style={{ paddingLeft: `${depth * 12}px` }}>No items yet</p>
              ) : (
                directItems.map((item) => (
                  <div key={item.id} style={{ paddingLeft: `${depth * 12}px` }}>
                    <ItemRow
                      item={item}
                      parseDate={parseDate}
                      onEdit={() => onEditItem(item)}
                      onDelete={() => onDeleteItem(item.id)}
                      onAddPayment={() => onAddPayment(item.id)}
                      onDeletePayment={(paymentId) => onDeletePayment(item.id, paymentId)}
                    />
                  </div>
                ))
              )}
              <button
                onClick={() => onAddItem(category.id)}
                className="w-full p-2 text-sm text-primary hover:bg-background/50 flex items-center justify-center gap-1"
                style={{ paddingLeft: `${(depth + 1) * 12}px` }}
              >
                <span>+</span> Add Item
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Payment Form Modal
function PaymentForm({
  item,
  onSave,
  onCancel,
}: {
  item: EventItem;
  onSave: (data: any) => Promise<void>;
  onCancel: () => void;
}) {
  const subtotal = item.unitPrice * item.quantity;
  const totalPaid = (item.payments || []).reduce((sum, p) => sum + p.amount, 0);
  const remaining = subtotal - totalPaid;

  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState('');
  const [addedBy, setAddedBy] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ amount, note, addedBy, date });
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
            <label className="block text-xs text-text-secondary mb-1">Your Name (optional)</label>
            <input
              value={addedBy}
              onChange={(e) => setAddedBy(e.target.value)}
              placeholder="e.g., John"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">Amount</label>
            <CurrencyInput value={amount} onChange={setAmount} />
            <button
              type="button"
              onClick={() => setAmount(remaining)}
              className="text-xs text-primary mt-1 hover:underline"
            >
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

          <DateInput
            label="Date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />

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
