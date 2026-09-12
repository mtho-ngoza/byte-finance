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

function createRequest(method: string, body?: unknown, url = 'http://localhost/api/insights') {
  return {
    method,
    url,
    json: async () => body ?? {},
    headers: new Map(),
  };
}

describe('Insights API', () => {
  beforeEach(() => {
    mockDb = createMockFirestore();
    vi.clearAllMocks();
  });

  describe('GET /api/insights', () => {
    it('should return active insights', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      mockDb._setDoc(`users/${TEST_USER_ID}/insights`, 'insight-1', {
        type: 'tip',
        title: 'Save more',
        message: 'Consider increasing your savings rate',
        isDismissed: false,
        expiresAt: futureDate,
        createdAt: new Date(),
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/insights`, 'insight-2', {
        type: 'warning',
        title: 'Budget exceeded',
        message: 'You have exceeded your budget',
        isDismissed: false,
        expiresAt: futureDate,
        createdAt: new Date(),
      });

      const { GET } = await import('@/app/api/insights/route');
      const response = await GET(createRequest('GET') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.insights).toHaveLength(2);
    });

    it('should return empty array when no insights', async () => {
      const { GET } = await import('@/app/api/insights/route');
      const response = await GET(createRequest('GET') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.insights).toEqual([]);
    });

    it('should filter out dismissed insights', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/insights`, 'insight-1', {
        type: 'tip',
        title: 'Active insight',
        isDismissed: false,
        createdAt: new Date(),
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/insights`, 'insight-2', {
        type: 'tip',
        title: 'Dismissed insight',
        isDismissed: true,
        createdAt: new Date(),
      });

      const { GET } = await import('@/app/api/insights/route');
      const response = await GET(createRequest('GET') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      // Only non-dismissed insights are queried (isDismissed: false)
      expect(data.insights.length).toBe(1);
      expect(data.insights[0].title).toBe('Active insight');
    });

    it('should filter out expired insights', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 7);

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      // Create mock Firestore timestamps with toDate() method
      const createTimestamp = (date: Date) => ({
        toDate: () => date,
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/insights`, 'insight-1', {
        type: 'tip',
        title: 'Valid insight',
        isDismissed: false,
        expiresAt: createTimestamp(futureDate),
        createdAt: createTimestamp(new Date()),
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/insights`, 'insight-2', {
        type: 'tip',
        title: 'Expired insight',
        isDismissed: false,
        expiresAt: createTimestamp(pastDate),
        createdAt: createTimestamp(new Date()),
      });

      const { GET } = await import('@/app/api/insights/route');
      const response = await GET(createRequest('GET') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      // Expired insights filtered out in post-processing
      expect(data.insights.every((i: { title: string }) => i.title !== 'Expired insight')).toBe(true);
    });

    it('should include insights without expiry date', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/insights`, 'insight-1', {
        type: 'tip',
        title: 'No expiry',
        isDismissed: false,
        expiresAt: null,
        createdAt: new Date(),
      });

      const { GET } = await import('@/app/api/insights/route');
      const response = await GET(createRequest('GET') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.insights).toHaveLength(1);
      expect(data.insights[0].title).toBe('No expiry');
    });
  });

  describe('GET /api/insights/[id]', () => {
    it('should return 404 for non-existent insight', async () => {
      const { GET } = await import('@/app/api/insights/[id]/route');
      const response = await GET(
        createRequest('GET') as never,
        { params: Promise.resolve({ id: 'non-existent' }) }
      );

      expect(response.status).toBe(404);
    });

    it('should return a single insight', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/insights`, 'insight-1', {
        type: 'tip',
        title: 'Test Insight',
        message: 'Test message',
        isDismissed: false,
      });

      const { GET } = await import('@/app/api/insights/[id]/route');
      const response = await GET(
        createRequest('GET') as never,
        { params: Promise.resolve({ id: 'insight-1' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.title).toBe('Test Insight');
    });
  });

  describe('PATCH /api/insights/[id]', () => {
    it('should return 404 for non-existent insight', async () => {
      const { PATCH } = await import('@/app/api/insights/[id]/route');
      const response = await PATCH(
        createRequest('PATCH', { isRead: true }) as never,
        { params: Promise.resolve({ id: 'non-existent' }) }
      );

      expect(response.status).toBe(404);
    });

    it('should mark insight as read', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/insights`, 'insight-1', {
        type: 'tip',
        title: 'Unread Insight',
        isRead: false,
        isDismissed: false,
      });

      const { PATCH } = await import('@/app/api/insights/[id]/route');
      const response = await PATCH(
        createRequest('PATCH', { isRead: true }) as never,
        { params: Promise.resolve({ id: 'insight-1' }) }
      );

      expect(response.status).toBe(200);
      const insight = mockDb._getDoc(`users/${TEST_USER_ID}/insights`, 'insight-1');
      expect(insight?.isRead).toBe(true);
    });

    it('should dismiss an insight', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/insights`, 'insight-1', {
        type: 'warning',
        title: 'Dismissable',
        isDismissed: false,
      });

      const { PATCH } = await import('@/app/api/insights/[id]/route');
      const response = await PATCH(
        createRequest('PATCH', { isDismissed: true }) as never,
        { params: Promise.resolve({ id: 'insight-1' }) }
      );

      expect(response.status).toBe(200);
      const insight = mockDb._getDoc(`users/${TEST_USER_ID}/insights`, 'insight-1');
      expect(insight?.isDismissed).toBe(true);
    });

    it('should snooze an insight', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/insights`, 'insight-1', {
        type: 'tip',
        title: 'Snoozable',
        isDismissed: false,
      });

      const snoozeDate = new Date();
      snoozeDate.setDate(snoozeDate.getDate() + 7);

      const { PATCH } = await import('@/app/api/insights/[id]/route');
      const response = await PATCH(
        createRequest('PATCH', { snoozeUntil: snoozeDate.toISOString() }) as never,
        { params: Promise.resolve({ id: 'insight-1' }) }
      );

      expect(response.status).toBe(200);
      const insight = mockDb._getDoc(`users/${TEST_USER_ID}/insights`, 'insight-1');
      expect(insight?.expiresAt).toBeDefined();
      expect(insight?.snoozedAt).toBeDefined();
    });
  });

  describe('DELETE /api/insights/[id]', () => {
    it('should return 404 for non-existent insight', async () => {
      const { DELETE } = await import('@/app/api/insights/[id]/route');
      const response = await DELETE(
        createRequest('DELETE') as never,
        { params: Promise.resolve({ id: 'non-existent' }) }
      );

      expect(response.status).toBe(404);
    });

    it('should permanently delete an insight', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/insights`, 'insight-1', {
        type: 'tip',
        title: 'To Delete',
        isDismissed: false,
      });

      const { DELETE } = await import('@/app/api/insights/[id]/route');
      const response = await DELETE(
        createRequest('DELETE') as never,
        { params: Promise.resolve({ id: 'insight-1' }) }
      );

      expect(response.status).toBe(200);
      const insight = mockDb._getDoc(`users/${TEST_USER_ID}/insights`, 'insight-1');
      expect(insight).toBeUndefined();
    });
  });
});
