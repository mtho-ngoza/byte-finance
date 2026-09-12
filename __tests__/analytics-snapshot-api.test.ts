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
  getCycleIdForDate: () => '2026-09',
  getCycleDateRange: () => ({
    startDate: new Date('2026-08-25'),
    endDate: new Date('2026-09-24'),
  }),
}));

function createRequest(method: string, body?: unknown, url = 'http://localhost/api/analytics/snapshot') {
  return {
    method,
    url,
    json: async () => body ?? {},
    headers: new Map(),
  };
}

describe('Analytics Snapshot API', () => {
  beforeEach(() => {
    mockDb = createMockFirestore();
    vi.clearAllMocks();
  });

  describe('GET /api/analytics/snapshot', () => {
    it('should return 404 when snapshot not found', async () => {
      const { GET } = await import('@/app/api/analytics/snapshot/route');
      const response = await GET(createRequest('GET', null, 'http://localhost/api/analytics/snapshot?cycleId=2026-01') as never);

      expect(response.status).toBe(404);
    });

    it('should return existing snapshot', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/snapshots`, '2026-09', {
        year: 2026,
        month: 9,
        totalCommitted: 500000,
        totalPaid: 350000,
        categoryBreakdown: { housing: 200000, utilities: 150000 },
        topItems: [{ label: 'Rent', amount: 200000 }],
        goalsProgress: 45,
      });

      const { GET } = await import('@/app/api/analytics/snapshot/route');
      const response = await GET(createRequest('GET', null, 'http://localhost/api/analytics/snapshot?cycleId=2026-09') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.id).toBe('2026-09');
      expect(data.totalCommitted).toBe(500000);
      expect(data.totalPaid).toBe(350000);
      expect(data.goalsProgress).toBe(45);
    });
  });

  describe('POST /api/analytics/snapshot', () => {
    it('should return 404 when cycle not found', async () => {
      // Set up user preferences
      mockDb._setDoc('users', TEST_USER_ID, {
        preferences: { payDayType: 'last_working_day' },
      });

      const { POST } = await import('@/app/api/analytics/snapshot/route');
      const response = await POST(createRequest('POST', { cycleId: '2026-01' }) as never);

      expect(response.status).toBe(404);
    });

    it('should generate snapshot from cycle data', async () => {
      // Set up user preferences
      mockDb._setDoc('users', TEST_USER_ID, {
        preferences: { payDayType: 'last_working_day' },
      });

      // Set up cycle
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        status: 'active',
        startDate: { toDate: () => new Date('2026-08-25') },
        endDate: { toDate: () => new Date('2026-09-24') },
        income: { amount: 2500000, vatAmount: 375000 },
      });

      // Set up cycle items
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        label: 'Rent',
        amount: 500000,
        category: 'housing',
        status: 'paid',
        paidDate: { toDate: () => new Date('2026-09-01') },
        totalPaidAmount: 500000,
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-2', {
        cycleId: '2026-09',
        label: 'Groceries',
        amount: 200000,
        category: 'family',
        status: 'paid',
        payments: [
          { amount: 100000, date: { toDate: () => new Date('2026-09-05') } },
          { amount: 100000, date: { toDate: () => new Date('2026-09-15') } },
        ],
      });

      // Set up goals
      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'Emergency Fund',
        status: 'active',
        currentAmount: 250000,
        targetAmount: 500000,
      });

      const { POST } = await import('@/app/api/analytics/snapshot/route');
      const response = await POST(createRequest('POST', { cycleId: '2026-09' }) as never);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.id).toBe('2026-09');
      expect(data.year).toBe(2026);
      expect(data.month).toBe(9);
      expect(data.totalCommitted).toBe(700000); // 500000 + 200000
      expect(data.totalPaid).toBe(700000); // 500000 + 100000 + 100000
      expect(data.categoryBreakdown.housing).toBe(500000);
      expect(data.categoryBreakdown.family).toBe(200000);
      expect(data.income).toBe(2500000);
      expect(data.goalsProgress).toBe(50); // 250000 / 500000
    });

    it('should calculate category breakdown correctly', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        preferences: { payDayType: 'last_working_day' },
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        status: 'active',
        startDate: { toDate: () => new Date('2026-08-25') },
        endDate: { toDate: () => new Date('2026-09-24') },
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        label: 'Electricity',
        amount: 150000,
        category: 'utilities',
        status: 'paid',
        paidDate: { toDate: () => new Date('2026-09-10') },
        totalPaidAmount: 150000,
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-2', {
        cycleId: '2026-09',
        label: 'Water',
        amount: 50000,
        category: 'utilities',
        status: 'paid',
        paidDate: { toDate: () => new Date('2026-09-12') },
        totalPaidAmount: 50000,
      });

      const { POST } = await import('@/app/api/analytics/snapshot/route');
      const response = await POST(createRequest('POST', { cycleId: '2026-09' }) as never);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.categoryBreakdown.utilities).toBe(200000);
    });

    it('should return top 5 items by amount', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        preferences: { payDayType: 'last_working_day' },
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        status: 'active',
        startDate: { toDate: () => new Date('2026-08-25') },
        endDate: { toDate: () => new Date('2026-09-24') },
      });

      // Create 6 items, should only return top 5
      const items = [
        { label: 'Rent', amount: 800000, category: 'housing' },
        { label: 'Car', amount: 400000, category: 'transport' },
        { label: 'Groceries', amount: 300000, category: 'family' },
        { label: 'Insurance', amount: 250000, category: 'health' },
        { label: 'Electricity', amount: 150000, category: 'utilities' },
        { label: 'Netflix', amount: 20000, category: 'lifestyle' },
      ];

      items.forEach((item, idx) => {
        mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, `item-${idx}`, {
          cycleId: '2026-09',
          label: item.label,
          amount: item.amount,
          category: item.category,
          status: 'paid',
          paidDate: { toDate: () => new Date('2026-09-01') },
          totalPaidAmount: item.amount,
        });
      });

      const { POST } = await import('@/app/api/analytics/snapshot/route');
      const response = await POST(createRequest('POST', { cycleId: '2026-09' }) as never);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.topItems).toHaveLength(5);
      expect(data.topItems[0].label).toBe('Rent');
      expect(data.topItems[0].amount).toBe(800000);
      // Netflix (smallest) should not be in top 5
      expect(data.topItems.some((i: { label: string }) => i.label === 'Netflix')).toBe(false);
    });

    it('should handle goals progress with multiple goals', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        preferences: { payDayType: 'last_working_day' },
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        status: 'active',
        startDate: { toDate: () => new Date('2026-08-25') },
        endDate: { toDate: () => new Date('2026-09-24') },
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'Emergency Fund',
        status: 'active',
        currentAmount: 500000,
        targetAmount: 1000000, // 50%
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-2', {
        name: 'Vacation',
        status: 'active',
        currentAmount: 300000,
        targetAmount: 1000000, // 30%
      });
      // This goal should be excluded (completed)
      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-3', {
        name: 'Old Goal',
        status: 'completed',
        currentAmount: 1000000,
        targetAmount: 1000000,
      });

      const { POST } = await import('@/app/api/analytics/snapshot/route');
      const response = await POST(createRequest('POST', { cycleId: '2026-09' }) as never);

      expect(response.status).toBe(201);
      const data = await response.json();
      // (500000 + 300000) / (1000000 + 1000000) = 800000 / 2000000 = 40%
      expect(data.goalsProgress).toBe(40);
    });

    it('should handle payments array within date range', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        preferences: { payDayType: 'last_working_day' },
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        status: 'active',
        startDate: { toDate: () => new Date('2026-08-25') },
        endDate: { toDate: () => new Date('2026-09-24') },
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        label: 'Savings',
        amount: 200000,
        category: 'savings',
        status: 'partial',
        payments: [
          { amount: 100000, date: { toDate: () => new Date('2026-09-01') } }, // In range
          { amount: 50000, date: { toDate: () => new Date('2026-09-30') } }, // Out of range
        ],
      });

      const { POST } = await import('@/app/api/analytics/snapshot/route');
      const response = await POST(createRequest('POST', { cycleId: '2026-09' }) as never);

      expect(response.status).toBe(201);
      const data = await response.json();
      // Only the payment within range should be counted
      expect(data.totalPaid).toBe(100000);
      expect(data.categoryBreakdown.savings).toBe(100000);
    });

    it('should handle zero goals progress when no goals exist', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        preferences: { payDayType: 'last_working_day' },
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        status: 'active',
        startDate: { toDate: () => new Date('2026-08-25') },
        endDate: { toDate: () => new Date('2026-09-24') },
      });

      const { POST } = await import('@/app/api/analytics/snapshot/route');
      const response = await POST(createRequest('POST', { cycleId: '2026-09' }) as never);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.goalsProgress).toBe(0);
    });
  });
});
