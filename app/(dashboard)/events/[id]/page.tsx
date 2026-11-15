'use client';

import { use, useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AmountDisplay } from '@/components/shared/amount-display';
import { useToast } from '@/components/shared/toast';
import { generateEventPDF } from '@/lib/pdf-export';
import type { Event, EventCategory, EventItem, EventContribution, Project } from '@/types';
import {
  ItemRow,
  EditEventForm,
  CategoryForm,
  ItemForm,
  PaymentForm,
  ShareModal,
  ContributionsSection,
  ContributionForm,
  CategoryNode,
} from './components/event-components';

interface EventDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function EventDetailPage({ params }: EventDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();

  const [event, setEvent] = useState<Event | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditEvent, setShowEditEvent] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  // Filters
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterVendor, setFilterVendor] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showAddItem, setShowAddItem] = useState<string | null>(null); // categoryId
  const [showAddPayment, setShowAddPayment] = useState<string | null>(null); // itemId
  const [editingCategory, setEditingCategory] = useState<EventCategory | null>(null);
  const [editingItem, setEditingItem] = useState<EventItem | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showAddContribution, setShowAddContribution] = useState(false);
  const [editingContribution, setEditingContribution] = useState<EventContribution | null>(null);

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    try {
      const [eventRes, projectsRes] = await Promise.all([
        fetch(`/api/events/${id}`),
        fetch('/api/projects'),
      ]);
      if (!eventRes.ok) throw new Error('Event not found');
      const eventData = await eventRes.json();
      setEvent(eventData);
      // Categories collapsed by default (empty set)

      if (projectsRes.ok) {
        const projectsData = await projectsRes.json();
        setProjects(projectsData.projects || []);
      }
    } catch (error) {
      console.error('Failed to fetch event:', error);
      toast('Event not found', 'error');
      router.push('/projects');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateEvent = async (data: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/events/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update');
      await fetchData();
      setShowEditEvent(false);
      toast('Event updated', 'success');
    } catch (error) {
      console.error('Failed to update event:', error);
      toast('Failed to update event', 'error');
    }
  };

  const handleAddCategory = async (data: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/events/${id}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to add category');
      const newCategory = await res.json();
      await fetchData();
      setShowAddCategory(false);
      setExpandedCategories(prev => new Set([...prev, newCategory.id]));
      toast('Category added', 'success');
    } catch (error) {
      console.error('Failed to add category:', error);
      toast('Failed to add category', 'error');
    }
  };

  const handleUpdateCategory = async (categoryId: string, data: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/events/${id}/categories/${categoryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update');
      await fetchData();
      setEditingCategory(null);
      toast('Category updated', 'success');
    } catch (error) {
      console.error('Failed to update category:', error);
      toast('Failed to update category', 'error');
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    try {
      const res = await fetch(`/api/events/${id}/categories/${categoryId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete');
      await fetchData();
      toast('Category deleted', 'success');
    } catch (error) {
      console.error('Failed to delete category:', error);
      toast('Failed to delete category', 'error');
    }
  };

  const handleAddItem = async (data: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/events/${id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to add item');
      await fetchData();
      setShowAddItem(null);
      toast('Item added', 'success');
    } catch (error) {
      console.error('Failed to add item:', error);
      toast('Failed to add item', 'error');
    }
  };

  const handleUpdateItem = async (itemId: string, data: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/events/${id}/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update');
      await fetchData();
      setEditingItem(null);
      toast('Item updated', 'success');
    } catch (error) {
      console.error('Failed to update item:', error);
      toast('Failed to update item', 'error');
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      const res = await fetch(`/api/events/${id}/items/${itemId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete');
      await fetchData();
      toast('Item deleted', 'success');
    } catch (error) {
      console.error('Failed to delete item:', error);
      toast('Failed to delete item', 'error');
    }
  };

  const handleAddPayment = async (itemId: string, data: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/events/${id}/items/${itemId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to add payment');
      }
      await fetchData();
      setShowAddPayment(null);
      toast('Payment added', 'success');
    } catch (error) {
      console.error('Failed to add payment:', error);
      toast(error instanceof Error ? error.message : 'Failed to add payment', 'error');
    }
  };

  const handleDeletePayment = async (itemId: string, paymentId: string) => {
    try {
      const res = await fetch(`/api/events/${id}/items/${itemId}/payments/${paymentId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete');
      await fetchData();
      toast('Payment deleted', 'success');
    } catch (error) {
      console.error('Failed to delete payment:', error);
      toast('Failed to delete payment', 'error');
    }
  };

  const handleUpdateItemNotes = async (itemId: string, notes: string) => {
    try {
      const res = await fetch(`/api/events/${id}/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) throw new Error('Failed to update');
      await fetchData();
      toast('Notes saved', 'success');
    } catch (error) {
      console.error('Failed to save notes:', error);
      toast('Failed to save notes', 'error');
    }
  };

  const handleMoveCategory = async (categoryId: string, direction: 'up' | 'down') => {
    if (!event) return;
    const allCategories = event.categories || [];
    const category = allCategories.find(c => c.id === categoryId);
    if (!category) return;

    // Get siblings (same parent level)
    const siblings = allCategories
      .filter(c => c.parentId === category.parentId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    const currentIndex = siblings.findIndex(c => c.id === categoryId);
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    if (targetIndex < 0 || targetIndex >= siblings.length) return;

    // Swap sortOrders
    const targetCategory = siblings[targetIndex];
    const currentSortOrder = category.sortOrder ?? currentIndex;
    const targetSortOrder = targetCategory.sortOrder ?? targetIndex;

    try {
      // Update both categories
      await Promise.all([
        fetch(`/api/events/${id}/categories/${categoryId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sortOrder: targetSortOrder }),
        }),
        fetch(`/api/events/${id}/categories/${targetCategory.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sortOrder: currentSortOrder }),
        }),
      ]);
      await fetchData();
    } catch (error) {
      console.error('Failed to reorder category:', error);
      toast('Failed to reorder', 'error');
    }
  };

  const handleMoveItem = async (itemId: string, direction: 'up' | 'down') => {
    if (!event) return;
    const allItems = event.items || [];
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;

    // Get siblings (same category)
    const siblings = allItems
      .filter(i => i.categoryId === item.categoryId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    const currentIndex = siblings.findIndex(i => i.id === itemId);
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    if (targetIndex < 0 || targetIndex >= siblings.length) return;

    // Swap sortOrders
    const targetItem = siblings[targetIndex];
    const currentSortOrder = item.sortOrder ?? currentIndex;
    const targetSortOrder = targetItem.sortOrder ?? targetIndex;

    try {
      // Update both items
      await Promise.all([
        fetch(`/api/events/${id}/items/${itemId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sortOrder: targetSortOrder }),
        }),
        fetch(`/api/events/${id}/items/${targetItem.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sortOrder: currentSortOrder }),
        }),
      ]);
      await fetchData();
    } catch (error) {
      console.error('Failed to reorder item:', error);
      toast('Failed to reorder', 'error');
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

  // Contribution handlers
  const handleAddContribution = async (data: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/events/${id}/contributions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to add contribution');
      await fetchData();
      setShowAddContribution(false);
      toast('Contribution added', 'success');
    } catch (error) {
      console.error('Failed to add contribution:', error);
      toast('Failed to add contribution', 'error');
    }
  };

  const handleUpdateContribution = async (contributionId: string, data: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/events/${id}/contributions/${contributionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update contribution');
      await fetchData();
      setEditingContribution(null);
      toast('Contribution updated', 'success');
    } catch (error) {
      console.error('Failed to update contribution:', error);
      toast('Failed to update contribution', 'error');
    }
  };

  const handleDeleteContribution = async (contributionId: string) => {
    try {
      const res = await fetch(`/api/events/${id}/contributions/${contributionId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete contribution');
      await fetchData();
      toast('Contribution deleted', 'success');
    } catch (error) {
      console.error('Failed to delete contribution:', error);
      toast('Failed to delete contribution', 'error');
    }
  };

  const allCategories = event?.categories || [];
  const allItems = event?.items || [];

  // Extract unique vendors for filter dropdown (must be before early returns - rules of hooks)
  const uniqueVendors = useMemo(() => {
    const vendors = new Set<string>();
    allItems.forEach(item => {
      if (item.vendor) vendors.add(item.vendor);
    });
    return Array.from(vendors).sort();
  }, [allItems]);

  // Get all descendant category IDs (for filtering)
  const getDescendantIds = (categoryId: string): string[] => {
    const children = allCategories.filter(c => c.parentId === categoryId);
    return children.flatMap(c => [c.id, ...getDescendantIds(c.id)]);
  };

  // Apply filters to items (must be before early returns - rules of hooks)
  const filteredItems = useMemo(() => {
    return allItems.filter(item => {
      // Category filter
      if (filterCategory !== 'all') {
        const categoryIds = [filterCategory, ...getDescendantIds(filterCategory)];
        if (!categoryIds.includes(item.categoryId)) return false;
      }

      // Vendor filter
      if (filterVendor !== 'all') {
        if (item.vendor !== filterVendor) return false;
      }

      // Status filter
      if (filterStatus !== 'all') {
        if (filterStatus === 'unpaid') {
          // Unpaid = not paid and not cancelled
          if (item.status === 'paid' || item.status === 'cancelled') return false;
        } else {
          if (item.status !== filterStatus) return false;
        }
      }

      return true;
    });
  }, [allItems, filterCategory, filterVendor, filterStatus, allCategories]);

  const isFiltered = filterCategory !== 'all' || filterVendor !== 'all' || filterStatus !== 'all';

  if (loading) {
    return <div className="animate-pulse space-y-4"><div className="h-8 w-48 bg-surface rounded" /></div>;
  }

  if (!event) return null;

  // Get root categories (no parent) and helper to get children - sorted by sortOrder
  const rootCategories = allCategories
    .filter(c => !c.parentId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const getChildren = (parentId: string) =>
    allCategories
      .filter(c => c.parentId === parentId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  // Check if category has children (is a parent/group)
  const hasChildren = (categoryId: string) => allCategories.some(c => c.parentId === categoryId);

  // Calculate totals for a category (including all descendants) - uses filtered items
  const getCategoryTotals = (categoryId: string) => {
    const descendantIds = [categoryId, ...getDescendantIds(categoryId)];
    const categoryItems = filteredItems.filter(i => descendantIds.includes(i.categoryId));
    const total = categoryItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
    const paid = categoryItems.reduce((sum, i) => sum + (i.payments || []).reduce((s, p) => s + p.amount, 0), 0);
    const itemCount = categoryItems.length;
    return { total, paid, itemCount };
  };

  // For modal dropdowns - all categories can have items
  const categories = allCategories;

  // Compute totals from filtered items
  let totalQuoted = 0;
  let totalPaid = 0;
  let paidCount = 0;

  for (const item of filteredItems) {
    const subtotal = item.unitPrice * item.quantity;
    totalQuoted += subtotal;
    const itemPaid = (item.payments || []).reduce((sum, p) => sum + p.amount, 0);
    totalPaid += itemPaid;
    if (item.status === 'paid') paidCount++;
  }

  const remaining = totalQuoted - totalPaid;
  const progressPercent = totalQuoted > 0 ? Math.round((totalPaid / totalQuoted) * 100) : 0;

  // Clear all filters
  const clearFilters = () => {
    setFilterCategory('all');
    setFilterVendor('all');
    setFilterStatus('all');
  };

  // Handle export - exports filtered items
  const handleExport = () => {
    const selectedIds = filteredItems.map(i => i.id);
    generateEventPDF(event, selectedIds);
  };

  const parseDate = (dateValue: unknown): Date => {
    if (!dateValue) return new Date();
    if (typeof dateValue === 'string') return new Date(dateValue);
    if (dateValue instanceof Date) return dateValue;
    if (typeof dateValue === 'object' && '_seconds' in (dateValue as object)) {
      return new Date((dateValue as { _seconds: number })._seconds * 1000);
    }
    if (typeof dateValue === 'object' && 'toDate' in (dateValue as object)) {
      return (dateValue as { toDate: () => Date }).toDate();
    }
    return new Date();
  };

  const eventDate = event.eventDate ? parseDate(event.eventDate) : null;
  const linkedProject = projects.find(p => p.id === event.linkedProjectId);

  const statusColors: Record<string, string> = {
    planning: 'bg-blue-500/10 text-blue-500',
    confirmed: 'bg-primary/10 text-primary',
    in_progress: 'bg-yellow-500/10 text-yellow-500',
    completed: 'bg-success/10 text-success',
    cancelled: 'bg-text-secondary/10 text-text-secondary',
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-text-primary">{event.name}</h1>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[event.status]}`}>
              {event.status.replace('_', ' ')}
            </span>
          </div>
          {eventDate && (
            <p className="text-sm text-text-secondary mt-0.5">
              {eventDate.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          )}
          {linkedProject && (
            <Link href={`/projects/${linkedProject.id}`} className="text-xs text-primary hover:underline">
              Linked to: {linkedProject.name}
            </Link>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowShareModal(true)}
            className={`p-2 rounded-lg hover:bg-surface ${event.shareToken ? 'text-primary' : 'text-text-secondary'}`}
            title="Share event"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
          </button>
          <button
            onClick={handleExport}
            className="p-2 rounded-lg hover:bg-surface text-text-secondary"
            title={isFiltered ? `Export filtered (${filteredItems.length} items)` : 'Export as PDF'}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </button>
          <button
            onClick={() => setShowEditEvent(true)}
            className="p-2 rounded-lg hover:bg-surface text-text-secondary"
            title="Edit event"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        </div>
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
            <span>Progress{isFiltered && ' (filtered)'}</span>
            <span>{progressPercent}% ({paidCount}/{filteredItems.length} items paid)</span>
          </div>
          <div className="h-2 bg-background rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-surface border border-border rounded-xl p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-text-secondary shrink-0">Filter:</span>

          {/* Category Filter */}
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-2 py-1.5 rounded-lg border border-border bg-background text-text-primary text-xs focus:outline-none focus:border-primary"
          >
            <option value="all">All Categories</option>
            {allCategories
              .sort((a, b) => a.name.localeCompare(b.name))
              .map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
          </select>

          {/* Vendor Filter */}
          <select
            value={filterVendor}
            onChange={(e) => setFilterVendor(e.target.value)}
            className="px-2 py-1.5 rounded-lg border border-border bg-background text-text-primary text-xs focus:outline-none focus:border-primary"
          >
            <option value="all">All Vendors</option>
            {uniqueVendors.map(vendor => (
              <option key={vendor} value={vendor}>{vendor}</option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-2 py-1.5 rounded-lg border border-border bg-background text-text-primary text-xs focus:outline-none focus:border-primary"
          >
            <option value="all">All Status</option>
            <option value="quoted">Quoted</option>
            <option value="confirmed">Confirmed</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
            <option value="cancelled">Cancelled</option>
          </select>

          {/* Clear Filters */}
          {isFiltered && (
            <button
              onClick={clearFilters}
              className="px-2 py-1.5 rounded-lg text-xs text-primary hover:bg-primary/10 flex items-center gap-1"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Clear
            </button>
          )}

          {/* Item count */}
          <span className="text-xs text-text-secondary ml-auto">
            {filteredItems.length} of {allItems.length} items
          </span>
        </div>
      </div>

      {/* Categories - Recursive Tree */}
      <div className="space-y-3">
        {rootCategories.map((category, index) => (
          <CategoryNode
            key={category.id}
            category={category}
            depth={0}
            items={filteredItems}
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
            onUpdateNotes={handleUpdateItemNotes}
            onAddItem={setShowAddItem}
            onMoveCategory={handleMoveCategory}
            onMoveItem={handleMoveItem}
            siblingIndex={index}
            siblingTotal={rootCategories.length}
          />
        ))}

        {/* Add Category Button */}
        <button
          onClick={() => setShowAddCategory(true)}
          className="w-full py-2.5 rounded-lg border border-dashed border-border text-text-secondary text-sm hover:border-primary hover:text-primary transition-colors"
        >
          + Add Category
        </button>
      </div>

      {/* Contributions / Izipheko Section */}
      <ContributionsSection
        contributions={event.contributions || []}
        parseDate={parseDate}
        onAdd={() => setShowAddContribution(true)}
        onEdit={setEditingContribution}
        onDelete={handleDeleteContribution}
      />

      {/* Modals */}
      {showEditEvent && (
        <EditEventForm
          event={event}
          projects={projects}
          parseDate={parseDate}
          onSave={handleUpdateEvent}
          onCancel={() => setShowEditEvent(false)}
        />
      )}

      {showAddCategory && (
        <CategoryForm
          allCategories={allCategories}
          onSave={handleAddCategory}
          onCancel={() => setShowAddCategory(false)}
        />
      )}

      {editingCategory && (
        <CategoryForm
          category={editingCategory}
          allCategories={allCategories}
          onSave={(data) => handleUpdateCategory(editingCategory.id, data)}
          onCancel={() => setEditingCategory(null)}
          onDelete={() => { handleDeleteCategory(editingCategory.id); setEditingCategory(null); }}
        />
      )}

      {showAddItem && (
        <ItemForm
          categoryId={showAddItem}
          categories={categories}
          onSave={handleAddItem}
          onCancel={() => setShowAddItem(null)}
        />
      )}

      {editingItem && (
        <ItemForm
          item={editingItem}
          categories={categories}
          onSave={(data) => handleUpdateItem(editingItem.id, data)}
          onCancel={() => setEditingItem(null)}
        />
      )}

      {showAddPayment && (
        <PaymentForm
          item={allItems.find(i => i.id === showAddPayment)!}
          onSave={(data) => handleAddPayment(showAddPayment, data)}
          onCancel={() => setShowAddPayment(null)}
        />
      )}

      {showShareModal && (
        <ShareModal
          eventId={id}
          shareToken={event.shareToken}
          onClose={() => setShowShareModal(false)}
          onUpdate={fetchData}
        />
      )}

      {showAddContribution && (
        <ContributionForm
          onSave={handleAddContribution}
          onCancel={() => setShowAddContribution(false)}
        />
      )}

      {editingContribution && (
        <ContributionForm
          contribution={editingContribution}
          onSave={(data) => handleUpdateContribution(editingContribution.id, data)}
          onCancel={() => setEditingContribution(null)}
        />
      )}
    </div>
  );
}
