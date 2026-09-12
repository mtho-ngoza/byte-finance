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

function createRequest(method: string, body?: unknown, url = 'http://localhost/api/health-score') {
  return {
    method,
    url,
    json: async () => body,
    headers: new Map(),
  };
}

describe('Health Score API', () => {
  beforeEach(() => {
    mockDb = createMockFirestore();
    vi.clearAllMocks();

    // Setup default user preferences
    mockDb._setDoc('users', TEST_USER_ID, {
      preferences: {
        payDayType: 'last_working_day',
      },
    });
  });

  describe('GET /api/health-score', () => {
    it('should require cycleId parameter', async () => {
      const { GET } = await import('@/app/api/health-score/route');
      const response = await GET(createRequest('GET', null, 'http://localhost/api/health-score') as never);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('cycleId');
    });

    it('should return null when no health score exists', async () => {
      const { GET } = await import('@/app/api/health-score/route');
      const response = await GET(
        createRequest('GET', null, 'http://localhost/api/health-score?cycleId=2026-09') as never
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.healthScore).toBeNull();
    });

    it('should return existing health score', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/healthScores`, '2026-09', {
        totalScore: 75,
        trend: 'up',
        pillars: {
          budgetDiscipline: { score: 20 },
          savingsRate: { score: 18 },
          goalMomentum: { score: 20 },
          stabilityBuffer: { score: 17 },
        },
      });

      const { GET } = await import('@/app/api/health-score/route');
      const response = await GET(
        createRequest('GET', null, 'http://localhost/api/health-score?cycleId=2026-09') as never
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.healthScore.totalScore).toBe(75);
      expect(data.healthScore.trend).toBe('up');
    });
  });

  describe('POST /api/health-score', () => {
    it('should require cycleId', async () => {
      const { POST } = await import('@/app/api/health-score/route');
      const response = await POST(createRequest('POST', {}) as never);

      expect(response.status).toBe(400);
    });

    it('should calculate health score with no data', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        status: 'active',
        startDate: new Date('2026-08-31'),
        endDate: new Date('2026-09-29'),
      });

      const { POST } = await import('@/app/api/health-score/route');
      const response = await POST(createRequest('POST', { cycleId: '2026-09' }) as never);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.healthScore).toBeDefined();
      expect(data.healthScore.totalScore).toBeGreaterThanOrEqual(0);
      expect(data.healthScore.pillars).toBeDefined();
    });

    it('should calculate budget discipline from paid items', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        status: 'active',
        startDate: new Date('2026-08-31'),
        endDate: new Date('2026-09-29'),
      });

      // Add some cycle items
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        label: 'Rent',
        amount: 500000,
        status: 'paid',
        dueDate: new Date('2026-09-01'),
        paidDate: new Date('2026-09-01'),
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-2', {
        cycleId: '2026-09',
        label: 'Utilities',
        amount: 100000,
        status: 'paid',
        dueDate: new Date('2026-09-15'),
        paidDate: new Date('2026-09-10'),
      });

      const { POST } = await import('@/app/api/health-score/route');
      const response = await POST(createRequest('POST', { cycleId: '2026-09' }) as never);

      expect(response.status).toBe(201);
      const data = await response.json();
      // Both items paid on time = 100% = 25 points
      expect(data.healthScore.pillars.budgetDiscipline.score).toBe(25);
      expect(data.healthScore.pillars.budgetDiscipline.paidOnTimePercent).toBe(100);
    });

    it('should calculate savings rate from income and contributions', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        status: 'active',
        startDate: new Date('2026-08-31'),
        endDate: new Date('2026-09-29'),
        income: {
          amount: 2500000, // R25,000
          vatAmount: 0,
        },
      });

      // Add a goal with contributions in this cycle
      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'Emergency Fund',
        status: 'active',
        contributions: [
          { id: 'c1', amount: 500000, date: new Date('2026-09-15') }, // R5,000 savings
        ],
      });

      const { POST } = await import('@/app/api/health-score/route');
      const response = await POST(createRequest('POST', { cycleId: '2026-09' }) as never);

      expect(response.status).toBe(201);
      const data = await response.json();
      // 20% savings rate (5000/25000) should give good score
      expect(data.healthScore.pillars.savingsRate.rate).toBe(20);
      expect(data.healthScore.pillars.savingsRate.savingsAmount).toBe(500000);
    });

    it('should calculate goal momentum from contributions', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        status: 'active',
        startDate: new Date('2026-08-31'),
        endDate: new Date('2026-09-29'),
      });

      // Add goals with multiple contributions
      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'Emergency Fund',
        status: 'active',
        targetAmount: 1000000,
        contributions: [
          { id: 'c1', amount: 100000, date: new Date('2026-09-05') },
          { id: 'c2', amount: 100000, date: new Date('2026-09-15') },
          { id: 'c3', amount: 100000, date: new Date('2026-09-25') },
        ],
      });

      const { POST } = await import('@/app/api/health-score/route');
      const response = await POST(createRequest('POST', { cycleId: '2026-09' }) as never);

      expect(response.status).toBe(201);
      const data = await response.json();
      // 3 contributions should give good momentum score
      expect(data.healthScore.pillars.goalMomentum.recentContributions).toBe(3);
    });

    it('should track trend compared to previous month', async () => {
      // Set previous month score
      mockDb._setDoc(`users/${TEST_USER_ID}/healthScores`, '2026-08', {
        totalScore: 50,
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        status: 'active',
        startDate: new Date('2026-08-31'),
        endDate: new Date('2026-09-29'),
      });

      const { POST } = await import('@/app/api/health-score/route');
      const response = await POST(createRequest('POST', { cycleId: '2026-09' }) as never);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.healthScore.previousScore).toBe(50);
      // Trend should be calculated
      expect(['up', 'down', 'stable']).toContain(data.healthScore.trend);
    });

    it('should generate tips for weak pillars', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        status: 'active',
        startDate: new Date('2026-08-31'),
        endDate: new Date('2026-09-29'),
        income: { amount: 0 }, // No income = 0 savings rate
      });

      const { POST } = await import('@/app/api/health-score/route');
      const response = await POST(createRequest('POST', { cycleId: '2026-09' }) as never);

      expect(response.status).toBe(201);
      const data = await response.json();
      // Should have tips array
      expect(Array.isArray(data.healthScore.tips)).toBe(true);
    });

    it('should handle year boundary for previous cycle', async () => {
      // January should look at December of previous year
      mockDb._setDoc(`users/${TEST_USER_ID}/healthScores`, '2025-12', {
        totalScore: 60,
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-01', {
        status: 'active',
        startDate: new Date('2025-12-25'),
        endDate: new Date('2026-01-24'),
      });

      const { POST } = await import('@/app/api/health-score/route');
      const response = await POST(createRequest('POST', { cycleId: '2026-01' }) as never);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.healthScore.previousScore).toBe(60);
    });
  });
});
