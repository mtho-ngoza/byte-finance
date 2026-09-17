'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AmountDisplay } from '@/components/shared/amount-display';
import { CurrencyInput } from '@/components/shared/currency-input';
import { DateInput } from '@/components/shared/date-input';
import { useToast } from '@/components/shared/toast';
import type { EventCategory, EventItem, EventPayment, EventMember } from '@/types';

interface SharedEventPageProps {
  params: Promise<{ ownerId: string; eventId: string }>;
}

interface SharedEventData {
  id: string;
  ownerId: string;
  name: string;
  description?: string;
  eventDate?: any;
  status: string;
  categories: EventCategory[];
  items: EventItem[];
  members: EventMember[];
  totalQuoted: number;
  totalPaid: number;
  remaining: number;
  itemCount: number;
  paidCount: number;
  role: 'owner' | 'editor' | 'viewer';
  isOwner: boolean;
}

export default function SharedEventPage({ params }: SharedEventPageProps) {
  const { ownerId, eventId } = use(params);
  const router = useRouter();
  const { toast } = useToast();

  const [event, setEvent] = useState<SharedEventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showAddItem, setShowAddItem] = useState<string | null>(null);
  const [showAddPayment, setShowAddPayment] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<EventCategory | null>(null);
  const [editingItem, setEditingItem] = useState<EventItem | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    fetchEvent();
  }, [ownerId, eventId]);

  const fetchEvent = async () => {
    try {
      const res = await fetch(`/api/shared-events/${ownerId}/${eventId}`);
      if (!res.ok) {
        if (res.status === 403) {
          toast('Access denied', 'error');
        } else {
          toast('Event not found', 'error');
        }
        router.push('/projects');
        return;
      }
      const data = await res.json();
      setEvent(data);
      setExpandedCategories(new Set((data.categories || []).map((c: EventCategory) => c.id)));
    } catch (error) {
      console.error('Failed to fetch event:', error);
      toast('Failed to load event', 'error');
      router.push('/projects');
    } finally {
      setLoading(false);
    }
  };

  const handleLeave = async () => {
    setLeaving(true);
    try {
      // Find membership ID first
      const membershipsRes = await fetch('/api/memberships');
      if (!membershipsRes.ok) throw new Error('Failed to get memberships');
      const memberships = await membershipsRes.json();
      const membership = memberships.find((m: any) => m.eventId === eventId && m.ownerId === ownerId);

      if (!membership) {
        toast('Membership not found', 'error');
        return;
      }

      const res = await fetch(`/api/memberships/${membership.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to leave');
      toast('Left event', 'success');
      router.push('/projects');
    } catch (error) {
      console.error('Failed to leave:', error);
      toast('Failed to leave event', 'error');
    } finally {
      setLeaving(false);
      setShowLeaveConfirm(false);
    }
  };

  // For now, we'll use server-side routes for modifications
  // This keeps the data in the owner's collection
  const handleAddCategory = async (data: { name: string }) => {
    if (!event) return;
    try {
      // We need to add a route that allows members to modify shared events
      // For now, show a toast that this needs the share link
      toast('Use the share link to modify', 'info');
    } catch (error) {
      toast('Failed to add category', 'error');
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

  if (!event) return null;

  const { totalQuoted, totalPaid, remaining, itemCount, paidCount, role } = event;
  const progressPercent = totalQuoted > 0 ? Math.round((totalPaid / totalQuoted) * 100) : 0;
  const eventDate = event.eventDate ? parseDate(event.eventDate) : null;
  const canEdit = role === 'owner' || role === 'editor';

  const statusColors: Record<string, string> = {
    planning: 'bg-blue-500/10 text-blue-500',
    confirmed: 'bg-primary/10 text-primary',
    in_progress: 'bg-yellow-500/10 text-yellow-500',
    completed: 'bg-success/10 text-success',
    cancelled: 'bg-text-secondary/10 text-text-secondary',
  };

  return (
    <div className="space-y-4 pb-8">
      {/* Back + Actions */}
      <div className="flex items-center justify-between">
        <Link href="/projects" className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Link>
        <div className="flex items-center gap-2">
          <span className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-full">
            Shared · {role}
          </span>
          {!event.isOwner && (
            <button
              onClick={() => setShowLeaveConfirm(true)}
              className="px-3 py-1 text-sm text-error hover:bg-error/10 rounded-lg transition-colors"
            >
              Leave
            </button>
          )}
        </div>
      </div>

      {/* Header */}
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

      {/* Members */}
      {event.members && event.members.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-3">
          <p className="text-xs text-text-secondary mb-2">Members ({event.members.length})</p>
          <div className="flex flex-wrap gap-2">
            {event.members.map((member, idx) => (
              <span
                key={idx}
                className="px-2 py-1 bg-background rounded text-xs text-text-primary"
              >
                {member.name || member.email}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Categories */}
      <div className="space-y-3">
        {event.categories.map((category) => {
          const categoryItems = event.items
            .filter(i => i.categoryId === category.id)
            .sort((a, b) => a.sortOrder - b.sortOrder);
          const categoryTotal = categoryItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
          const categoryPaid = categoryItems.reduce((sum, i) => {
            return sum + (i.payments || []).reduce((s, p) => s + p.amount, 0);
          }, 0);
          const isExpanded = expandedCategories.has(category.id);

          return (
            <div key={category.id} className="bg-surface border border-border rounded-xl overflow-hidden">
              {/* Category Header */}
              <button
                onClick={() => toggleCategory(category.id)}
                className="w-full flex items-center justify-between p-3 hover:bg-background/50 transition-colors"
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
                  <span className="font-medium text-text-primary">{category.name}</span>
                  <span className="text-xs text-text-secondary">({categoryItems.length})</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-text-secondary">
                    <AmountDisplay amount={categoryPaid} size="xs" /> / <AmountDisplay amount={categoryTotal} size="xs" />
                  </span>
                </div>
              </button>

              {/* Items */}
              {isExpanded && (
                <div className="border-t border-border">
                  {categoryItems.length === 0 ? (
                    <p className="text-sm text-text-secondary text-center py-4">No items</p>
                  ) : (
                    categoryItems.map((item) => (
                      <ItemRow key={item.id} item={item} parseDate={parseDate} />
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Edit hint */}
      {canEdit && (
        <div className="bg-surface/50 border border-border rounded-xl p-4 text-center">
          <p className="text-sm text-text-secondary">
            To add items or payments, use the share link you joined with
          </p>
        </div>
      )}

      {/* Leave Confirmation */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-xl p-4 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-text-primary mb-2">Leave Event?</h3>
            <p className="text-sm text-text-secondary mb-4">
              You&apos;ll no longer see this event in your account. You can rejoin using the share link.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowLeaveConfirm(false)}
                className="flex-1 py-2 rounded-lg border border-border text-text-secondary text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleLeave}
                disabled={leaving}
                className="flex-1 py-2 rounded-lg bg-error text-white text-sm disabled:opacity-50"
              >
                {leaving ? 'Leaving...' : 'Leave'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Simple read-only item row
function ItemRow({
  item,
  parseDate,
}: {
  item: EventItem;
  parseDate: (d: unknown) => Date;
}) {
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

  return (
    <div className="border-b border-border last:border-b-0 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${statusColors[item.status]}`}>{item.name}</span>
            {item.status === 'paid' && <span className="text-xs text-success">✓</span>}
          </div>
          {item.vendor && <p className="text-xs text-text-secondary">{item.vendor}</p>}
          <p className="text-xs text-text-secondary">
            {item.quantity} × <AmountDisplay amount={item.unitPrice} size="xs" /> = <AmountDisplay amount={subtotal} size="xs" />
          </p>
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
        <>
          <button
            onClick={() => setShowPayments(!showPayments)}
            className="text-xs text-primary mt-2 flex items-center gap-1"
          >
            {showPayments ? 'Hide' : 'Show'} payments ({item.payments!.length})
          </button>
          {showPayments && (
            <div className="mt-2 space-y-1">
              {item.payments!.map((payment) => {
                const date = parseDate(payment.date);
                return (
                  <div key={payment.id} className="flex items-center justify-between bg-background p-2 rounded text-xs">
                    <span className="text-success"><AmountDisplay amount={payment.amount} size="xs" /></span>
                    <span className="text-text-secondary">
                      {date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                      {payment.note && ` - ${payment.note}`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
