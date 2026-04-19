'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserId } from './use-user-id';
import { useAppStore } from '@/stores/app-store';
import type { Expense } from '@/types';

interface UseExpensesResult {
  expenses: Expense[];
  loading: boolean;
}

export function useExpenses(folderId: string): UseExpensesResult {
  const userId = useUserId();

  const [rawExpenses, setRawExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  const optimistic = useAppStore((s) => s.optimisticExpenses);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, `users/${userId}/expenses`),
      where('folderId', '==', folderId),
      orderBy('sortOrder'),
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Expense);
      setRawExpenses(docs);
      setLoading(false);
    });

    return unsubscribe;
  }, [userId, folderId]);

  // Merge optimistic overrides on top of Firestore data
  const expenses = rawExpenses.map((e) => optimistic.get(e.id) ?? e);

  return { expenses, loading };
}
