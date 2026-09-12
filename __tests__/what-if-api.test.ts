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

function createRequest(method: string, body?: unknown, url = 'http://localhost/api/what-if') {
  return {
    method,
    url,
    json: async () => body,
    headers: new Map(),
  };
}

describe('What-If API', () => {
  beforeEach(() => {
    mockDb = createMockFirestore();
    vi.clearAllMocks();
  });

  describe('POST /api/what-if', () => {
    it('should require scenario parameter', async () => {
      const { POST } = await import('@/app/api/what-if/route');
      const response = await POST(createRequest('POST', {}) as never);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('scenario');
    });

    it('should reject unknown scenario types', async () => {
      const { POST } = await import('@/app/api/what-if/route');
      const response = await POST(createRequest('POST', { scenario: 'invalid' }) as never);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Unknown');
    });

    describe('extra_savings scenario', () => {
      it('should require goalId and amount', async () => {
        const { POST } = await import('@/app/api/what-if/route');
        const response = await POST(createRequest('POST', { scenario: 'extra_savings' }) as never);

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toContain('goalId');
      });

      it('should return 404 for non-existent goal', async () => {
        const { POST } = await import('@/app/api/what-if/route');
        const response = await POST(createRequest('POST', {
          scenario: 'extra_savings',
          goalId: 'non-existent',
          amount: 50000,
        }) as never);

        expect(response.status).toBe(404);
      });

      it('should calculate extra savings impact', async () => {
        mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
          name: 'Emergency Fund',
          type: 'savings',
          targetAmount: 5000000,
          monthlyTarget: 200000,
          contributions: [
            { id: 'c1', amount: 500000 },
          ],
        });

        const { POST } = await import('@/app/api/what-if/route');
        const response = await POST(createRequest('POST', {
          scenario: 'extra_savings',
          goalId: 'goal-1',
          amount: 100000, // Extra R1000/month
        }) as never);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.scenario).toBe('extra_savings');
        expect(data.goalName).toBe('Emergency Fund');
        expect(data.summary.timeSaved).toBeGreaterThanOrEqual(0);
      });

      it('should use linked commitment amount if available', async () => {
        mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
          name: 'Emergency Fund',
          type: 'savings',
          targetAmount: 5000000,
          monthlyTarget: 200000,
          contributions: [],
        });

        mockDb._setDoc(`users/${TEST_USER_ID}/commitments`, 'commit-1', {
          linkedGoalId: 'goal-1',
          isActive: true,
          amount: 300000, // Higher than monthlyTarget
        });

        const { POST } = await import('@/app/api/what-if/route');
        const response = await POST(createRequest('POST', {
          scenario: 'extra_savings',
          goalId: 'goal-1',
          amount: 50000,
        }) as never);

        expect(response.status).toBe(200);
        const data = await response.json();
        // Should use commitment amount (300000) as currentMonthly
        expect(data.input.currentMonthly).toBe(300000);
      });
    });

    describe('one_time_boost scenario', () => {
      it('should require goalId and amount', async () => {
        const { POST } = await import('@/app/api/what-if/route');
        const response = await POST(createRequest('POST', { scenario: 'one_time_boost' }) as never);

        expect(response.status).toBe(400);
      });

      it('should calculate one-time boost impact', async () => {
        mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
          name: 'Vacation Fund',
          type: 'savings',
          targetAmount: 3000000,
          monthlyTarget: 150000,
          contributions: [
            { id: 'c1', amount: 500000 },
          ],
        });

        const { POST } = await import('@/app/api/what-if/route');
        const response = await POST(createRequest('POST', {
          scenario: 'one_time_boost',
          goalId: 'goal-1',
          amount: 500000, // R5000 one-time
        }) as never);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.scenario).toBe('one_time_boost');
        expect(data.input.boostAmount).toBe(500000);
      });
    });

    describe('extra_debt_payment scenario', () => {
      it('should require goalId and amount', async () => {
        const { POST } = await import('@/app/api/what-if/route');
        const response = await POST(createRequest('POST', { scenario: 'extra_debt_payment' }) as never);

        expect(response.status).toBe(400);
      });

      it('should only work with debt_payoff goals', async () => {
        mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
          name: 'Savings Goal',
          type: 'savings', // Not a debt
          targetAmount: 100000,
        });

        const { POST } = await import('@/app/api/what-if/route');
        const response = await POST(createRequest('POST', {
          scenario: 'extra_debt_payment',
          goalId: 'goal-1',
          amount: 50000,
        }) as never);

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toContain('debt payoff');
      });

      it('should calculate extra debt payment impact', async () => {
        mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
          name: 'Credit Card',
          type: 'debt_payoff',
          status: 'active',
          targetAmount: 5000000,
          monthlyTarget: 200000,
          debtTracking: {
            originalBalance: 5000000,
            interestRate: 21,
            minimumPayment: 150000,
          },
          contributions: [
            { id: 'c1', amount: 500000 },
          ],
        });

        const { POST } = await import('@/app/api/what-if/route');
        const response = await POST(createRequest('POST', {
          scenario: 'extra_debt_payment',
          goalId: 'goal-1',
          amount: 100000, // Extra R1000/month
        }) as never);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.scenario).toBe('extra_debt_payment');
        expect(data.input.extraPayment).toBe(100000);
        expect(data.summary.interestSaved).toBeGreaterThanOrEqual(0);
      });

      it('should fallback to monthlyTarget if no minimumPayment', async () => {
        mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
          name: 'Store Account',
          type: 'debt_payoff',
          status: 'active',
          targetAmount: 1000000,
          monthlyTarget: 100000,
          debtTracking: {
            originalBalance: 1000000,
            interestRate: 0,
          },
          contributions: [],
        });

        const { POST } = await import('@/app/api/what-if/route');
        const response = await POST(createRequest('POST', {
          scenario: 'extra_debt_payment',
          goalId: 'goal-1',
          amount: 50000,
        }) as never);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.input.minimumPayment).toBe(100000);
      });
    });

    describe('debt_strategy scenario', () => {
      it('should return error when no debts exist', async () => {
        const { POST } = await import('@/app/api/what-if/route');
        const response = await POST(createRequest('POST', { scenario: 'debt_strategy' }) as never);

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toContain('No active debts');
      });

      it('should compare snowball vs avalanche strategies', async () => {
        // Add multiple debts
        mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'debt-1', {
          name: 'Credit Card',
          type: 'debt_payoff',
          status: 'active',
          targetAmount: 3000000,
          monthlyTarget: 100000,
          debtTracking: {
            originalBalance: 3000000,
            interestRate: 21,
            minimumPayment: 100000,
          },
          contributions: [],
        });

        mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'debt-2', {
          name: 'Store Account',
          type: 'debt_payoff',
          status: 'active',
          targetAmount: 500000,
          monthlyTarget: 50000,
          debtTracking: {
            originalBalance: 500000,
            interestRate: 15,
            minimumPayment: 50000,
          },
          contributions: [],
        });

        const { POST } = await import('@/app/api/what-if/route');
        const response = await POST(createRequest('POST', {
          scenario: 'debt_strategy',
          extraBudget: 50000,
        }) as never);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.scenario).toBe('debt_strategy');
        expect(data.debts).toHaveLength(2);
        expect(data.comparison.snowball).toBeDefined();
        expect(data.comparison.avalanche).toBeDefined();
      });

      it('should ignore fully paid debts', async () => {
        mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'debt-1', {
          name: 'Paid Debt',
          type: 'debt_payoff',
          status: 'active',
          targetAmount: 100000,
          debtTracking: {
            originalBalance: 100000,
            minimumPayment: 50000,
          },
          contributions: [
            { id: 'c1', amount: 100000 }, // Fully paid off
          ],
        });

        const { POST } = await import('@/app/api/what-if/route');
        const response = await POST(createRequest('POST', { scenario: 'debt_strategy' }) as never);

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toContain('No active debts');
      });
    });

    describe('emergency_buffer scenario', () => {
      it('should require targetMonths', async () => {
        const { POST } = await import('@/app/api/what-if/route');
        const response = await POST(createRequest('POST', { scenario: 'emergency_buffer' }) as never);

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toContain('targetMonths');
      });

      it('should calculate emergency buffer requirements', async () => {
        // Setup current cycle with expenses
        const now = new Date();
        const cycleId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, cycleId, {
          status: 'active',
          totalCommitted: 2000000, // R20,000 monthly expenses
        });

        // Setup emergency fund goal
        mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'emergency-1', {
          name: 'Emergency Fund',
          type: 'savings',
          status: 'active',
          targetAmount: 12000000,
          monthlyTarget: 200000,
          contributions: [
            { id: 'c1', amount: 2000000 }, // R20,000 saved (1 month)
          ],
        });

        const { POST } = await import('@/app/api/what-if/route');
        const response = await POST(createRequest('POST', {
          scenario: 'emergency_buffer',
          targetMonths: 6,
        }) as never);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.scenario).toBe('emergency_buffer');
        expect(data.goalName).toBe('Emergency Fund');
        expect(data.input.targetMonths).toBe(6);
      });

      it('should use linked commitment for monthly savings', async () => {
        const now = new Date();
        const cycleId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, cycleId, {
          totalCommitted: 1500000,
        });

        mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'emergency-1', {
          name: 'My Emergency Fund',
          type: 'savings',
          status: 'active',
          targetAmount: 9000000,
          monthlyTarget: 100000,
          contributions: [],
        });

        mockDb._setDoc(`users/${TEST_USER_ID}/commitments`, 'commit-1', {
          linkedGoalId: 'emergency-1',
          isActive: true,
          amount: 250000,
        });

        const { POST } = await import('@/app/api/what-if/route');
        const response = await POST(createRequest('POST', {
          scenario: 'emergency_buffer',
          targetMonths: 6,
        }) as never);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.input.currentMonthlySavings).toBe(250000);
      });
    });
  });
});
