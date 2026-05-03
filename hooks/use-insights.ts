import { useEffect, useState, useCallback } from 'react';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserId } from '@/hooks/use-user-id';
import type { Insight } from '@/types';

/**
 * Hook to fetch and subscribe to user insights
 * Filters out dismissed and expired insights
 */
export function useInsights() {
  const userId = useUserId();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, `users/${userId}/insights`),
      where('isDismissed', '==', false),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const now = new Date();
        const data = snap.docs
          .map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }))
          .filter((insight) => {
            // Filter out expired insights
            const expiresAt = (insight as { expiresAt?: { toDate: () => Date } }).expiresAt;
            if (!expiresAt) return true;
            return expiresAt.toDate() > now;
          }) as Insight[];

        setInsights(data);
        setLoading(false);
      },
      (err) => {
        console.error('Insights subscription error:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  /**
   * Mark an insight as read
   */
  const markAsRead = useCallback(async (insightId: string) => {
    try {
      await fetch(`/api/insights/${insightId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRead: true }),
      });
    } catch (err) {
      console.error('Failed to mark insight as read:', err);
    }
  }, []);

  /**
   * Dismiss an insight
   */
  const dismiss = useCallback(async (insightId: string) => {
    try {
      await fetch(`/api/insights/${insightId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDismissed: true }),
      });
    } catch (err) {
      console.error('Failed to dismiss insight:', err);
    }
  }, []);

  /**
   * Snooze an insight for a number of days
   */
  const snooze = useCallback(async (insightId: string, days: number = 7) => {
    const snoozeUntil = new Date();
    snoozeUntil.setDate(snoozeUntil.getDate() + days);

    try {
      await fetch(`/api/insights/${insightId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snoozeUntil: snoozeUntil.toISOString() }),
      });
    } catch (err) {
      console.error('Failed to snooze insight:', err);
    }
  }, []);

  // Separate insights by type
  const alerts = insights.filter((i) => i.type === 'alert');
  const trends = insights.filter((i) => i.type === 'trend');
  const suggestions = insights.filter((i) => i.type === 'suggestion');
  const achievements = insights.filter((i) => i.type === 'achievement');

  // Unread count
  const unreadCount = insights.filter((i) => !i.isRead).length;

  return {
    insights,
    alerts,
    trends,
    suggestions,
    achievements,
    unreadCount,
    loading,
    error,
    markAsRead,
    dismiss,
    snooze,
  };
}
