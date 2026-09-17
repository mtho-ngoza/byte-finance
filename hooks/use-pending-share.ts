'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFirebaseAuth } from '@/components/providers/firebase-auth-provider';

/**
 * Hook that processes pending share tokens after login.
 * When a user views a share link before logging in, the token is stored.
 * After they log in (e.g., after PWA install), this hook auto-joins that event.
 */
export function usePendingShare() {
  const { userId, ready } = useFirebaseAuth();
  const router = useRouter();
  const [processed, setProcessed] = useState(false);
  const [joinedEvent, setJoinedEvent] = useState<{ name: string; ownerId: string; eventId: string } | null>(null);

  useEffect(() => {
    if (!ready || !userId || processed) return;

    const processPendingShare = async () => {
      const pendingToken = localStorage.getItem('pending_share_token');
      if (!pendingToken) {
        setProcessed(true);
        return;
      }

      try {
        // Try to join the event
        const res = await fetch(`/api/share/events/${pendingToken}/join`, {
          method: 'POST',
        });

        if (res.ok) {
          const data = await res.json();
          // Successfully joined or already a member
          localStorage.removeItem('pending_share_token');
          setJoinedEvent({
            name: data.eventName,
            ownerId: data.ownerId,
            eventId: data.eventId,
          });
        } else {
          // Token invalid or expired, clear it
          localStorage.removeItem('pending_share_token');
        }
      } catch (err) {
        console.error('Failed to process pending share:', err);
        // Don't clear on network error - might be temporary
      } finally {
        setProcessed(true);
      }
    };

    processPendingShare();
  }, [ready, userId, processed]);

  const clearJoinedEvent = () => setJoinedEvent(null);

  return { joinedEvent, clearJoinedEvent };
}
