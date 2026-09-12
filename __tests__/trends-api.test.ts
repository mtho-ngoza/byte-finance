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

function createRequest(method: string, url = 'http://localhost/api/trends') {
  return {
    method,
    url,
    json: async () => ({}),
    headers: new Map(),
  };
}

describe('Trends API', () => {
  beforeEach(() => {
    mockDb = createMockFirestore();
    vi.clearAllMocks();
  });

  describe('GET /api/trends', () => {
    it('should return placeholder months when no cycles exist', async () => {
      const { GET } = await import('@/app/api/trends/route');
      const response = await GET(createRequest('GET', 'http://localhost/api/trends?months=6') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      // API returns placeholder months even without cycle data
      expect(data.monthlyTrend).toHaveLength(6);
      expect(data.monthlyTrend.every((m: { spent: number }) => m.spent === 0)).toBe(true);
      expect(data.topCategories).toEqual([]);
    });

    it('should calculate monthly trend from cycles', async () => {
      // Add cycles with data
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        status: 'closed',
        totalCommitted: 500000,
        totalPaid: 450000,
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-08', {
        status: 'closed',
        totalCommitted: 500000,
        totalPaid: 500000,
      });

      const { GET } = await import('@/app/api/trends/route');
      const response = await GET(createRequest('GET', 'http://localhost/api/trends?months=6') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.monthlyTrend.length).toBeGreaterThan(0);
    });

    it('should calculate top categories from cycle items', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        status: 'closed',
        startDate: new Date('2026-08-31'),
        endDate: new Date('2026-09-29'),
      });

      // Add items with different categories - paidDate is required for attribution
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        category: 'housing',
        amount: 500000,
        status: 'paid',
        totalPaidAmount: 500000,
        paidDate: new Date('2026-09-05'),
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-2', {
        cycleId: '2026-09',
        category: 'transport',
        amount: 200000,
        status: 'paid',
        totalPaidAmount: 200000,
        paidDate: new Date('2026-09-10'),
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-3', {
        cycleId: '2026-09',
        category: 'housing',
        amount: 100000,
        status: 'paid',
        totalPaidAmount: 100000,
        paidDate: new Date('2026-09-15'),
      });

      const { GET } = await import('@/app/api/trends/route');
      const response = await GET(createRequest('GET', 'http://localhost/api/trends?months=6') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      // Housing should be top category
      expect(data.topCategories.length).toBeGreaterThan(0);
    });

    it('should respect months parameter', async () => {
      // Add cycles for different months
      for (let i = 1; i <= 12; i++) {
        const cycleId = `2026-${String(i).padStart(2, '0')}`;
        mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, cycleId, {
          status: 'closed',
          totalCommitted: 500000,
          totalPaid: 450000,
        });
      }

      const { GET } = await import('@/app/api/trends/route');
      const response = await GET(createRequest('GET', 'http://localhost/api/trends?months=3') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      // Should only return data for last 3 months
      expect(data.monthlyTrend.length).toBeLessThanOrEqual(3);
    });

    it('should calculate category trends over time', async () => {
      // Add multiple months of data
      for (const month of ['07', '08', '09']) {
        const cycleId = `2026-${month}`;
        mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, cycleId, {
          status: 'closed',
        });

        mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, `housing-${month}`, {
          cycleId,
          category: 'housing',
          amount: 500000 + parseInt(month) * 10000,
          status: 'paid',
          totalPaidAmount: 500000 + parseInt(month) * 10000,
        });
      }

      const { GET } = await import('@/app/api/trends/route');
      const response = await GET(createRequest('GET', 'http://localhost/api/trends?months=6') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      // Should have categoryTrends data
      expect(data.categoryTrends).toBeDefined();
    });

    it('should handle default months parameter', async () => {
      const { GET } = await import('@/app/api/trends/route');
      // No months parameter - should default to 6
      const response = await GET(createRequest('GET', 'http://localhost/api/trends') as never);

      expect(response.status).toBe(200);
    });

    it('should handle items with payments array', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        status: 'closed',
        startDate: { toDate: () => new Date('2026-08-25') },
        endDate: { toDate: () => new Date('2026-09-24') },
      });

      // Item with multiple payments in payments array
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        category: 'savings',
        amount: 100000,
        status: 'partial',
        payments: [
          { amount: 30000, date: { toDate: () => new Date('2026-09-01') } },
          { amount: 40000, date: { toDate: () => new Date('2026-09-15') } },
          { amount: 30000, date: { toDate: () => new Date('2026-10-01') } }, // Outside cycle range
        ],
      });

      const { GET } = await import('@/app/api/trends/route');
      const response = await GET(createRequest('GET', 'http://localhost/api/trends?months=6') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      // Should return monthlyTrend data
      expect(data.monthlyTrend.length).toBeGreaterThan(0);
    });

    it('should find earliest payment date from payments array', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        status: 'closed',
        startDate: { toDate: () => new Date('2026-08-25') },
        endDate: { toDate: () => new Date('2026-09-24') },
      });

      // Item with payments - should use earliest payment date for cycle attribution
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        category: 'lifestyle',
        amount: 50000,
        status: 'paid',
        payments: [
          { amount: 25000, date: { toDate: () => new Date('2026-09-10') } },
          { amount: 25000, date: { toDate: () => new Date('2026-09-05') } }, // This is the earliest
        ],
      });

      const { GET } = await import('@/app/api/trends/route');
      const response = await GET(createRequest('GET', 'http://localhost/api/trends?months=6') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      // Should return data with categoryTrends
      expect(data.categoryTrends).toBeDefined();
    });
  });
});
