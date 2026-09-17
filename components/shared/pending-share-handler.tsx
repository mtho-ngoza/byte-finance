'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePendingShare } from '@/hooks/use-pending-share';
import { useToast } from '@/components/shared/toast';

/**
 * Component that handles pending share tokens after login.
 * Shows a toast notification when an event is auto-joined.
 */
export function PendingShareHandler() {
  const { joinedEvent, clearJoinedEvent } = usePendingShare();
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    if (joinedEvent) {
      toast(`Joined "${joinedEvent.name}"`, 'success');
      // Navigate to the shared event
      router.push(`/shared/${joinedEvent.ownerId}/${joinedEvent.eventId}`);
      clearJoinedEvent();
    }
  }, [joinedEvent, toast, router, clearJoinedEvent]);

  return null;
}
