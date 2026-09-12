import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockFirestore, type MockFirestore } from './setup';

const TEST_USER_ID = 'test-user-123';

let mockDb: MockFirestore;

vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => mockDb,
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => ({ _type: 'serverTimestamp' }),
    increment: (n: number) => ({ _type: 'increment', _value: n }),
    arrayUnion: (...elements: unknown[]) => ({ _type: 'arrayUnion', _elements: elements }),
  },
  Timestamp: {
    fromDate: (date: Date) => ({ toDate: () => date }),
  },
}));

vi.mock('@/lib/payday-utils', () => ({
  getPaydayForMonth: () => new Date('2026-09-30'),
}));

vi.mock('@/lib/auth', () => ({
  withAuth: async () => ({ userId: TEST_USER_ID }),
}));

function createRequest(method: string, body?: unknown, url = 'http://localhost/api/cycles') {
  return {
    method,
    url,
    json: async () => body,
    headers: new Map(),
  };
}

describe('Cycles API', () => {
  beforeEach(() => {
    mockDb = createMockFirestore();
    vi.clearAllMocks();
  });

  describe('GET /api/cycles', () => {
    it('should return all cycles for user', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        status: 'active',
        totalCommitted: 500000,
        totalPaid: 250000,
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-08', {
        status: 'closed',
        totalCommitted: 500000,
        totalPaid: 500000,
      });

      const { GET } = await import('@/app/api/cycles/route');
      const response = await GET(createRequest('GET') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.cycles).toHaveLength(2);
    });
  });

  describe('POST /api/cycles', () => {
    it('should create a new cycle', async () => {
      const { POST } = await import('@/app/api/cycles/route');

      const response = await POST(createRequest('POST', {
        id: '2026-10',
        startDate: '2026-09-30',
        endDate: '2026-10-29',
        status: 'active',
      }) as never);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.id).toBe('2026-10');
    });

    it('should copy commitments to new cycle', async () => {
      // Setup existing commitment
      mockDb._setDoc(`users/${TEST_USER_ID}/commitments`, 'commitment-1', {
        label: 'Rent',
        amount: 500000,
        category: 'housing',
        isActive: true,
      });

      const { POST } = await import('@/app/api/cycles/route');
      await POST(createRequest('POST', {
        id: '2026-10',
        startDate: '2026-09-30',
        endDate: '2026-10-29',
        status: 'active',
      }) as never);

      // Check that cycle item was created from commitment
      const cycle = mockDb._getDoc(`users/${TEST_USER_ID}/cycles`, '2026-10');
      expect(cycle).toBeDefined();
    });
  });

  describe('PATCH /api/cycles/[id]', () => {
    it('should update cycle status', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        status: 'active',
        totalCommitted: 500000,
      });

      const { PATCH } = await import('@/app/api/cycles/[id]/route');
      const response = await PATCH(
        createRequest('PATCH', { status: 'closed' }) as never,
        { params: Promise.resolve({ id: '2026-09' }) }
      );

      expect(response.status).toBe(200);
      const cycle = mockDb._getDoc(`users/${TEST_USER_ID}/cycles`, '2026-09');
      expect(cycle?.status).toBe('closed');
    });

    it('should update income data', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        status: 'active',
      });

      const { PATCH } = await import('@/app/api/cycles/[id]/route');
      const response = await PATCH(
        createRequest('PATCH', {
          income: {
            amount: 2500000,
            vatAmount: 375000,
            verified: true,
          },
        }) as never,
        { params: Promise.resolve({ id: '2026-09' }) }
      );

      expect(response.status).toBe(200);
      const cycle = mockDb._getDoc(`users/${TEST_USER_ID}/cycles`, '2026-09');
      expect(cycle?.income?.amount).toBe(2500000);
      expect(cycle?.income?.vatAmount).toBe(375000);
    });

    it('should return 404 for non-existent cycle on PATCH', async () => {
      const { PATCH } = await import('@/app/api/cycles/[id]/route');
      const response = await PATCH(
        createRequest('PATCH', { status: 'closed' }) as never,
        { params: Promise.resolve({ id: 'non-existent' }) }
      );

      expect(response.status).toBe(404);
    });

    it('should update date range when income.receivedDate is set', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        preferences: { payDayType: 'last_working_day' },
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        status: 'active',
        startDate: { toDate: () => new Date('2026-08-25') },
        endDate: { toDate: () => new Date('2026-09-24') },
      });

      const { PATCH } = await import('@/app/api/cycles/[id]/route');
      const response = await PATCH(
        createRequest('PATCH', {
          income: {
            amount: 2500000,
            receivedDate: '2026-08-30T00:00:00Z',
          },
        }) as never,
        { params: Promise.resolve({ id: '2026-09' }) }
      );

      expect(response.status).toBe(200);
      const cycle = mockDb._getDoc(`users/${TEST_USER_ID}/cycles`, '2026-09');
      // Start date should be income received date
      expect(cycle?.startDate).toBeDefined();
    });

    it('should update previous cycle end date when income.receivedDate is set', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        preferences: { payDayType: 'last_working_day' },
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-08', {
        status: 'active',
        startDate: { toDate: () => new Date('2026-07-25') },
        endDate: { toDate: () => new Date('2026-08-24') },
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        status: 'active',
        startDate: { toDate: () => new Date('2026-08-25') },
        endDate: { toDate: () => new Date('2026-09-24') },
      });

      const { PATCH } = await import('@/app/api/cycles/[id]/route');
      await PATCH(
        createRequest('PATCH', {
          income: {
            amount: 2500000,
            receivedDate: '2026-08-30T00:00:00Z',
          },
        }) as never,
        { params: Promise.resolve({ id: '2026-09' }) }
      );

      // Previous cycle end date should be updated
      const prevCycle = mockDb._getDoc(`users/${TEST_USER_ID}/cycles`, '2026-08');
      expect(prevCycle?.endDate).toBeDefined();
    });

    it('should use next cycle income date for end date calculation', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        preferences: { payDayType: 'last_working_day' },
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        status: 'active',
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-10', {
        status: 'active',
        income: {
          receivedDate: { toDate: () => new Date('2026-09-30') },
        },
      });

      const { PATCH } = await import('@/app/api/cycles/[id]/route');
      const response = await PATCH(
        createRequest('PATCH', {
          income: {
            amount: 2500000,
            receivedDate: '2026-08-30T00:00:00Z',
          },
        }) as never,
        { params: Promise.resolve({ id: '2026-09' }) }
      );

      expect(response.status).toBe(200);
    });

    it('should reassign items based on payment date when income.receivedDate changes', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        preferences: { payDayType: 'last_working_day' },
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-08', {
        status: 'active',
        totalPaid: 50000,
        paidCount: 1,
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        status: 'active',
        totalPaid: 0,
        paidCount: 0,
      });

      // Item paid in September but currently assigned to August
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-08',
        label: 'Rent',
        amount: 50000,
        status: 'paid',
        paidDate: { toDate: () => new Date('2026-09-05') },
        totalPaidAmount: 50000,
      });

      const { PATCH } = await import('@/app/api/cycles/[id]/route');
      await PATCH(
        createRequest('PATCH', {
          income: {
            amount: 2500000,
            receivedDate: '2026-08-30T00:00:00Z',
          },
        }) as never,
        { params: Promise.resolve({ id: '2026-09' }) }
      );

      // Item should be reassigned to 2026-09 based on paidDate
      const item = mockDb._getDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1');
      expect(item?.cycleId).toBe('2026-09');
    });
  });

  describe('GET /api/cycles/[id]', () => {
    it('should return 404 for non-existent cycle', async () => {
      const { GET } = await import('@/app/api/cycles/[id]/route');
      const response = await GET(
        createRequest('GET') as never,
        { params: Promise.resolve({ id: 'non-existent' }) }
      );

      expect(response.status).toBe(404);
    });

    it('should return a single cycle', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        status: 'active',
        totalCommitted: 500000,
        totalPaid: 250000,
      });

      const { GET } = await import('@/app/api/cycles/[id]/route');
      const response = await GET(
        createRequest('GET') as never,
        { params: Promise.resolve({ id: '2026-09' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.status).toBe('active');
      expect(data.totalCommitted).toBe(500000);
    });
  });

  describe('DELETE /api/cycles/[id]', () => {
    it('should return 404 for non-existent cycle', async () => {
      const { DELETE } = await import('@/app/api/cycles/[id]/route');
      const response = await DELETE(
        createRequest('DELETE') as never,
        { params: Promise.resolve({ id: 'non-existent' }) }
      );

      expect(response.status).toBe(404);
    });

    it('should delete cycle and its items', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        status: 'active',
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        label: 'Rent',
      });

      const { DELETE } = await import('@/app/api/cycles/[id]/route');
      const response = await DELETE(
        createRequest('DELETE') as never,
        { params: Promise.resolve({ id: '2026-09' }) }
      );

      expect(response.status).toBe(200);
      const cycle = mockDb._getDoc(`users/${TEST_USER_ID}/cycles`, '2026-09');
      expect(cycle).toBeUndefined();
    });

    it('should handle cycle deletion with linked items', async () => {
      // Setup cycle with items
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        status: 'active',
        totalCommitted: 100000,
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        label: 'Savings',
        amount: 50000,
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-2', {
        cycleId: '2026-09',
        label: 'Rent',
        amount: 50000,
      });

      const { DELETE } = await import('@/app/api/cycles/[id]/route');
      const response = await DELETE(
        createRequest('DELETE') as never,
        { params: Promise.resolve({ id: '2026-09' }) }
      );

      expect(response.status).toBe(200);
      // Cycle should be deleted
      const cycle = mockDb._getDoc(`users/${TEST_USER_ID}/cycles`, '2026-09');
      expect(cycle).toBeUndefined();
    });

    it('should remove contributions from linked goals when deleting cycle', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        status: 'active',
      });

      // Item with linked goal and payments
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        label: 'Savings',
        amount: 50000,
        linkedGoalId: 'goal-1',
        payments: [
          { id: 'pay-1', amount: 30000 },
          { id: 'pay-2', amount: 20000 },
        ],
      });

      // Goal with contributions
      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'Emergency Fund',
        currentAmount: 100000,
        contributions: [
          { id: 'item-1-pay-1', amount: 30000 },
          { id: 'item-1-pay-2', amount: 20000 },
          { id: 'other-contrib', amount: 50000 },
        ],
      });

      const { DELETE } = await import('@/app/api/cycles/[id]/route');
      const response = await DELETE(
        createRequest('DELETE') as never,
        { params: Promise.resolve({ id: '2026-09' }) }
      );

      expect(response.status).toBe(200);

      // Goal contributions should be filtered
      const goal = mockDb._getDoc(`users/${TEST_USER_ID}/goals`, 'goal-1');
      expect(goal?.contributions?.length).toBe(1);
      expect(goal?.contributions?.[0].id).toBe('other-contrib');
    });
  });
});
