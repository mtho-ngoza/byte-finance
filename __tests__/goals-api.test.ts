import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockFirestore, type MockFirestore } from './setup';

const TEST_USER_ID = 'test-user-123';

let mockDb: MockFirestore;

vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => mockDb,
}));

// Mock auth
vi.mock('@/lib/auth', () => ({
  withAuth: async () => ({ userId: TEST_USER_ID }),
}));

function createRequest(method: string, body?: unknown) {
  return {
    method,
    json: async () => body,
    headers: new Map(),
  };
}

describe('Goals API', () => {
  beforeEach(() => {
    mockDb = createMockFirestore();
    vi.clearAllMocks();
  });

  describe('GET /api/goals', () => {
    it('should return all goals for user', async () => {
      // Setup
      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'Emergency Fund',
        targetAmount: 1000000,
        currentAmount: 500000,
        type: 'savings',
        status: 'active',
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-2', {
        name: 'Pay off car',
        targetAmount: 5000000,
        currentAmount: 2000000,
        type: 'debt_payoff',
        status: 'active',
      });

      const { GET } = await import('@/app/api/goals/route');
      const response = await GET(createRequest('GET') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.goals).toHaveLength(2);
    });

    it('should return empty array when no goals exist', async () => {
      const { GET } = await import('@/app/api/goals/route');
      const response = await GET(createRequest('GET') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.goals).toHaveLength(0);
    });
  });

  describe('POST /api/goals', () => {
    it('should create a new goal', async () => {
      const { POST } = await import('@/app/api/goals/route');

      const response = await POST(createRequest('POST', {
        name: 'New Goal',
        targetAmount: 1000000,
        monthlyTarget: 50000,
        type: 'savings',
        priority: 1,
      }) as never);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.id).toBeDefined();
      expect(data.name).toBe('New Goal');
      expect(data.targetAmount).toBe(1000000);
    });

    it('should validate required fields', async () => {
      const { POST } = await import('@/app/api/goals/route');

      const response = await POST(createRequest('POST', {
        // Missing name, targetAmount, and priority
        type: 'savings',
      }) as never);

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/goals/[id]', () => {
    it('should return a specific goal', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'Emergency Fund',
        targetAmount: 1000000,
        currentAmount: 500000,
        contributions: [],
      });

      const { GET } = await import('@/app/api/goals/[id]/route');
      const response = await GET(
        createRequest('GET') as never,
        { params: Promise.resolve({ id: 'goal-1' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.name).toBe('Emergency Fund');
    });

    it('should return 404 for non-existent goal', async () => {
      const { GET } = await import('@/app/api/goals/[id]/route');
      const response = await GET(
        createRequest('GET') as never,
        { params: Promise.resolve({ id: 'non-existent' }) }
      );

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /api/goals/[id]', () => {
    it('should update goal fields', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'Emergency Fund',
        targetAmount: 1000000,
        currentAmount: 500000,
        monthlyTarget: 50000,
      });

      const { PATCH } = await import('@/app/api/goals/[id]/route');
      const response = await PATCH(
        createRequest('PATCH', {
          name: 'Updated Fund',
          monthlyTarget: 75000,
        }) as never,
        { params: Promise.resolve({ id: 'goal-1' }) }
      );

      expect(response.status).toBe(200);
      const goal = mockDb._getDoc(`users/${TEST_USER_ID}/goals`, 'goal-1');
      expect(goal?.name).toBe('Updated Fund');
      expect(goal?.monthlyTarget).toBe(75000);
    });

    it('should not allow updating currentAmount directly', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'Emergency Fund',
        targetAmount: 1000000,
        currentAmount: 500000,
      });

      const { PATCH } = await import('@/app/api/goals/[id]/route');
      await PATCH(
        createRequest('PATCH', {
          currentAmount: 999999, // Should be ignored
        }) as never,
        { params: Promise.resolve({ id: 'goal-1' }) }
      );

      // currentAmount should not change
      const goal = mockDb._getDoc(`users/${TEST_USER_ID}/goals`, 'goal-1');
      expect(goal?.currentAmount).toBe(500000);
    });

    it('should return 404 for non-existent goal on PATCH', async () => {
      const { PATCH } = await import('@/app/api/goals/[id]/route');
      const response = await PATCH(
        createRequest('PATCH', { name: 'Updated' }) as never,
        { params: Promise.resolve({ id: 'non-existent' }) }
      );

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/goals/[id]', () => {
    it('should archive a goal (soft delete)', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'Emergency Fund',
        targetAmount: 1000000,
        status: 'active',
      });

      const { DELETE } = await import('@/app/api/goals/[id]/route');
      const response = await DELETE(
        createRequest('DELETE') as never,
        { params: Promise.resolve({ id: 'goal-1' }) }
      );

      expect(response.status).toBe(200);
      const goal = mockDb._getDoc(`users/${TEST_USER_ID}/goals`, 'goal-1');
      // Goals are archived, not deleted
      expect(goal?.status).toBe('archived');
    });

    it('should return 404 for non-existent goal on DELETE', async () => {
      const { DELETE } = await import('@/app/api/goals/[id]/route');
      const response = await DELETE(
        createRequest('DELETE') as never,
        { params: Promise.resolve({ id: 'non-existent' }) }
      );

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/goals/[id]/contribute', () => {
    it('should add a contribution to the goal', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'Emergency Fund',
        targetAmount: 1000000,
        currentAmount: 0,
        contributions: [],
      });

      const { POST } = await import('@/app/api/goals/[id]/contribute/route');
      const response = await POST(
        createRequest('POST', {
          amount: 50000,
          note: 'Monthly contribution',
        }) as never,
        { params: Promise.resolve({ id: 'goal-1' }) }
      );

      expect(response.status).toBe(200);
      const goal = mockDb._getDoc(`users/${TEST_USER_ID}/goals`, 'goal-1');
      expect(goal?.currentAmount).toBe(50000);
      expect(goal?.contributions).toHaveLength(1);
    });
  });
});
