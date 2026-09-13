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

function createRequest(method: string, body?: unknown, url = 'http://localhost/api/vendor-rules') {
  return {
    method,
    url,
    json: async () => body,
    headers: new Map(),
  };
}

describe('Vendor Rules API', () => {
  beforeEach(() => {
    mockDb = createMockFirestore();
    vi.clearAllMocks();
  });

  describe('GET /api/vendor-rules', () => {
    it('should return all vendor rules', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/vendorRules`, 'rule-1', {
        vendor: 'Engen',
        category: 'transport',
        subCategory: 'fuel',
        confidence: 'user_set',
        matchCount: 5,
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/vendorRules`, 'rule-2', {
        vendor: 'Pick N Pay',
        category: 'lifestyle',
        subCategory: 'groceries',
        confidence: 'learned',
        matchCount: 12,
      });

      const { GET } = await import('@/app/api/vendor-rules/route');
      const response = await GET(createRequest('GET') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.rules).toHaveLength(2);
    });

    it('should return empty array when no rules exist', async () => {
      const { GET } = await import('@/app/api/vendor-rules/route');
      const response = await GET(createRequest('GET') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.rules).toEqual([]);
    });
  });

  describe('POST /api/vendor-rules', () => {
    it('should require vendor and category', async () => {
      const { POST } = await import('@/app/api/vendor-rules/route');
      const response = await POST(createRequest('POST', { vendor: 'Test' }) as never);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('category');
    });

    it('should reject invalid category', async () => {
      const { POST } = await import('@/app/api/vendor-rules/route');
      const response = await POST(createRequest('POST', {
        vendor: 'Test',
        category: 'invalid_category',
      }) as never);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Invalid category');
    });

    it('should reject empty vendor name', async () => {
      const { POST } = await import('@/app/api/vendor-rules/route');
      const response = await POST(createRequest('POST', {
        vendor: '   ',
        category: 'transport',
      }) as never);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Invalid vendor');
    });

    it('should create a vendor rule', async () => {
      const { POST } = await import('@/app/api/vendor-rules/route');
      const response = await POST(createRequest('POST', {
        vendor: 'engen',
        category: 'transport',
        subCategory: 'fuel',
      }) as never);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.vendor).toBe('Engen'); // Normalized
      expect(data.category).toBe('transport');
      expect(data.subCategory).toBe('fuel');
      expect(data.confidence).toBe('user_set');
      expect(data.matchCount).toBe(0);
    });

    it('should normalize vendor name to title case', async () => {
      const { POST } = await import('@/app/api/vendor-rules/route');
      const response = await POST(createRequest('POST', {
        vendor: 'PICK N PAY',
        category: 'lifestyle',
      }) as never);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.vendor).toBe('Pick N Pay');
    });

    it('should update existing rule if vendor already exists', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/vendorRules`, 'existing-rule', {
        vendor: 'Engen',
        category: 'other',
        confidence: 'learned',
        matchCount: 3,
      });

      const { POST } = await import('@/app/api/vendor-rules/route');
      const response = await POST(createRequest('POST', {
        vendor: 'Engen',
        category: 'transport',
        subCategory: 'fuel',
      }) as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.category).toBe('transport');
      expect(data.subCategory).toBe('fuel');
      expect(data.confidence).toBe('user_set');
    });
  });

  describe('GET /api/vendor-rules/[id]', () => {
    it('should return 404 for non-existent rule', async () => {
      const { GET } = await import('@/app/api/vendor-rules/[id]/route');
      const response = await GET(
        createRequest('GET') as never,
        { params: Promise.resolve({ id: 'non-existent' }) }
      );

      expect(response.status).toBe(404);
    });

    it('should return a single rule', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/vendorRules`, 'rule-1', {
        vendor: 'Checkers',
        category: 'lifestyle',
        subCategory: 'groceries',
        confidence: 'user_set',
        matchCount: 8,
      });

      const { GET } = await import('@/app/api/vendor-rules/[id]/route');
      const response = await GET(
        createRequest('GET') as never,
        { params: Promise.resolve({ id: 'rule-1' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.vendor).toBe('Checkers');
      expect(data.category).toBe('lifestyle');
    });
  });

  describe('PATCH /api/vendor-rules/[id]', () => {
    it('should return 404 for non-existent rule', async () => {
      const { PATCH } = await import('@/app/api/vendor-rules/[id]/route');
      const response = await PATCH(
        createRequest('PATCH', { category: 'transport' }) as never,
        { params: Promise.resolve({ id: 'non-existent' }) }
      );

      expect(response.status).toBe(404);
    });

    it('should update rule category', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/vendorRules`, 'rule-1', {
        vendor: 'Shell',
        category: 'other',
        confidence: 'learned',
        matchCount: 2,
      });

      const { PATCH } = await import('@/app/api/vendor-rules/[id]/route');
      const response = await PATCH(
        createRequest('PATCH', { category: 'transport', subCategory: 'fuel' }) as never,
        { params: Promise.resolve({ id: 'rule-1' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.category).toBe('transport');
      expect(data.subCategory).toBe('fuel');
    });

    it('should reject invalid category on update', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/vendorRules`, 'rule-1', {
        vendor: 'Test',
        category: 'other',
      });

      const { PATCH } = await import('@/app/api/vendor-rules/[id]/route');
      const response = await PATCH(
        createRequest('PATCH', { category: 'invalid' }) as never,
        { params: Promise.resolve({ id: 'rule-1' }) }
      );

      expect(response.status).toBe(400);
    });

    it('should update vendor name with normalization', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/vendorRules`, 'rule-1', {
        vendor: 'Test',
        category: 'other',
      });

      const { PATCH } = await import('@/app/api/vendor-rules/[id]/route');
      const response = await PATCH(
        createRequest('PATCH', { vendor: 'WOOLWORTHS' }) as never,
        { params: Promise.resolve({ id: 'rule-1' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.vendor).toBe('Woolworths');
    });
  });

  describe('DELETE /api/vendor-rules/[id]', () => {
    it('should return 404 for non-existent rule', async () => {
      const { DELETE } = await import('@/app/api/vendor-rules/[id]/route');
      const response = await DELETE(
        createRequest('DELETE') as never,
        { params: Promise.resolve({ id: 'non-existent' }) }
      );

      expect(response.status).toBe(404);
    });

    it('should delete a rule', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/vendorRules`, 'rule-1', {
        vendor: 'Test Vendor',
        category: 'other',
      });

      const { DELETE } = await import('@/app/api/vendor-rules/[id]/route');
      const response = await DELETE(
        createRequest('DELETE') as never,
        { params: Promise.resolve({ id: 'rule-1' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);

      const rule = mockDb._getDoc(`users/${TEST_USER_ID}/vendorRules`, 'rule-1');
      expect(rule).toBeUndefined();
    });
  });

  describe('POST /api/vendor-rules/learn', () => {
    it('should require vendor and category', async () => {
      const { POST } = await import('@/app/api/vendor-rules/learn/route');
      const response = await POST(createRequest('POST', { vendor: 'Test' }) as never);

      expect(response.status).toBe(400);
    });

    it('should create a new learned rule', async () => {
      const { POST } = await import('@/app/api/vendor-rules/learn/route');
      const response = await POST(createRequest('POST', {
        vendor: 'Nandos',
        category: 'lifestyle',
        subCategory: 'dining',
      }) as never);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.vendor).toBe('Nandos');
      expect(data.category).toBe('lifestyle');
      expect(data.confidence).toBe('learned');
      expect(data.matchCount).toBe(1);
      expect(data.created).toBe(true);
    });

    it('should increment matchCount on existing rule with same category', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/vendorRules`, 'rule-1', {
        vendor: 'Nandos',
        category: 'lifestyle',
        subCategory: 'dining',
        confidence: 'learned',
        matchCount: 5,
      });

      const { POST } = await import('@/app/api/vendor-rules/learn/route');
      const response = await POST(createRequest('POST', {
        vendor: 'Nandos',
        category: 'lifestyle',
      }) as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.created).toBe(false);

      // Check the stored doc was updated
      const rule = mockDb._getDoc(`users/${TEST_USER_ID}/vendorRules`, 'rule-1');
      expect(rule?.matchCount).toBe(6);
    });

    it('should update category when different from existing rule', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/vendorRules`, 'rule-1', {
        vendor: 'Clicks',
        category: 'lifestyle',
        confidence: 'learned',
        matchCount: 3,
      });

      const { POST } = await import('@/app/api/vendor-rules/learn/route');
      const response = await POST(createRequest('POST', {
        vendor: 'Clicks',
        category: 'health',
        subCategory: 'pharmacy',
      }) as never);

      expect(response.status).toBe(200);

      const rule = mockDb._getDoc(`users/${TEST_USER_ID}/vendorRules`, 'rule-1');
      expect(rule?.category).toBe('health');
      expect(rule?.subCategory).toBe('pharmacy');
      expect(rule?.confidence).toBe('learned');
      expect(rule?.matchCount).toBe(4);
    });
  });
});
