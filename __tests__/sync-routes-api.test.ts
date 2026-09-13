import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockFirestore, type MockFirestore } from './setup';

const TEST_USER_ID = 'test-user-123';

let mockDb: MockFirestore;

vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => mockDb,
}));

vi.mock('@/lib/auth', () => ({
  withAuth: async () => ({ userId: TEST_USER_ID }),
}));

vi.mock('@/lib/payday-utils', () => ({
  getCycleDateRange: (year: number, month: number) => ({
    startDate: new Date(year, month - 1, 25, 0, 0, 0, 0),
    endDate: new Date(year, month, 24, 23, 59, 59, 999),
  }),
  getCycleIdForDate: (date: Date) => {
    // Simple logic: if day >= 25, it's next month's cycle
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    if (day >= 25) {
      const nextMonth = month + 2; // +1 for 0-indexed, +1 for next month
      return nextMonth > 12
        ? `${year + 1}-01`
        : `${year}-${String(nextMonth).padStart(2, '0')}`;
    }
    return `${year}-${String(month + 1).padStart(2, '0')}`;
  },
}));

function createRequest(method: string, body?: unknown, url = 'http://localhost/api/cycles/sync-totals') {
  return {
    method,
    url,
    json: async () => body ?? {},
    headers: new Map(),
  };
}

