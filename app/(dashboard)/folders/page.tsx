'use client';

import { useState, useEffect } from 'react';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserId } from '@/hooks/use-user-id';
import { useFolders } from '@/hooks/use-folders';
import { FolderGrid } from '@/components/folders/folder-grid';
import { FolderForm } from '@/components/folders/folder-form';
import type { Expense, Folder } from '@/types';

interface FolderStats {
  totalBudgeted: number;
  totalPaid: number;
  paidCount: number;
  totalCount: number;
}

export default function FoldersPage() {
  const userId = useUserId();

  const { folders, loading } = useFolders();
  const [showForm, setShowForm] = useState(false);

  // Live expense stats per folder
  const [statsMap, setStatsMap] = useState<Map<string, FolderStats>>(new Map());

  useEffect(() => {
    if (!userId || folders.length === 0) return;

    // Listen to all expenses for this user and compute stats per folder
    const q = query(
      collection(db, `users/${userId}/expenses`),
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const expenses = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Expense);

      const next = new Map<string, FolderStats>();
      for (const expense of expenses) {
        const fid = expense.folderId;
        if (!next.has(fid)) {
          next.set(fid, { totalBudgeted: 0, totalPaid: 0, paidCount: 0, totalCount: 0 });
        }
        const stats = next.get(fid)!;
        stats.totalBudgeted += expense.amount;
        stats.totalCount += 1;
        if (expense.status === 'paid') {
          stats.totalPaid += expense.amount;
          stats.paidCount += 1;
        }
      }
      setStatsMap(next);
    });

    return unsubscribe;
  }, [userId, folders.length]);

  const handleCreate = async (values: {
    name: string;
    type: Folder['type'];
    icon?: string;
    color?: string;
    period?: { month: number; year: number };
    income?: { amount: number; source?: string; verified: boolean };
  }) => {
    await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...values, sortOrder: folders.length }),
    });
    setShowForm(false);
  };

  const foldersWithStats = folders.map((f) => {
    const stats = statsMap.get(f.id) ?? {
      totalBudgeted: 0,
      totalPaid: 0,
      paidCount: 0,
      totalCount: 0,
    };
    return { ...f, ...stats };
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-text-primary">Folders</h1>
      </div>

      {showForm && (
        <div className="mb-6 rounded-xl border border-border bg-surface p-4">
          <h2 className="text-base font-semibold text-text-primary mb-4">New Folder</h2>
          <FolderForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
        </div>
      )}

      <FolderGrid
        folders={foldersWithStats}
        loading={loading}
        onAdd={() => setShowForm(true)}
      />
    </div>
  );
}
