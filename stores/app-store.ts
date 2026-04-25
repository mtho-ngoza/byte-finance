import { create } from 'zustand';
import type { CycleItem } from '@/types';

type AccountFilter = 'all' | 'personal' | 'business';
type SyncStatus = 'online' | 'offline' | 'syncing';

interface AppState {
  // Filters
  accountFilter: AccountFilter;
  selectedYear: number;

  // Optimistic updates for cycle items
  optimisticCycleItems: Map<string, CycleItem>;

  // Current active cycle
  currentCycleId: string | null;

  // Sync status
  syncStatus: SyncStatus;

  // Dismissed insights
  dismissedInsights: Set<string>;

  // Actions
  setAccountFilter: (filter: AccountFilter) => void;
  setSelectedYear: (year: number) => void;
  setOptimisticCycleItem: (id: string, item: CycleItem) => void;
  removeOptimisticCycleItem: (id: string) => void;
  setCurrentCycleId: (id: string | null) => void;
  setSyncStatus: (status: SyncStatus) => void;
  addDismissedInsight: (id: string) => void;
}

const currentYear = new Date().getFullYear();

export const useAppStore = create<AppState>((set) => ({
  accountFilter: 'all',
  selectedYear: currentYear,
  optimisticCycleItems: new Map(),
  currentCycleId: null,
  syncStatus: 'online',
  dismissedInsights: new Set(),

  setAccountFilter: (filter) => set({ accountFilter: filter }),
  setSelectedYear: (year) => set({ selectedYear: year }),

  setOptimisticCycleItem: (id, item) =>
    set((state) => {
      const next = new Map(state.optimisticCycleItems);
      next.set(id, item);
      return { optimisticCycleItems: next };
    }),

  removeOptimisticCycleItem: (id) =>
    set((state) => {
      const next = new Map(state.optimisticCycleItems);
      next.delete(id);
      return { optimisticCycleItems: next };
    }),

  setCurrentCycleId: (id) => set({ currentCycleId: id }),

  setSyncStatus: (status) => set({ syncStatus: status }),

  addDismissedInsight: (id) =>
    set((state) => {
      const next = new Set(state.dismissedInsights);
      next.add(id);
      return { dismissedInsights: next };
    }),
}));
