import { create } from 'zustand';
import type { Expense } from '@/types';

type ActiveFilter = 'all' | 'personal' | 'business';
type SyncStatus = 'online' | 'offline' | 'syncing';

interface AppState {
  activeFilter: ActiveFilter;
  optimisticExpenses: Map<string, Expense>;
  syncStatus: SyncStatus;
  dismissedInsights: Set<string>;

  setActiveFilter: (filter: ActiveFilter) => void;
  setOptimisticExpense: (id: string, expense: Expense) => void;
  removeOptimisticExpense: (id: string) => void;
  setSyncStatus: (status: SyncStatus) => void;
  addDismissedInsight: (id: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeFilter: 'all',
  optimisticExpenses: new Map(),
  syncStatus: 'online',
  dismissedInsights: new Set(),

  setActiveFilter: (filter) => set({ activeFilter: filter }),

  setOptimisticExpense: (id, expense) =>
    set((state) => {
      const next = new Map(state.optimisticExpenses);
      next.set(id, expense);
      return { optimisticExpenses: next };
    }),

  removeOptimisticExpense: (id) =>
    set((state) => {
      const next = new Map(state.optimisticExpenses);
      next.delete(id);
      return { optimisticExpenses: next };
    }),

  setSyncStatus: (status) => set({ syncStatus: status }),

  addDismissedInsight: (id) =>
    set((state) => {
      const next = new Set(state.dismissedInsights);
      next.add(id);
      return { dismissedInsights: next };
    }),
}));
