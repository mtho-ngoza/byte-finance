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
}));

function createRequest(method: string, body?: unknown, url = 'http://localhost/api/year-review') {
  return {
    method,
    url,
    json: async () => body ?? {},
    headers: new Map(),
  };
}

describe('Year Review API', () => {
  beforeEach(() => {
    vi.resetModules();
    mockDb = createMockFirestore();
    vi.clearAllMocks();
  });

  describe('GET /api/year-review', () => {
    it('should return year review summary', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        preferences: { payDayType: 'last_working_day' },
      });

      // Add cycles
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-01', {
        totalCommitted: 500000,
        totalPaid: 450000,
        income: { amount: 2500000, vatAmount: 375000 },
        startDate: { toDate: () => new Date('2025-12-25') },
        endDate: { toDate: () => new Date('2026-01-24') },
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-02', {
        totalCommitted: 600000,
        totalPaid: 550000,
        income: { amount: 2500000, vatAmount: 375000 },
        startDate: { toDate: () => new Date('2026-01-25') },
        endDate: { toDate: () => new Date('2026-02-24') },
      });

      const { GET } = await import('@/app/api/year-review/route');
      const response = await GET(createRequest('GET', null, 'http://localhost/api/year-review?year=2026') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.year).toBe(2026);
      expect(data.summary.totalCommitted).toBe(1100000);
      expect(data.summary.totalIncome).toBe(5000000);
      expect(data.summary.totalVat).toBe(750000);
    });

    it('should return monthly data for all 12 months', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        preferences: { payDayType: 'last_working_day' },
      });

      const { GET } = await import('@/app/api/year-review/route');
      const response = await GET(createRequest('GET', null, 'http://localhost/api/year-review?year=2026') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.monthlyData).toHaveLength(12);
      expect(data.monthlyData[0].month).toBe(1);
      expect(data.monthlyData[11].month).toBe(12);
    });

    it('should calculate top categories from paid items', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        preferences: { payDayType: 'last_working_day' },
      });

      // Use March cycle with date range that doesn't overlap with calculated ranges
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-03', {
        startDate: { toDate: () => new Date('2026-03-25') },
        endDate: { toDate: () => new Date('2026-04-24') },
      });

      // Payment dates within March cycle's explicit range
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-03',
        category: 'housing',
        status: 'paid',
        paidDate: { toDate: () => new Date('2026-04-01') },
        totalPaidAmount: 800000,
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-2', {
        cycleId: '2026-03',
        category: 'transport',
        status: 'paid',
        paidDate: { toDate: () => new Date('2026-04-05') },
        totalPaidAmount: 300000,
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-3', {
        cycleId: '2026-03',
        category: 'housing',
        status: 'paid',
        paidDate: { toDate: () => new Date('2026-04-10') },
        totalPaidAmount: 200000,
      });

      const { GET } = await import('@/app/api/year-review/route');
      const response = await GET(createRequest('GET', null, 'http://localhost/api/year-review?year=2026') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.topCategories.length).toBeGreaterThan(0);
      // Housing should be first (800000 + 200000 = 1000000)
      expect(data.topCategories[0].category).toBe('housing');
      expect(data.topCategories[0].amount).toBe(1000000);
    });

    it('should calculate goals stats', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        preferences: { payDayType: 'last_working_day' },
      });

      // Completed goal this year
      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'Emergency Fund',
        status: 'completed',
        currentAmount: 1000000,
        targetAmount: 1000000,
        completedAt: { toDate: () => new Date('2026-06-15') },
      });
      // Active goal
      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-2', {
        name: 'Vacation',
        status: 'active',
        currentAmount: 500000,
        targetAmount: 1000000,
      });
      // Completed goal from previous year (should not count)
      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-3', {
        name: 'Old Goal',
        status: 'completed',
        completedAt: { toDate: () => new Date('2025-12-01') },
      });

      const { GET } = await import('@/app/api/year-review/route');
      const response = await GET(createRequest('GET', null, 'http://localhost/api/year-review?year=2026') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.goals.completedThisYear).toBe(1);
      expect(data.goals.activeCount).toBe(1);
      expect(data.goals.averageProgress).toBe(50); // 500000/1000000 = 50%
    });

    it('should calculate wishlist stats', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        preferences: { payDayType: 'last_working_day' },
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/wishlist`, 'wish-1', {
        title: 'New Laptop',
        targetYear: 2026,
        status: 'completed',
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/wishlist`, 'wish-2', {
        title: 'Vacation',
        targetYear: 2026,
        status: 'active',
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/wishlist`, 'wish-3', {
        title: 'Old Item',
        targetYear: 2025, // Should not be included
        status: 'completed',
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/wishlist`, 'wish-4', {
        title: 'Abandoned',
        targetYear: 2026,
        status: 'abandoned',
      });

      const { GET } = await import('@/app/api/year-review/route');
      const response = await GET(createRequest('GET', null, 'http://localhost/api/year-review?year=2026') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.wishlist.total).toBe(3);
      expect(data.wishlist.completed).toBe(1);
      expect(data.wishlist.active).toBe(1);
      expect(data.wishlist.abandoned).toBe(1);
      expect(data.wishlist.successRate).toBe(33); // 1/3 = 33%
    });

    it('should calculate savings rate', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        preferences: { payDayType: 'last_working_day' },
      });

      // Income: 2500000, VAT: 375000, Net: 2125000
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-01', {
        totalCommitted: 1000000,
        income: { amount: 2500000, vatAmount: 375000 },
        startDate: { toDate: () => new Date('2025-12-25') },
        endDate: { toDate: () => new Date('2026-01-24') },
      });

      // Spending: 1000000
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-01',
        category: 'housing',
        status: 'paid',
        paidDate: { toDate: () => new Date('2026-01-01') },
        totalPaidAmount: 1000000,
      });

      const { GET } = await import('@/app/api/year-review/route');
      const response = await GET(createRequest('GET', null, 'http://localhost/api/year-review?year=2026') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      // Net income: 2500000 - 375000 = 2125000
      // Savings: 2125000 - 1000000 = 1125000
      // Rate: 1125000 / 2125000 = 52.9% ~ 53%
      expect(data.summary.savingsRate).toBe(53);
    });

    it('should compare with previous year spending', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        preferences: { payDayType: 'last_working_day' },
      });

      // Current year
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-01', {
        totalPaid: 500000,
        startDate: { toDate: () => new Date('2025-12-25') },
        endDate: { toDate: () => new Date('2026-01-24') },
      });

      // Previous year
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2025-01', {
        totalPaid: 400000,
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2025-02', {
        totalPaid: 600000,
      });

      const { GET } = await import('@/app/api/year-review/route');
      const response = await GET(createRequest('GET', null, 'http://localhost/api/year-review?year=2026') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.summary.prevYearSpent).toBe(1000000);
    });

    it('should handle empty data gracefully', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        preferences: { payDayType: 'last_working_day' },
      });

      const { GET } = await import('@/app/api/year-review/route');
      const response = await GET(createRequest('GET', null, 'http://localhost/api/year-review?year=2026') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.summary.totalSpent).toBe(0);
      expect(data.summary.totalCommitted).toBe(0);
      expect(data.summary.totalIncome).toBe(0);
      expect(data.goals.completedThisYear).toBe(0);
      expect(data.goals.activeCount).toBe(0);
      expect(data.wishlist.total).toBe(0);
    });

    it('should include receipts stats', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        preferences: { payDayType: 'last_working_day' },
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1', {
        vendor: 'Shop A',
        amountInCents: 50000,
        capturedAt: new Date('2026-03-15'),
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-2', {
        vendor: 'Shop B',
        amountInCents: 75000,
        capturedAt: new Date('2026-06-20'),
      });

      const { GET } = await import('@/app/api/year-review/route');
      const response = await GET(createRequest('GET', null, 'http://localhost/api/year-review?year=2026') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.receipts.count).toBe(2);
      expect(data.receipts.total).toBe(125000);
    });

    it('should default to current year if not specified', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        preferences: { payDayType: 'last_working_day' },
      });

      const { GET } = await import('@/app/api/year-review/route');
      const response = await GET(createRequest('GET', null, 'http://localhost/api/year-review') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.year).toBe(new Date().getFullYear());
    });

    it('should handle items with multiple payments array', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        preferences: { payDayType: 'last_working_day' },
      });

      // Add cycles for April AND May to prevent calculated range overlap
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-04', {
        startDate: { toDate: () => new Date('2026-03-25') },
        endDate: { toDate: () => new Date('2026-04-24') },
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-05', {
        startDate: { toDate: () => new Date('2026-04-25') },
        endDate: { toDate: () => new Date('2026-05-24') },
      });

      // Item with multiple payments (partial payments) - no amount field
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-multi-pay', {
        cycleId: '2026-05',
        category: 'education', // Use unique category
        status: 'paid',
        payments: [
          { date: { toDate: () => new Date('2026-05-01') }, amount: 30000 },
          { date: { toDate: () => new Date('2026-05-10') }, amount: 40000 },
          { date: { toDate: () => new Date('2026-05-15') }, amount: 30000 },
        ],
      });

      const { GET } = await import('@/app/api/year-review/route');
      const response = await GET(createRequest('GET', null, 'http://localhost/api/year-review?year=2026') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      // Find education category specifically - payments sum to 100000
      const eduCategory = data.topCategories.find((c: { category: string }) => c.category === 'education');
      expect(eduCategory?.amount).toBe(100000);
    });

    it('should handle payments with string dates', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        preferences: { payDayType: 'last_working_day' },
      });

      // Add cycles for June AND July to prevent calculated range overlap
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-06', {
        startDate: { toDate: () => new Date('2026-05-25') },
        endDate: { toDate: () => new Date('2026-06-24') },
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-07', {
        startDate: { toDate: () => new Date('2026-06-25') },
        endDate: { toDate: () => new Date('2026-07-24') },
      });

      // Item with payments using string dates - no amount field
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-string-dates', {
        cycleId: '2026-07',
        category: 'savings', // Use unique category
        status: 'paid',
        payments: [
          { date: '2026-07-05', amount: 25000 },
          { date: '2026-07-10', amount: 25000 },
        ],
      });

      const { GET } = await import('@/app/api/year-review/route');
      const response = await GET(createRequest('GET', null, 'http://localhost/api/year-review?year=2026') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      // Find savings category specifically - payments sum to 50000
      const savingsCategory = data.topCategories.find((c: { category: string }) => c.category === 'savings');
      expect(savingsCategory?.amount).toBe(50000);
    });
  });
});
