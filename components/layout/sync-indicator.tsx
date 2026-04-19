'use client';

import { useAppStore } from '@/stores/app-store';

export function SyncIndicator() {
  const syncStatus = useAppStore((s) => s.syncStatus);

  const config = {
    online: { color: 'bg-primary', label: 'Online' },
    syncing: { color: 'bg-warning animate-pulse', label: 'Syncing' },
    offline: { color: 'bg-danger', label: 'Offline' },
  }[syncStatus];

  return (
    <div className="flex items-center gap-1.5" title={config.label}>
      <span className={`h-2 w-2 rounded-full ${config.color}`} />
      <span className="text-xs text-text-secondary hidden sm:inline">{config.label}</span>
    </div>
  );
}
