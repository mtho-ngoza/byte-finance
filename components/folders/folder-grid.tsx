'use client';

import { FolderCard } from './folder-card';
import { Skeleton } from '@/components/shared/skeleton';
import type { Folder } from '@/types';

interface FolderWithStats extends Folder {
  totalBudgeted: number;
  totalPaid: number;
  paidCount: number;
  totalCount: number;
}

interface FolderGridProps {
  folders: FolderWithStats[];
  loading?: boolean;
  onAdd?: () => void;
}

export function FolderGrid({ folders, loading, onAdd }: FolderGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {folders.map((folder) => (
        <FolderCard
          key={folder.id}
          folder={folder}
          totalBudgeted={folder.totalBudgeted}
          totalPaid={folder.totalPaid}
          paidCount={folder.paidCount}
          totalCount={folder.totalCount}
        />
      ))}

      {/* Add folder button */}
      <button
        onClick={onAdd}
        className="rounded-xl border border-dashed border-border bg-transparent p-4 h-36 flex flex-col items-center justify-center gap-2 text-text-secondary hover:border-primary/50 hover:text-primary transition-colors"
        aria-label="Create new folder"
      >
        <span className="text-2xl">+</span>
        <span className="text-sm">New Folder</span>
      </button>
    </div>
  );
}
