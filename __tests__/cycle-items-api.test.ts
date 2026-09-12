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

function createRequest(method: string, body?: unknown, url = 'http://localhost/api/cycle-items') {
  return {
    method,
    url,
    json: async () => body,
    headers: new Map(),
  };
}

describe('Cycle Items API', () => {
  beforeEach(() => {
    mockDb = createMockFirestore();
    vi.clearAllMocks();
  });

  describe('GET /api/cycle-items', () => {
    it('should require cycleId parameter', async () => {
      const { GET } = await import('@/app/api/cycle-items/route');
      const response = await GET(createRequest('GET', null, 'http://localhost/api/cycle-items') as never);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('cycleId');
    });

    it('should return items for a cycle', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        label: 'Rent',
        amount: 800000,
        status: 'paid',
        sortOrder: 0,
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-2', {
        cycleId: '2026-09',
        label: 'Utilities',
        amount: 150000,
        status: 'upcoming',
        sortOrder: 1,
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-3', {
        cycleId: '2026-08',
        label: 'Old Item',
        amount: 100000,
        sortOrder: 0,
      });

      const { GET } = await import('@/app/api/cycle-items/route');
      const response = await GET(createRequest('GET', null, 'http://localhost/api/cycle-items?cycleId=2026-09') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.items).toHaveLength(2);
    });

    it('should return empty array for cycle with no items', async () => {
      const { GET } = await import('@/app/api/cycle-items/route');
      const response = await GET(createRequest('GET', null, 'http://localhost/api/cycle-items?cycleId=2026-09') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.items).toEqual([]);
    });
  });

  describe('POST /api/cycle-items', () => {
    it('should require all mandatory fields', async () => {
      const { POST } = await import('@/app/api/cycle-items/route');
      const response = await POST(createRequest('POST', {
        cycleId: '2026-09',
        label: 'Test',
      }) as never);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('amount');
    });

    it('should create a cycle item', async () => {
      // Setup cycle first
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        status: 'active',
        totalCommitted: 0,
        totalPaid: 0,
        itemCount: 0,
      });

      const { POST } = await import('@/app/api/cycle-items/route');
      const response = await POST(createRequest('POST', {
        cycleId: '2026-09',
        label: 'Internet',
        amount: 120000,
        category: 'utilities',
        accountType: 'debit_order',
        dueDate: '2026-09-15',
      }) as never);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.label).toBe('Internet');
      expect(data.amount).toBe(120000);
      expect(data.status).toBe('upcoming');
    });

    it('should create a paid item and update cycle totals', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        status: 'active',
        totalCommitted: 0,
        totalPaid: 0,
        itemCount: 0,
        paidCount: 0,
      });

      const { POST } = await import('@/app/api/cycle-items/route');
      const response = await POST(createRequest('POST', {
        cycleId: '2026-09',
        label: 'Cash Expense',
        amount: 50000,
        category: 'lifestyle',
        accountType: 'cash',
        status: 'paid',
        paidDate: '2026-09-05',
      }) as never);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.status).toBe('paid');
      expect(data.paidDate).toBeDefined();

      // Check cycle totals were updated
      const cycle = mockDb._getDoc(`users/${TEST_USER_ID}/cycles`, '2026-09');
      expect(cycle?.totalCommitted).toBe(50000);
      expect(cycle?.totalPaid).toBe(50000);
    });

    it('should create contribution when paid item is linked to goal', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        status: 'active',
        totalCommitted: 0,
        totalPaid: 0,
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'Savings',
        targetAmount: 1000000,
        currentAmount: 0,
        contributions: [],
      });

      const { POST } = await import('@/app/api/cycle-items/route');
      const response = await POST(createRequest('POST', {
        cycleId: '2026-09',
        label: 'Monthly Savings',
        amount: 200000,
        category: 'savings',
        accountType: 'eft',
        status: 'paid',
        linkedGoalId: 'goal-1',
      }) as never);

      expect(response.status).toBe(201);

      // Check goal was updated with contribution
      const goal = mockDb._getDoc(`users/${TEST_USER_ID}/goals`, 'goal-1');
      expect(goal?.currentAmount).toBe(200000);
      expect(goal?.contributions?.length).toBeGreaterThan(0);
    });

    it('should set default values for optional fields', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        status: 'active',
        totalCommitted: 0,
      });

      const { POST } = await import('@/app/api/cycle-items/route');
      const response = await POST(createRequest('POST', {
        cycleId: '2026-09',
        label: 'Basic Item',
        amount: 10000,
        category: 'other',
        accountType: 'cash',
      }) as never);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.linkedGoalId).toBeNull();
      expect(data.notes).toBeNull();
      expect(data.tags).toEqual([]);
      expect(data.payments).toEqual([]);
      expect(data.totalPaidAmount).toBe(0);
    });
  });
});
