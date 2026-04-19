'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/stores/app-store';

export function useOfflineStatus() {
  const syncStatus = useAppStore((s) => s.syncStatus);
  const setSyncStatus = useAppStore((s) => s.setSyncStatus);

  useEffect(() => {
    // Set initial status based on current navigator.onLine
    setSyncStatus(navigator.onLine ? 'online' : 'offline');

    const handleOnline = () => setSyncStatus('online');
    const handleOffline = () => setSyncStatus('offline');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setSyncStatus]);

  return syncStatus;
}
