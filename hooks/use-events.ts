'use client';

import { useEffect, useState, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserId } from './use-user-id';
import type { Event, EventItem, EventCategory, Project } from '@/types';

/**
 * Extended Event with computed fields
 */
export interface EventWithComputed extends Event {
  /** Total quoted amount (sum of item subtotals) */
  totalQuoted: number;
  /** Total paid amount (sum of all payments) */
  totalPaid: number;
  /** Remaining amount to pay */
  remaining: number;
  /** Total number of items */
  itemCount: number;
  /** Number of fully paid items */
  paidCount: number;
  /** Progress percentage (0-100) */
  progressPercent: number;
  /** Category summaries with computed totals */
  categorySummaries: CategorySummary[];
  /** Linked project (if any) */
  linkedProject?: Project;
}

/**
 * Category with computed totals
 */
export interface CategorySummary extends EventCategory {
  /** Items in this category */
  items: ItemWithComputed[];
  /** Total quoted for this category */
  subtotal: number;
  /** Total paid for this category */
  totalPaid: number;
  /** Remaining for this category */
  remaining: number;
}

/**
 * Extended Item with computed fields
 */
export interface ItemWithComputed extends EventItem {
  /** Computed subtotal (unitPrice * quantity) */
  subtotal: number;
  /** Total paid amount */
  totalPaid: number;
  /** Remaining amount */
  remaining: number;
}

interface UseEventsResult {
  events: EventWithComputed[];
  loading: boolean;
  /** Active events only (not completed or cancelled) */
  activeEvents: EventWithComputed[];
  /** Events by status */
  eventsByStatus: {
    planning: EventWithComputed[];
    confirmed: EventWithComputed[];
    in_progress: EventWithComputed[];
    completed: EventWithComputed[];
    cancelled: EventWithComputed[];
  };
  /** Total quoted across all active events */
  totalQuoted: number;
  /** Total paid across all active events */
  totalPaid: number;
  /** All projects (for linking UI) */
  projects: Project[];
}

/**
 * Compute item totals
 */
function computeItemTotals(item: EventItem): ItemWithComputed {
  const subtotal = item.unitPrice * item.quantity;
  const totalPaid = (item.payments || []).reduce((sum, p) => sum + p.amount, 0);
  const remaining = subtotal - totalPaid;

  return {
    ...item,
    subtotal,
    totalPaid,
    remaining,
  };
}

/**
 * Compute category totals
 */
function computeCategorySummary(
  category: EventCategory,
  items: EventItem[]
): CategorySummary {
  const categoryItems = items
    .filter((i) => i.categoryId === category.id)
    .map(computeItemTotals)
    .sort((a, b) => a.name.localeCompare(b.name));

  const subtotal = categoryItems.reduce((sum, i) => sum + i.subtotal, 0);
  const totalPaid = categoryItems.reduce((sum, i) => sum + i.totalPaid, 0);

  return {
    ...category,
    items: categoryItems,
    subtotal,
    totalPaid,
    remaining: subtotal - totalPaid,
  };
}

export function useEvents(): UseEventsResult {
  const userId = useUserId();
  const [rawEvents, setRawEvents] = useState<Event[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  // Subscribe to events
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, `users/${userId}/events`),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Event);
        setRawEvents(docs);
        setLoading(false);
      },
      (err) => {
        console.error('Events subscription error:', err);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [userId]);

  // Subscribe to projects (for linking UI)
  useEffect(() => {
    if (!userId) return;

    const q = query(
      collection(db, `users/${userId}/projects`),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Project);
        setProjects(docs);
      },
      (err) => {
        console.error('Projects subscription error:', err);
      }
    );

    return unsubscribe;
  }, [userId]);

  // Compute enhanced events with totals
  const events = useMemo(() => {
    return rawEvents.map((event) => {
      const items = event.items || [];
      const categories = event.categories || [];

      // Compute category summaries (sorted alphabetically)
      const categorySummaries = categories
        .map((cat) => computeCategorySummary(cat, items))
        .sort((a, b) => a.name.localeCompare(b.name));

      // Compute event totals
      const itemsWithTotals = items.map(computeItemTotals);
      const totalQuoted = itemsWithTotals.reduce((sum, i) => sum + i.subtotal, 0);
      const totalPaid = itemsWithTotals.reduce((sum, i) => sum + i.totalPaid, 0);
      const remaining = totalQuoted - totalPaid;
      const paidCount = items.filter((i) => i.status === 'paid').length;
      const progressPercent = totalQuoted > 0 ? Math.round((totalPaid / totalQuoted) * 100) : 0;

      // Find linked project
      const linkedProject = event.linkedProjectId
        ? projects.find((p) => p.id === event.linkedProjectId)
        : undefined;

      const enhanced: EventWithComputed = {
        ...event,
        totalQuoted,
        totalPaid,
        remaining,
        itemCount: items.length,
        paidCount,
        progressPercent,
        categorySummaries,
        linkedProject,
      };

      return enhanced;
    });
  }, [rawEvents, projects]);

  // Filter active events (not completed or cancelled)
  const activeEvents = events.filter(
    (e) => e.status !== 'completed' && e.status !== 'cancelled'
  );

  // Group by status
  const eventsByStatus = {
    planning: events.filter((e) => e.status === 'planning'),
    confirmed: events.filter((e) => e.status === 'confirmed'),
    in_progress: events.filter((e) => e.status === 'in_progress'),
    completed: events.filter((e) => e.status === 'completed'),
    cancelled: events.filter((e) => e.status === 'cancelled'),
  };

  // Calculate totals
  const totalQuoted = activeEvents.reduce((sum, e) => sum + e.totalQuoted, 0);
  const totalPaid = activeEvents.reduce((sum, e) => sum + e.totalPaid, 0);

  return {
    events,
    loading,
    activeEvents,
    eventsByStatus,
    totalQuoted,
    totalPaid,
    projects,
  };
}
