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

function createRequest(method: string, body?: unknown, url = 'http://localhost/api/export') {
  return {
    method,
    url,
    json: async () => body ?? {},
    headers: new Map(),
  };
}

describe('Export API', () => {
  beforeEach(() => {
    mockDb = createMockFirestore();
    vi.clearAllMocks();
  });

  describe('GET /api/export', () => {
    it('should export data as JSON by default', async () => {
      // Setup some test data
      mockDb._setDoc('users', TEST_USER_ID, {
        email: 'test@example.com',
        displayName: 'Test User',
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        totalCommitted: 500000,
        totalPaid: 450000,
        startDate: { toDate: () => new Date('2026-08-25') },
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        label: 'Rent',
        amount: 500000,
        category: 'housing',
        status: 'paid',
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/commitments`, 'comm-1', {
        label: 'Car Insurance',
        amount: 150000,
        sortOrder: 1,
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'Emergency Fund',
        targetAmount: 1000000,
        currentAmount: 500000,
      });

      const { GET } = await import('@/app/api/export/route');
      const response = await GET(createRequest('GET') as never);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('Content-Disposition')).toContain('.json');

      const text = await response.text();
      const data = JSON.parse(text);

      expect(data.version).toBe('1.0');
      expect(data.exportedAt).toBeDefined();
      expect(data.profile.email).toBe('test@example.com');
      expect(data.cycles).toHaveLength(1);
      expect(data.cycleItems).toHaveLength(1);
      expect(data.commitments).toHaveLength(1);
      expect(data.goals).toHaveLength(1);
      expect(data.stats.totalCycles).toBe(1);
      expect(data.stats.totalCycleItems).toBe(1);
    });

    it('should export data as CSV when format=csv', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        email: 'test@example.com',
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        label: 'Rent',
        amount: 500000,
        category: 'housing',
        accountType: 'cheque',
        status: 'paid',
        dueDate: '2026-09-01',
        paidDate: '2026-09-01',
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-2', {
        cycleId: '2026-09',
        label: 'Groceries',
        amount: 200000,
        category: 'family',
        status: 'upcoming',
        commitmentId: 'comm-1',
      });

      const { GET } = await import('@/app/api/export/route');
      const response = await GET(createRequest('GET', null, 'http://localhost/api/export?format=csv') as never);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/csv');
      expect(response.headers.get('Content-Disposition')).toContain('.csv');

      const csv = await response.text();
      const lines = csv.split('\n');

      // Check header
      expect(lines[0]).toContain('Cycle');
      expect(lines[0]).toContain('Label');
      expect(lines[0]).toContain('Amount');
      expect(lines[0]).toContain('Category');

      // Check data rows exist
      expect(lines.length).toBeGreaterThan(1);
      // Rent row
      expect(csv).toContain('Rent');
      expect(csv).toContain('housing');
      // Groceries row with commitment marked as Yes
      expect(csv).toContain('Groceries');
      expect(csv).toContain('Yes');
    });

    it('should handle empty collections', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        email: 'test@example.com',
      });

      const { GET } = await import('@/app/api/export/route');
      const response = await GET(createRequest('GET') as never);

      expect(response.status).toBe(200);
      const text = await response.text();
      const data = JSON.parse(text);

      expect(data.cycles).toEqual([]);
      expect(data.cycleItems).toEqual([]);
      expect(data.commitments).toEqual([]);
      expect(data.goals).toEqual([]);
      expect(data.projects).toEqual([]);
      expect(data.receipts).toEqual([]);
      expect(data.stats.totalCycles).toBe(0);
    });

    it('should convert Firestore timestamps to ISO strings', async () => {
      const testDate = new Date('2026-09-15T10:30:00Z');

      mockDb._setDoc('users', TEST_USER_ID, {
        email: 'test@example.com',
        createdAt: { toDate: () => testDate },
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        startDate: { toDate: () => testDate },
        endDate: { toDate: () => new Date('2026-10-14') },
      });

      const { GET } = await import('@/app/api/export/route');
      const response = await GET(createRequest('GET') as never);

      const text = await response.text();
      const data = JSON.parse(text);

      expect(data.profile.createdAt).toBe(testDate.toISOString());
      expect(data.cycles[0].startDate).toBe(testDate.toISOString());
    });

    it('should handle nested arrays and objects', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        email: 'test@example.com',
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'Vacation',
        contributions: [
          { amount: 100000, date: { toDate: () => new Date('2026-09-01') } },
          { amount: 150000, date: { toDate: () => new Date('2026-09-15') } },
        ],
      });

      const { GET } = await import('@/app/api/export/route');
      const response = await GET(createRequest('GET') as never);

      const text = await response.text();
      const data = JSON.parse(text);

      expect(data.goals[0].contributions).toHaveLength(2);
      expect(data.goals[0].contributions[0].amount).toBe(100000);
      expect(data.goals[0].contributions[0].date).toBeDefined();
    });

    it('should escape CSV special characters', async () => {
      mockDb._setDoc('users', TEST_USER_ID, {
        email: 'test@example.com',
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        label: 'Item with, comma',
        amount: 100000,
        category: 'other',
        status: 'paid',
        notes: 'Note with "quotes" and, comma',
      });

      const { GET } = await import('@/app/api/export/route');
      const response = await GET(createRequest('GET', null, 'http://localhost/api/export?format=csv') as never);

      const csv = await response.text();
      // Values with commas or quotes should be escaped
      expect(csv).toContain('"Item with, comma"');
    });

    it('should include all collection stats', async () => {
      mockDb._setDoc('users', TEST_USER_ID, { email: 'test@example.com' });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, 'c1', { id: 'c1' });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, 'c2', { id: 'c2' });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'i1', { id: 'i1' });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'i2', { id: 'i2' });
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'i3', { id: 'i3' });
      mockDb._setDoc(`users/${TEST_USER_ID}/commitments`, 'cm1', { id: 'cm1' });
      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'g1', { id: 'g1' });
      mockDb._setDoc(`users/${TEST_USER_ID}/projects`, 'p1', { id: 'p1' });
      mockDb._setDoc(`users/${TEST_USER_ID}/projects`, 'p2', { id: 'p2' });
      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'r1', { id: 'r1' });

      const { GET } = await import('@/app/api/export/route');
      const response = await GET(createRequest('GET') as never);

      const text = await response.text();
      const data = JSON.parse(text);

      expect(data.stats.totalCycles).toBe(2);
      expect(data.stats.totalCycleItems).toBe(3);
      expect(data.stats.totalCommitments).toBe(1);
      expect(data.stats.totalGoals).toBe(1);
      expect(data.stats.totalProjects).toBe(2);
      expect(data.stats.totalReceipts).toBe(1);
    });

    it('should handle missing user profile', async () => {
      // Don't set up user doc - should still work

      const { GET } = await import('@/app/api/export/route');
      const response = await GET(createRequest('GET') as never);

      expect(response.status).toBe(200);
      const text = await response.text();
      const data = JSON.parse(text);

      expect(data.profile).toBeNull();
    });

    it('should include snapshots and insights', async () => {
      mockDb._setDoc('users', TEST_USER_ID, { email: 'test@example.com' });
      mockDb._setDoc(`users/${TEST_USER_ID}/snapshots`, '2026-09', {
        year: 2026,
        month: 9,
        totalPaid: 500000,
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/insights`, 'insight-1', {
        type: 'spending_trend',
        message: 'You spent 10% less this month',
        createdAt: { toDate: () => new Date() },
      });

      const { GET } = await import('@/app/api/export/route');
      const response = await GET(createRequest('GET') as never);

      const text = await response.text();
      const data = JSON.parse(text);

      expect(data.snapshots).toHaveLength(1);
      expect(data.snapshots[0].year).toBe(2026);
      expect(data.insights).toHaveLength(1);
      expect(data.insights[0].type).toBe('spending_trend');
    });
  });
});
