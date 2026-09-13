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

  describe('PATCH /api/goals/[id]/contributions/[contributionId]', () => {
    it('should return 404 for non-existent goal', async () => {
      const { PATCH } = await import('@/app/api/goals/[id]/contributions/[contributionId]/route');
      const response = await PATCH(
        createRequest('PATCH', { amount: 60000 }) as never,
        { params: Promise.resolve({ id: 'non-existent', contributionId: 'contrib-1' }) }
      );

      expect(response.status).toBe(404);
    });

    it('should return 404 for non-existent contribution', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'Emergency Fund',
        currentAmount: 50000,
        contributions: [{ id: 'contrib-1', amount: 50000 }],
      });

      const { PATCH } = await import('@/app/api/goals/[id]/contributions/[contributionId]/route');
      const response = await PATCH(
        createRequest('PATCH', { amount: 60000 }) as never,
        { params: Promise.resolve({ id: 'goal-1', contributionId: 'non-existent' }) }
      );

      expect(response.status).toBe(404);
    });

    it('should edit contribution amount', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'Emergency Fund',
        currentAmount: 50000,
        contributions: [{ id: 'contrib-1', amount: 50000, note: 'Initial' }],
      });

      const { PATCH } = await import('@/app/api/goals/[id]/contributions/[contributionId]/route');
      const response = await PATCH(
        createRequest('PATCH', { amount: 75000 }) as never,
        { params: Promise.resolve({ id: 'goal-1', contributionId: 'contrib-1' }) }
      );

      expect(response.status).toBe(200);
      const goal = mockDb._getDoc(`users/${TEST_USER_ID}/goals`, 'goal-1');
      expect(goal?.contributions[0].amount).toBe(75000);
      // currentAmount should be updated by delta (75000 - 50000 = 25000)
      expect(goal?.currentAmount).toBe(75000);
    });

    it('should edit contribution note', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'Emergency Fund',
        currentAmount: 50000,
        contributions: [{ id: 'contrib-1', amount: 50000, note: 'Old note' }],
      });

      const { PATCH } = await import('@/app/api/goals/[id]/contributions/[contributionId]/route');
      const response = await PATCH(
        createRequest('PATCH', { note: 'Updated note' }) as never,
        { params: Promise.resolve({ id: 'goal-1', contributionId: 'contrib-1' }) }
      );

      expect(response.status).toBe(200);
      const goal = mockDb._getDoc(`users/${TEST_USER_ID}/goals`, 'goal-1');
      expect(goal?.contributions[0].note).toBe('Updated note');
    });
  });

  describe('DELETE /api/goals/[id]/contributions/[contributionId]', () => {
    it('should return 404 for non-existent goal', async () => {
      const { DELETE } = await import('@/app/api/goals/[id]/contributions/[contributionId]/route');
      const response = await DELETE(
        createRequest('DELETE') as never,
        { params: Promise.resolve({ id: 'non-existent', contributionId: 'contrib-1' }) }
      );

      expect(response.status).toBe(404);
    });

    it('should return 404 for non-existent contribution', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'Emergency Fund',
        currentAmount: 50000,
        contributions: [{ id: 'contrib-1', amount: 50000 }],
      });

      const { DELETE } = await import('@/app/api/goals/[id]/contributions/[contributionId]/route');
      const response = await DELETE(
        createRequest('DELETE') as never,
        { params: Promise.resolve({ id: 'goal-1', contributionId: 'non-existent' }) }
      );

      expect(response.status).toBe(404);
    });

    it('should delete contribution and update currentAmount', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'Emergency Fund',
        currentAmount: 100000,
        contributions: [
          { id: 'contrib-1', amount: 50000 },
          { id: 'contrib-2', amount: 50000 },
        ],
      });

      const { DELETE } = await import('@/app/api/goals/[id]/contributions/[contributionId]/route');
      const response = await DELETE(
        createRequest('DELETE') as never,
        { params: Promise.resolve({ id: 'goal-1', contributionId: 'contrib-1' }) }
      );

      expect(response.status).toBe(200);
      const goal = mockDb._getDoc(`users/${TEST_USER_ID}/goals`, 'goal-1');
      expect(goal?.contributions).toHaveLength(1);
      expect(goal?.contributions[0].id).toBe('contrib-2');
      expect(goal?.currentAmount).toBe(50000);
    });
  });

  describe('GET /api/goals/[id]/transactions', () => {
    it('should return 404 for non-existent goal', async () => {
      const { GET } = await import('@/app/api/goals/[id]/transactions/route');
      const response = await GET(
        createRequest('GET') as never,
        { params: Promise.resolve({ id: 'non-existent' }) }
      );

      expect(response.status).toBe(404);
    });

    it('should return 400 for non-project goal', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'Savings Goal',
        type: 'savings',
      });

      const { GET } = await import('@/app/api/goals/[id]/transactions/route');
      const response = await GET(
        createRequest('GET') as never,
        { params: Promise.resolve({ id: 'goal-1' }) }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('project');
    });

    it('should return transactions for project goal', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'House Renovation',
        type: 'project',
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/projectTransactions`, 'trans-1', {
        goalId: 'goal-1',
        type: 'contribution',
        amount: 100000,
        description: 'Initial deposit',
        date: new Date('2026-01-15'),
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/projectTransactions`, 'trans-2', {
        goalId: 'goal-1',
        type: 'payment',
        amount: 50000,
        description: 'Paint supplies',
        date: new Date('2026-01-20'),
      });

      const { GET } = await import('@/app/api/goals/[id]/transactions/route');
      const response = await GET(
        createRequest('GET') as never,
        { params: Promise.resolve({ id: 'goal-1' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.transactions).toHaveLength(2);
    });
  });

  describe('POST /api/goals/[id]/transactions', () => {
    it('should return 404 for non-existent goal', async () => {
      const { POST } = await import('@/app/api/goals/[id]/transactions/route');
      const response = await POST(
        createRequest('POST', {
          type: 'contribution',
          amount: 50000,
          description: 'Test',
        }) as never,
        { params: Promise.resolve({ id: 'non-existent' }) }
      );

      expect(response.status).toBe(404);
    });

    it('should return 400 for invalid type', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'House Renovation',
        type: 'project',
        currentAmount: 0,
      });

      const { POST } = await import('@/app/api/goals/[id]/transactions/route');
      const response = await POST(
        createRequest('POST', {
          type: 'invalid',
          amount: 50000,
          description: 'Test',
        }) as never,
        { params: Promise.resolve({ id: 'goal-1' }) }
      );

      expect(response.status).toBe(400);
    });

    it('should return 400 for invalid amount', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'House Renovation',
        type: 'project',
        currentAmount: 0,
      });

      const { POST } = await import('@/app/api/goals/[id]/transactions/route');
      const response = await POST(
        createRequest('POST', {
          type: 'contribution',
          amount: -100,
          description: 'Test',
        }) as never,
        { params: Promise.resolve({ id: 'goal-1' }) }
      );

      expect(response.status).toBe(400);
    });

    it('should return 400 for missing description', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'House Renovation',
        type: 'project',
        currentAmount: 0,
      });

      const { POST } = await import('@/app/api/goals/[id]/transactions/route');
      const response = await POST(
        createRequest('POST', {
          type: 'contribution',
          amount: 50000,
        }) as never,
        { params: Promise.resolve({ id: 'goal-1' }) }
      );

      expect(response.status).toBe(400);
    });

    it('should add contribution and increase currentAmount', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'House Renovation',
        type: 'project',
        currentAmount: 100000,
      });

      const { POST } = await import('@/app/api/goals/[id]/transactions/route');
      const response = await POST(
        createRequest('POST', {
          type: 'contribution',
          amount: 50000,
          description: 'Monthly deposit',
          contributorName: 'John',
        }) as never,
        { params: Promise.resolve({ id: 'goal-1' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.type).toBe('contribution');
      expect(data.amount).toBe(50000);

      const goal = mockDb._getDoc(`users/${TEST_USER_ID}/goals`, 'goal-1');
      expect(goal?.currentAmount).toBe(150000); // 100000 + 50000
    });

    it('should add payment and decrease currentAmount', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'House Renovation',
        type: 'project',
        currentAmount: 100000,
      });

      const { POST } = await import('@/app/api/goals/[id]/transactions/route');
      const response = await POST(
        createRequest('POST', {
          type: 'payment',
          amount: 30000,
          description: 'Paint supplies',
        }) as never,
        { params: Promise.resolve({ id: 'goal-1' }) }
      );

      expect(response.status).toBe(200);
      const goal = mockDb._getDoc(`users/${TEST_USER_ID}/goals`, 'goal-1');
      expect(goal?.currentAmount).toBe(70000); // 100000 - 30000
    });

    it('should link receipt to payment transaction', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'House Renovation',
        type: 'project',
        currentAmount: 100000,
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1', {
        imageUrl: 'https://example.com/receipt.jpg',
      });

      const { POST } = await import('@/app/api/goals/[id]/transactions/route');
      const response = await POST(
        createRequest('POST', {
          type: 'payment',
          amount: 30000,
          description: 'Hardware store',
          receiptId: 'receipt-1',
        }) as never,
        { params: Promise.resolve({ id: 'goal-1' }) }
      );

      expect(response.status).toBe(200);
      const receipt = mockDb._getDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1');
      expect(receipt?.projectGoalId).toBe('goal-1');
    });
  });

  describe('GET /api/goals/[id]/unlinked-payments', () => {
    it('should return 404 for non-existent goal', async () => {
      const { GET } = await import('@/app/api/goals/[id]/unlinked-payments/route');
      const response = await GET(
        createRequest('GET') as never,
        { params: Promise.resolve({ id: 'non-existent' }) }
      );

      expect(response.status).toBe(404);
    });

    it('should return empty array when no payments exist', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'Emergency Fund',
        contributions: [],
      });

      const { GET } = await import('@/app/api/goals/[id]/unlinked-payments/route');
      const response = await GET(
        createRequest('GET') as never,
        { params: Promise.resolve({ id: 'goal-1' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.payments).toHaveLength(0);
    });

    it('should return unlinked payments from cycle items', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'Emergency Fund',
        contributions: [],
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        label: 'September 2026',
        startDate: new Date('2026-09-01'),
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        label: 'Savings Transfer',
        payments: [
          { id: 'pay-1', amount: 50000, date: new Date('2026-09-05') },
          { id: 'pay-2', amount: 30000, date: new Date('2026-09-15'), note: 'Extra' },
        ],
      });

      const { GET } = await import('@/app/api/goals/[id]/unlinked-payments/route');
      const response = await GET(
        createRequest('GET') as never,
        { params: Promise.resolve({ id: 'goal-1' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.payments).toHaveLength(2);
      expect(data.payments[0].itemLabel).toBe('Savings Transfer');
    });

    it('should exclude already linked payments', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'Emergency Fund',
        contributions: [
          { id: 'item-1-pay-1', cycleItemId: 'item-1', amount: 50000 },
        ],
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        startDate: new Date('2026-09-01'),
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        label: 'Savings',
        payments: [
          { id: 'pay-1', amount: 50000, date: new Date('2026-09-05') },
          { id: 'pay-2', amount: 30000, date: new Date('2026-09-15') },
        ],
      });

      const { GET } = await import('@/app/api/goals/[id]/unlinked-payments/route');
      const response = await GET(
        createRequest('GET') as never,
        { params: Promise.resolve({ id: 'goal-1' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      // pay-1 is linked, only pay-2 should be returned
      expect(data.payments).toHaveLength(1);
      expect(data.payments[0].paymentId).toBe('pay-2');
    });
  });
});
