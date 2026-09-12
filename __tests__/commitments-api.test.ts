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

function createRequest(method: string, body?: unknown, url = 'http://localhost/api/commitments') {
  return {
    method,
    url,
    json: async () => body,
    headers: new Map(),
  };
}

describe('Commitments API', () => {
  beforeEach(() => {
    mockDb = createMockFirestore();
    vi.clearAllMocks();
  });

  describe('GET /api/commitments', () => {
    it('should return all commitments', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/commitments`, 'commit-1', {
        label: 'Rent',
        amount: 800000,
        category: 'housing',
        accountType: 'eft',
        isActive: true,
        sortOrder: 0,
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/commitments`, 'commit-2', {
        label: 'Electricity',
        amount: 150000,
        category: 'utilities',
        accountType: 'debit_order',
        isActive: true,
        sortOrder: 1,
      });

      const { GET } = await import('@/app/api/commitments/route');
      const response = await GET(createRequest('GET') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.commitments).toHaveLength(2);
    });

    it('should return empty array when no commitments', async () => {
      const { GET } = await import('@/app/api/commitments/route');
      const response = await GET(createRequest('GET') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.commitments).toEqual([]);
    });
  });

  describe('POST /api/commitments', () => {
    it('should require all mandatory fields', async () => {
      const { POST } = await import('@/app/api/commitments/route');
      const response = await POST(createRequest('POST', { label: 'Test' }) as never);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('label');
    });

    it('should create a commitment with all fields', async () => {
      const { POST } = await import('@/app/api/commitments/route');

      const response = await POST(createRequest('POST', {
        label: 'Car Insurance',
        amount: 120000,
        category: 'transport',
        accountType: 'debit_order',
        dueDay: 1,
        isVariable: false,
        sortOrder: 5,
      }) as never);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.label).toBe('Car Insurance');
      expect(data.amount).toBe(120000);
      expect(data.category).toBe('transport');
      expect(data.dueDay).toBe(1);
      expect(data.isActive).toBe(true);
    });

    it('should create a commitment with linked goal', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'Emergency Fund',
        type: 'savings',
      });

      const { POST } = await import('@/app/api/commitments/route');
      const response = await POST(createRequest('POST', {
        label: 'Emergency Savings',
        amount: 200000,
        category: 'savings',
        accountType: 'eft',
        linkedGoalId: 'goal-1',
      }) as never);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.linkedGoalId).toBe('goal-1');
    });

    it('should create variable commitment', async () => {
      const { POST } = await import('@/app/api/commitments/route');
      const response = await POST(createRequest('POST', {
        label: 'Groceries',
        amount: 300000,
        category: 'family',
        accountType: 'card',
        isVariable: true,
      }) as never);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.isVariable).toBe(true);
    });

    it('should set default values for optional fields', async () => {
      const { POST } = await import('@/app/api/commitments/route');
      const response = await POST(createRequest('POST', {
        label: 'Subscription',
        amount: 15000,
        category: 'lifestyle',
        accountType: 'card',
      }) as never);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.linkedGoalId).toBeNull();
      expect(data.dueDay).toBeNull();
      expect(data.isVariable).toBe(false);
      expect(data.sortOrder).toBe(0);
    });
  });

  describe('PATCH /api/commitments/[id]', () => {
    it('should return 404 for non-existent commitment', async () => {
      const { PATCH } = await import('@/app/api/commitments/[id]/route');
      const response = await PATCH(
        createRequest('PATCH', { amount: 100000 }) as never,
        { params: Promise.resolve({ id: 'non-existent' }) }
      );

      expect(response.status).toBe(404);
    });

    it('should update commitment fields', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/commitments`, 'commit-1', {
        label: 'Rent',
        amount: 800000,
        category: 'housing',
        accountType: 'eft',
        isActive: true,
      });

      const { PATCH } = await import('@/app/api/commitments/[id]/route');
      const response = await PATCH(
        createRequest('PATCH', { amount: 850000, dueDay: 1 }) as never,
        { params: Promise.resolve({ id: 'commit-1' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.amount).toBe(850000);
      expect(data.dueDay).toBe(1);
    });

    it('should propagate linkedGoalId changes to unpaid cycle items', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/commitments`, 'commit-1', {
        label: 'Savings',
        amount: 200000,
        category: 'savings',
        accountType: 'eft',
        linkedGoalId: null,
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        commitmentId: 'commit-1',
        status: 'upcoming',
        linkedGoalId: null,
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-2', {
        commitmentId: 'commit-1',
        status: 'paid',
        linkedGoalId: null,
      });

      const { PATCH } = await import('@/app/api/commitments/[id]/route');
      const response = await PATCH(
        createRequest('PATCH', { linkedGoalId: 'goal-1' }) as never,
        { params: Promise.resolve({ id: 'commit-1' }) }
      );

      expect(response.status).toBe(200);

      // Unpaid item should be updated
      const item1 = mockDb._getDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1');
      expect(item1?.linkedGoalId).toBe('goal-1');

      // Paid item should not be updated
      const item2 = mockDb._getDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-2');
      expect(item2?.linkedGoalId).toBeNull();
    });

    it('should propagate isVariable changes to non-paid cycle items', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/commitments`, 'commit-1', {
        label: 'Groceries',
        amount: 300000,
        category: 'family',
        accountType: 'card',
        isVariable: false,
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        commitmentId: 'commit-1',
        status: 'partial',
        isVariable: false,
      });

      const { PATCH } = await import('@/app/api/commitments/[id]/route');
      const response = await PATCH(
        createRequest('PATCH', { isVariable: true }) as never,
        { params: Promise.resolve({ id: 'commit-1' }) }
      );

      expect(response.status).toBe(200);

      // Partial item should be updated (isVariable propagates to partial)
      const item1 = mockDb._getDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1');
      expect(item1?.isVariable).toBe(true);
    });
  });

  describe('DELETE /api/commitments/[id]', () => {
    it('should return 404 for non-existent commitment', async () => {
      const { DELETE } = await import('@/app/api/commitments/[id]/route');
      const response = await DELETE(
        createRequest('DELETE') as never,
        { params: Promise.resolve({ id: 'non-existent' }) }
      );

      expect(response.status).toBe(404);
    });

    it('should delete a commitment', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/commitments`, 'commit-1', {
        label: 'To Delete',
        amount: 100000,
        category: 'other',
        accountType: 'cash',
      });

      const { DELETE } = await import('@/app/api/commitments/[id]/route');
      const response = await DELETE(
        createRequest('DELETE') as never,
        { params: Promise.resolve({ id: 'commit-1' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);

      const commitment = mockDb._getDoc(`users/${TEST_USER_ID}/commitments`, 'commit-1');
      expect(commitment).toBeUndefined();
    });
  });
});
