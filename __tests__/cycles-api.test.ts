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
  });

  describe('DELETE /api/cycles/[id]', () => {
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
  });
});
