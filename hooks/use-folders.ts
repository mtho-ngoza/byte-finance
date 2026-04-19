'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserId } from './use-user-id';
import type { Folder } from '@/types';

/** Optimistic folder overrides keyed by folder id */
type OptimisticFolders = Map<string, Partial<Folder>>;

interface UseFoldersResult {
  folders: Folder[];
  loading: boolean;
  /** Apply an optimistic update to a folder before the server round-trip */
  setOptimisticFolder: (id: string, patch: Partial<Folder>) => void;
  /** Remove an optimistic override once the server confirms */
  removeOptimisticFolder: (id: string) => void;
}

export function useFolders(): UseFoldersResult {
  const userId = useUserId();

  const [rawFolders, setRawFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [optimistic, setOptimistic] = useState<OptimisticFolders>(new Map());

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, `users/${userId}/folders`),
      where('isArchived', '==', false),
      orderBy('sortOrder'),
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Folder);
      setRawFolders(docs);
      setLoading(false);
    });

    return unsubscribe;
  }, [userId]);

  // Merge optimistic overrides on top of Firestore data
  const folders = rawFolders.map((f) => {
    const patch = optimistic.get(f.id);
    return patch ? { ...f, ...patch } : f;
  });

  const setOptimisticFolder = (id: string, patch: Partial<Folder>) => {
    setOptimistic((prev) => {
      const next = new Map(prev);
      next.set(id, patch);
      return next;
    });
  };

  const removeOptimisticFolder = (id: string) => {
    setOptimistic((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };

  return { folders, loading, setOptimisticFolder, removeOptimisticFolder };
}
