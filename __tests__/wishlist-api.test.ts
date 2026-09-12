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

function createRequest(method: string, body?: unknown, url = 'http://localhost/api/wishlist') {
  return {
    method,
    url,
    json: async () => body,
    headers: new Map(),
  };
}

describe('Wishlist API', () => {
  beforeEach(() => {
    mockDb = createMockFirestore();
    vi.clearAllMocks();
  });

  describe('GET /api/wishlist', () => {
    it('should return all wishlist items', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/wishlist`, 'item-1', {
        title: 'New Laptop',
        targetAmount: 1500000,
        status: 'active',
        targetYear: 2026,
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/wishlist`, 'item-2', {
        title: 'Vacation',
        targetAmount: 3000000,
        status: 'active',
        targetYear: 2026,
      });

      const { GET } = await import('@/app/api/wishlist/route');
      const response = await GET(createRequest('GET') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.items).toHaveLength(2);
    });
  });

  describe('POST /api/wishlist', () => {
    it('should create a wishlist item', async () => {
      const { POST } = await import('@/app/api/wishlist/route');

      const response = await POST(createRequest('POST', {
        title: 'New Car',
        type: 'long-term',
        targetYear: 2027,
        targetAmount: 20000000,
      }) as never);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.title).toBe('New Car');
      expect(data.targetYear).toBe(2027);
    });

    it('should calculate progress from linked goal using contributions', async () => {
      // Setup a goal with contributions
      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'Car Fund',
        targetAmount: 20000000,
        currentAmount: 5000000, // This is stale
        contributions: [
          { id: 'c1', amount: 2500000 },
          { id: 'c2', amount: 3000000 },
        ], // Total: 5500000 (this is accurate)
      });

      const { POST } = await import('@/app/api/wishlist/route');
      const response = await POST(createRequest('POST', {
        title: 'New Car',
        type: 'long-term',
        targetYear: 2027,
        linkedGoalId: 'goal-1',
      }) as never);

      expect(response.status).toBe(201);
      const data = await response.json();
      // Should use calculated balance from contributions (5500000), not stale currentAmount
      expect(data.currentAmount).toBe(5500000);
      expect(data.progress).toBe(28); // 5500000 / 20000000 * 100 = 27.5 rounded
    });
  });

  describe('GET /api/wishlist/[id]', () => {
    it('should return 404 for non-existent item', async () => {
      const { GET } = await import('@/app/api/wishlist/[id]/route');
      const response = await GET(
        createRequest('GET') as never,
        { params: Promise.resolve({ id: 'non-existent' }) }
      );

      expect(response.status).toBe(404);
    });

    it('should return a single wishlist item', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/wishlist`, 'item-1', {
        title: 'New Laptop',
        targetAmount: 1500000,
        status: 'active',
      });

      const { GET } = await import('@/app/api/wishlist/[id]/route');
      const response = await GET(
        createRequest('GET') as never,
        { params: Promise.resolve({ id: 'item-1' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.title).toBe('New Laptop');
    });
  });

  describe('PATCH /api/wishlist/[id]', () => {
    it('should return 404 for non-existent item', async () => {
      const { PATCH } = await import('@/app/api/wishlist/[id]/route');
      const response = await PATCH(
        createRequest('PATCH', { title: 'Updated' }) as never,
        { params: Promise.resolve({ id: 'non-existent' }) }
      );

      expect(response.status).toBe(404);
    });

    it('should update wishlist item', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/wishlist`, 'item-1', {
        title: 'New Laptop',
        targetAmount: 1500000,
        status: 'active',
        targetYear: 2026,
      });

      const { PATCH } = await import('@/app/api/wishlist/[id]/route');
      const response = await PATCH(
        createRequest('PATCH', { title: 'Gaming Laptop' }) as never,
        { params: Promise.resolve({ id: 'item-1' }) }
      );

      expect(response.status).toBe(200);
      const item = mockDb._getDoc(`users/${TEST_USER_ID}/wishlist`, 'item-1');
      expect(item?.title).toBe('Gaming Laptop');
    });

    it('should set progress to 100 when marking as completed', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/wishlist`, 'item-1', {
        title: 'Vacation',
        targetAmount: 3000000,
        status: 'active',
        progress: 75,
      });

      const { PATCH } = await import('@/app/api/wishlist/[id]/route');
      const response = await PATCH(
        createRequest('PATCH', { status: 'completed' }) as never,
        { params: Promise.resolve({ id: 'item-1' }) }
      );

      expect(response.status).toBe(200);
      const item = mockDb._getDoc(`users/${TEST_USER_ID}/wishlist`, 'item-1');
      expect(item?.status).toBe('completed');
      expect(item?.progress).toBe(100);
      expect(item?.completedAt).toBeDefined();
    });

    it('should calculate progress when linking to goal', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/wishlist`, 'item-1', {
        title: 'New Laptop',
        targetAmount: 1500000,
        status: 'active',
        progress: 0,
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'Laptop Fund',
        targetAmount: 1500000,
        contributions: [
          { id: 'c1', amount: 750000 },
        ],
      });

      const { PATCH } = await import('@/app/api/wishlist/[id]/route');
      const response = await PATCH(
        createRequest('PATCH', { linkedGoalId: 'goal-1' }) as never,
        { params: Promise.resolve({ id: 'item-1' }) }
      );

      expect(response.status).toBe(200);
      const item = mockDb._getDoc(`users/${TEST_USER_ID}/wishlist`, 'item-1');
      expect(item?.currentAmount).toBe(750000);
      expect(item?.progress).toBe(50);
    });

    it('should auto-complete when linking to completed goal', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/wishlist`, 'item-1', {
        title: 'New Laptop',
        targetAmount: 1500000,
        status: 'active',
        progress: 0,
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'Laptop Fund',
        targetAmount: 1500000,
        status: 'completed',
        contributions: [
          { id: 'c1', amount: 1500000 },
        ],
      });

      const { PATCH } = await import('@/app/api/wishlist/[id]/route');
      const response = await PATCH(
        createRequest('PATCH', { linkedGoalId: 'goal-1' }) as never,
        { params: Promise.resolve({ id: 'item-1' }) }
      );

      expect(response.status).toBe(200);
      const item = mockDb._getDoc(`users/${TEST_USER_ID}/wishlist`, 'item-1');
      expect(item?.status).toBe('completed');
      expect(item?.progress).toBe(100);
    });
  });

  describe('DELETE /api/wishlist/[id]', () => {
    it('should return 404 for non-existent item', async () => {
      const { DELETE } = await import('@/app/api/wishlist/[id]/route');
      const response = await DELETE(
        createRequest('DELETE') as never,
        { params: Promise.resolve({ id: 'non-existent' }) }
      );

      expect(response.status).toBe(404);
    });

    it('should delete wishlist item', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/wishlist`, 'item-1', {
        title: 'New Laptop',
        status: 'active',
      });

      const { DELETE } = await import('@/app/api/wishlist/[id]/route');
      const response = await DELETE(
        createRequest('DELETE') as never,
        { params: Promise.resolve({ id: 'item-1' }) }
      );

      expect(response.status).toBe(200);
      const item = mockDb._getDoc(`users/${TEST_USER_ID}/wishlist`, 'item-1');
      expect(item).toBeUndefined();
    });
  });

  describe('POST /api/wishlist/sync', () => {
    it('should sync progress from linked goals', async () => {
      // Setup wishlist item linked to a goal
      mockDb._setDoc(`users/${TEST_USER_ID}/wishlist`, 'item-1', {
        title: 'New Laptop',
        linkedGoalId: 'goal-1',
        status: 'active',
        currentAmount: 0,
        targetAmount: 1500000,
        progress: 0,
      });

      // Setup goal with contributions
      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'Laptop Fund',
        targetAmount: 1500000,
        status: 'active',
        contributions: [
          { id: 'c1', amount: 500000 },
          { id: 'c2', amount: 250000 },
        ],
      });

      const { POST } = await import('@/app/api/wishlist/sync/route');
      const response = await POST(createRequest('POST') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.updated).toBe(1);

      const item = mockDb._getDoc(`users/${TEST_USER_ID}/wishlist`, 'item-1');
      expect(item?.currentAmount).toBe(750000);
      expect(item?.progress).toBe(50);
    });

    it('should detect targetAmount changes', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/wishlist`, 'item-1', {
        title: 'New Laptop',
        linkedGoalId: 'goal-1',
        status: 'active',
        currentAmount: 500000,
        targetAmount: 1000000, // Old target
        progress: 50,
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'Laptop Fund',
        targetAmount: 1500000, // New target
        status: 'active',
        contributions: [
          { id: 'c1', amount: 500000 },
        ],
      });

      const { POST } = await import('@/app/api/wishlist/sync/route');
      const response = await POST(createRequest('POST') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.updated).toBe(1);

      const item = mockDb._getDoc(`users/${TEST_USER_ID}/wishlist`, 'item-1');
      expect(item?.targetAmount).toBe(1500000);
      expect(item?.progress).toBe(33); // 500000 / 1500000
    });

    it('should auto-complete when goal is completed', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/wishlist`, 'item-1', {
        title: 'New Laptop',
        linkedGoalId: 'goal-1',
        status: 'active',
        currentAmount: 1500000,
        targetAmount: 1500000,
        progress: 100,
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'Laptop Fund',
        targetAmount: 1500000,
        status: 'completed', // Goal completed
        contributions: [
          { id: 'c1', amount: 1500000 },
        ],
      });

      const { POST } = await import('@/app/api/wishlist/sync/route');
      await POST(createRequest('POST') as never);

      const item = mockDb._getDoc(`users/${TEST_USER_ID}/wishlist`, 'item-1');
      expect(item?.status).toBe('completed');
    });
  });
});