describe('Sync Routes API', () => {
  beforeEach(() => {
    mockDb = createMockFirestore();
    vi.clearAllMocks();
  });

  describe('POST /api/cycles/sync-totals', () => {
    it('should recalculate cycle totals', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        preferences: { payDayType: 'last_working_day' },
      });

      // Setup cycle with outdated totals
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        totalCommitted: 0, // Wrong - should be 700000
        itemCount: 0,
        totalPaid: 0,
        paidCount: 0,
        startDate: { toDate: () => new Date('2026-08-25') },
        endDate: { toDate: () => new Date('2026-09-24') },
      });

      // Setup items
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        label: 'Rent',
        amount: 500000,
        status: 'paid',
        paidDate: { toDate: () => new Date('2026-09-01') },
        totalPaidAmount: 500000,
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-2', {
        cycleId: '2026-09',
        label: 'Groceries',
        amount: 200000,
        status: 'upcoming',
      });

      const { POST } = await import('@/app/api/cycles/sync-totals/route');
      const response = await POST(createRequest('POST') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.cyclesUpdated).toBe(1);

      const cycle = mockDb._getDoc(`users/${TEST_USER_ID}/cycles`, '2026-09');
      expect(cycle?.totalCommitted).toBe(700000);
      expect(cycle?.itemCount).toBe(2);
      expect(cycle?.totalPaid).toBe(500000);
      expect(cycle?.paidCount).toBe(1);
    });

    it('should not update cycle if totals are correct', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        preferences: { payDayType: 'last_working_day' },
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        totalCommitted: 500000,
        itemCount: 1,
        totalPaid: 500000,
        paidCount: 1,
        startDate: { toDate: () => new Date('2026-08-25') },
        endDate: { toDate: () => new Date('2026-09-24') },
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        label: 'Rent',
        amount: 500000,
        status: 'paid',
        paidDate: { toDate: () => new Date('2026-09-01') },
        totalPaidAmount: 500000,
      });

      const { POST } = await import('@/app/api/cycles/sync-totals/route');
      const response = await POST(createRequest('POST') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.cyclesUpdated).toBe(0);
    });

    it('should attribute paid items by payment date, not cycleId', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        preferences: { payDayType: 'last_working_day' },
      });

      // Two cycles
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-08', {
        totalCommitted: 0,
        totalPaid: 0,
        startDate: { toDate: () => new Date('2026-07-25') },
        endDate: { toDate: () => new Date('2026-08-24') },
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        totalCommitted: 0,
        totalPaid: 0,
        startDate: { toDate: () => new Date('2026-08-25') },
        endDate: { toDate: () => new Date('2026-09-24') },
      });

      // Item with cycleId '2026-08' but paid in September
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-08',
        label: 'Late Payment',
        amount: 300000,
        status: 'paid',
        paidDate: { toDate: () => new Date('2026-09-05') },
        totalPaidAmount: 300000,
      });

      const { POST } = await import('@/app/api/cycles/sync-totals/route');
      const response = await POST(createRequest('POST') as never);

      expect(response.status).toBe(200);

      // Item should be attributed to September cycle (based on payment date)
      const septCycle = mockDb._getDoc(`users/${TEST_USER_ID}/cycles`, '2026-09');
      expect(septCycle?.totalCommitted).toBe(300000);
      expect(septCycle?.totalPaid).toBe(300000);

      // August cycle should have no paid items
      const augCycle = mockDb._getDoc(`users/${TEST_USER_ID}/cycles`, '2026-08');
      expect(augCycle?.totalPaid).toBe(0);
    });

    it('should handle partial payments within date range', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        preferences: { payDayType: 'last_working_day' },
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        totalCommitted: 0,
        totalPaid: 0,
        startDate: { toDate: () => new Date('2026-08-25') },
        endDate: { toDate: () => new Date('2026-09-24') },
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        label: 'Savings',
        amount: 500000,
        status: 'partial',
        payments: [
          { amount: 200000, date: { toDate: () => new Date('2026-09-01') } }, // In range
          { amount: 150000, date: { toDate: () => new Date('2026-09-15') } }, // In range
          { amount: 100000, date: { toDate: () => new Date('2026-10-01') } }, // Out of range
        ],
      });

      const { POST } = await import('@/app/api/cycles/sync-totals/route');
      const response = await POST(createRequest('POST') as never);

      expect(response.status).toBe(200);

      const cycle = mockDb._getDoc(`users/${TEST_USER_ID}/cycles`, '2026-09');
      // Only payments within range should be counted
      expect(cycle?.totalPaid).toBe(350000);
    });

    it('should exclude skipped items from totals', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        preferences: { payDayType: 'last_working_day' },
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        totalCommitted: 0,
        totalPaid: 0,
        startDate: { toDate: () => new Date('2026-08-25') },
        endDate: { toDate: () => new Date('2026-09-24') },
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        label: 'Rent',
        amount: 500000,
        status: 'paid',
        paidDate: { toDate: () => new Date('2026-09-01') },
        totalPaidAmount: 500000,
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-2', {
        cycleId: '2026-09',
        label: 'Skipped Item',
        amount: 200000,
        status: 'skipped',
      });

      const { POST } = await import('@/app/api/cycles/sync-totals/route');
      const response = await POST(createRequest('POST') as never);

      expect(response.status).toBe(200);

      const cycle = mockDb._getDoc(`users/${TEST_USER_ID}/cycles`, '2026-09');
      // Skipped items are not counted
      expect(cycle?.totalCommitted).toBe(500000);
      expect(cycle?.itemCount).toBe(1);
    });

    it('should return empty updates when no cycles exist', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        preferences: { payDayType: 'last_working_day' },
      });

      const { POST } = await import('@/app/api/cycles/sync-totals/route');
      const response = await POST(createRequest('POST') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.cyclesChecked).toBe(0);
      expect(data.cyclesUpdated).toBe(0);
    });
  });

  describe('POST /api/cycles/[id]/sync', () => {
    it('should sync a single cycle totals', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        preferences: { payDayType: 'last_working_day' },
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        totalCommitted: 0,
        totalPaid: 0,
        startDate: { toDate: () => new Date('2026-08-25') },
        endDate: { toDate: () => new Date('2026-09-24') },
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        label: 'Rent',
        amount: 500000,
        status: 'paid',
        paidDate: { toDate: () => new Date('2026-09-01') },
        totalPaidAmount: 500000,
      });

      const { POST } = await import('@/app/api/cycles/[id]/sync/route');
      const response = await POST(
        createRequest('POST') as never,
        { params: Promise.resolve({ id: '2026-09' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.synced).toBe(true);
      expect(data.cycleId).toBe('2026-09');
      expect(data.totalCommitted).toBe(500000);
      expect(data.totalPaid).toBe(500000);
      expect(data.itemCount).toBe(1);
      expect(data.paidCount).toBe(1);
    });

    it('should handle empty cycle items', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        preferences: { payDayType: 'last_working_day' },
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        totalCommitted: 100000, // Will be reset to 0
        totalPaid: 0,
      });

      const { POST } = await import('@/app/api/cycles/[id]/sync/route');
      const response = await POST(
        createRequest('POST') as never,
        { params: Promise.resolve({ id: '2026-09' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.totalCommitted).toBe(0);
      expect(data.itemCount).toBe(0);
    });
  });

  describe('POST /api/cycles/sync-all', () => {
    it('should recalculate totals for all cycles', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        totalCommitted: 0,
        totalPaid: 0,
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        label: 'Rent',
        amount: 500000,
        status: 'paid',
        totalPaidAmount: 500000,
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-2', {
        cycleId: '2026-09',
        label: 'Groceries',
        amount: 200000,
        status: 'upcoming',
      });

      const { POST } = await import('@/app/api/cycles/sync-all/route');
      const response = await POST(createRequest('POST') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.synced).toBe(1);
      expect(data.cycles[0].totalCommitted).toBe(700000);
      expect(data.cycles[0].totalPaid).toBe(500000);

      const cycle = mockDb._getDoc(`users/${TEST_USER_ID}/cycles`, '2026-09');
      expect(cycle?.totalCommitted).toBe(700000);
      expect(cycle?.itemCount).toBe(2);
      expect(cycle?.paidCount).toBe(1);
    });

    it('should handle items without totalPaidAmount', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        totalCommitted: 0,
        totalPaid: 0,
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        label: 'Rent',
        amount: 500000,
        status: 'paid',
        actualAmount: 480000, // Used when no totalPaidAmount
      });

      const { POST } = await import('@/app/api/cycles/sync-all/route');
      const response = await POST(createRequest('POST') as never);

      expect(response.status).toBe(200);
      const cycle = mockDb._getDoc(`users/${TEST_USER_ID}/cycles`, '2026-09');
      expect(cycle?.totalPaid).toBe(480000);
    });

    it('should return empty array when no cycles', async () => {
      const { POST } = await import('@/app/api/cycles/sync-all/route');
      const response = await POST(createRequest('POST') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.synced).toBe(0);
      expect(data.cycles).toHaveLength(0);
    });
  });

  describe('POST /api/cycle-items/sync-cycle-ids', () => {
    it('should move items to correct cycle based on payment date', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        preferences: { payDayType: 'last_working_day' },
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-08', {
        totalPaid: 300000,
        paidCount: 1,
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        totalPaid: 0,
        paidCount: 0,
      });

      // Item in 2026-08 but paid on Sep 5 (should move to 2026-09)
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-08',
        label: 'Late Payment',
        amount: 300000,
        status: 'paid',
        paidDate: { toDate: () => new Date('2026-09-05') },
        totalPaidAmount: 300000,
      });

      const { POST } = await import('@/app/api/cycle-items/sync-cycle-ids/route');
      const response = await POST(createRequest('POST') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.fixedCount).toBe(1);
      expect(data.moved[0].from).toBe('2026-08');
      expect(data.moved[0].to).toBe('2026-09');

      const item = mockDb._getDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1');
      expect(item?.cycleId).toBe('2026-09');
    });

    it('should use earliest payment date from payments array', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        preferences: { payDayType: 'last_working_day' },
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-08', {
        totalPaid: 0,
        paidCount: 0,
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        totalPaid: 0,
        paidCount: 0,
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-10', // Wrong cycle
        label: 'Partial Payment',
        amount: 100000,
        status: 'partial',
        payments: [
          { id: 'p1', amount: 50000, date: { toDate: () => new Date('2026-09-10') } },
          { id: 'p2', amount: 30000, date: { toDate: () => new Date('2026-09-05') } }, // Earliest
        ],
        totalPaidAmount: 80000,
      });

      const { POST } = await import('@/app/api/cycle-items/sync-cycle-ids/route');
      const response = await POST(createRequest('POST') as never);

      expect(response.status).toBe(200);
      const item = mockDb._getDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1');
      expect(item?.cycleId).toBe('2026-09');
    });

    it('should skip items already in correct cycle', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        preferences: { payDayType: 'last_working_day' },
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        label: 'Correct Item',
        amount: 100000,
        status: 'paid',
        paidDate: { toDate: () => new Date('2026-09-05') },
        totalPaidAmount: 100000,
      });

      const { POST } = await import('@/app/api/cycle-items/sync-cycle-ids/route');
      const response = await POST(createRequest('POST') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.fixedCount).toBe(0);
    });

    it('should update cycle totals when moving items', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        preferences: { payDayType: 'last_working_day' },
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-08', {
        totalPaid: 500000,
        paidCount: 1,
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        totalPaid: 0,
        paidCount: 0,
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-08',
        label: 'Moved Item',
        amount: 500000,
        status: 'paid',
        paidDate: { toDate: () => new Date('2026-09-01') },
        totalPaidAmount: 500000,
      });

      const { POST } = await import('@/app/api/cycle-items/sync-cycle-ids/route');
      await POST(createRequest('POST') as never);

      const oldCycle = mockDb._getDoc(`users/${TEST_USER_ID}/cycles`, '2026-08');
      expect(oldCycle?.totalPaid).toBe(0); // Decreased

      const newCycle = mockDb._getDoc(`users/${TEST_USER_ID}/cycles`, '2026-09');
      expect(newCycle?.totalPaid).toBe(500000); // Increased
    });
  });

  describe('POST /api/cycle-items/sync-paid-dates', () => {
    it('should set paidDate from payments array', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        preferences: { payDayType: 'last_working_day' },
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        label: 'Missing paidDate',
        status: 'partial',
        payments: [
          { id: 'p1', amount: 50000, date: { toDate: () => new Date('2026-09-10') } },
          { id: 'p2', amount: 30000, date: { toDate: () => new Date('2026-09-05') } }, // Earliest
        ],
      });

      const { POST } = await import('@/app/api/cycle-items/sync-paid-dates/route');
      const response = await POST(createRequest('POST') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.fixedCount).toBe(1);
      expect(data.fixed[0].source).toBe('payments');

      const item = mockDb._getDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1');
      expect(item?.paidDate).toBeDefined();
    });

    it('should set paidDate from updatedAt if no payments', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        preferences: { payDayType: 'last_working_day' },
      });

      const updatedAt = new Date('2026-09-15');
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        label: 'No payments',
        status: 'paid',
        updatedAt: { toDate: () => updatedAt },
      });

      const { POST } = await import('@/app/api/cycle-items/sync-paid-dates/route');
      const response = await POST(createRequest('POST') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.fixed[0].source).toBe('updatedAt');
    });

    it('should skip items that already have paidDate', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        preferences: { payDayType: 'last_working_day' },
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        label: 'Has paidDate',
        status: 'paid',
        paidDate: { toDate: () => new Date('2026-09-01') },
      });

      const { POST } = await import('@/app/api/cycle-items/sync-paid-dates/route');
      const response = await POST(createRequest('POST') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.fixedCount).toBe(0);
    });

    it('should estimate paidDate from cycle if no other source', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        preferences: { payDayType: 'last_working_day' },
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        label: 'No data',
        status: 'paid',
        // No payments, no updatedAt
      });

      const { POST } = await import('@/app/api/cycle-items/sync-paid-dates/route');
      const response = await POST(createRequest('POST') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.fixed[0].source).toBe('cycleEstimate');
    });

    it('should return empty when no items need fixing', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        preferences: { payDayType: 'last_working_day' },
      });

      const { POST } = await import('@/app/api/cycle-items/sync-paid-dates/route');
      const response = await POST(createRequest('POST') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.fixedCount).toBe(0);
    });
  });
});
