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

function createRequest(method: string, body?: unknown, url = 'http://localhost/api/projects') {
  return {
    method,
    url,
    json: async () => body,
    headers: new Map(),
  };
}

describe('Projects API', () => {
  beforeEach(() => {
    mockDb = createMockFirestore();
    vi.clearAllMocks();
  });

  describe('GET /api/projects', () => {
    it('should return all projects', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/projects`, 'proj-1', {
        name: 'House Build',
        type: 'construction',
        status: 'active',
        currentAmount: 500000,
        createdAt: new Date(),
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/projects`, 'proj-2', {
        name: 'Wedding',
        type: 'event',
        status: 'active',
        currentAmount: 200000,
        createdAt: new Date(),
      });

      const { GET } = await import('@/app/api/projects/route');
      const response = await GET(createRequest('GET') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.projects).toHaveLength(2);
    });

    it('should return empty array when no projects', async () => {
      const { GET } = await import('@/app/api/projects/route');
      const response = await GET(createRequest('GET') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.projects).toEqual([]);
    });
  });

  describe('POST /api/projects', () => {
    it('should require project name', async () => {
      const { POST } = await import('@/app/api/projects/route');
      const response = await POST(createRequest('POST', {
        type: 'construction',
      }) as never);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('name');
    });

    it('should require valid project type', async () => {
      const { POST } = await import('@/app/api/projects/route');
      const response = await POST(createRequest('POST', {
        name: 'Test Project',
        type: 'invalid_type',
      }) as never);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('type');
    });

    it('should create a project with required fields', async () => {
      const { POST } = await import('@/app/api/projects/route');
      const response = await POST(createRequest('POST', {
        name: 'Kitchen Renovation',
        type: 'construction',
      }) as never);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.name).toBe('Kitchen Renovation');
      expect(data.type).toBe('construction');
      expect(data.currentAmount).toBe(0);
      expect(data.status).toBe('active');
    });

    it('should create a project with all fields', async () => {
      const { POST } = await import('@/app/api/projects/route');
      const response = await POST(createRequest('POST', {
        name: 'Year-End Party',
        description: 'Company celebration',
        type: 'event',
        targetAmount: 5000000,
        status: 'planning',
        priority: 'high',
        notes: 'Book venue by October',
      }) as never);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.name).toBe('Year-End Party');
      expect(data.description).toBe('Company celebration');
      expect(data.targetAmount).toBe(5000000);
      expect(data.priority).toBe('high');
      expect(data.notes).toBe('Book venue by October');
    });

    it('should trim whitespace from string fields', async () => {
      const { POST } = await import('@/app/api/projects/route');
      const response = await POST(createRequest('POST', {
        name: '  My Project  ',
        description: '  Description  ',
        type: 'other',
      }) as never);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.name).toBe('My Project');
      expect(data.description).toBe('Description');
    });

    it('should set default values for optional fields', async () => {
      const { POST } = await import('@/app/api/projects/route');
      const response = await POST(createRequest('POST', {
        name: 'Basic Project',
        type: 'family',
      }) as never);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.description).toBeNull();
      expect(data.targetAmount).toBeNull();
      expect(data.notes).toBeNull();
      expect(data.priority).toBe('medium');
      expect(data.transactions).toEqual([]);
    });
  });

  describe('GET /api/projects/[id]', () => {
    it('should return 404 for non-existent project', async () => {
      const { GET } = await import('@/app/api/projects/[id]/route');
      const response = await GET(
        createRequest('GET') as never,
        { params: Promise.resolve({ id: 'non-existent' }) }
      );

      expect(response.status).toBe(404);
    });

    it('should return a single project', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/projects`, 'proj-1', {
        name: 'House Build',
        type: 'construction',
        status: 'active',
        currentAmount: 500000,
      });

      const { GET } = await import('@/app/api/projects/[id]/route');
      const response = await GET(
        createRequest('GET') as never,
        { params: Promise.resolve({ id: 'proj-1' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.name).toBe('House Build');
      expect(data.type).toBe('construction');
    });
  });

  describe('PATCH /api/projects/[id]', () => {
    it('should return 404 for non-existent project', async () => {
      const { PATCH } = await import('@/app/api/projects/[id]/route');
      const response = await PATCH(
        createRequest('PATCH', { name: 'Updated' }) as never,
        { params: Promise.resolve({ id: 'non-existent' }) }
      );

      expect(response.status).toBe(404);
    });

    it('should update project fields', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/projects`, 'proj-1', {
        name: 'Old Name',
        type: 'construction',
        status: 'active',
      });

      const { PATCH } = await import('@/app/api/projects/[id]/route');
      const response = await PATCH(
        createRequest('PATCH', {
          name: 'New Name',
          targetAmount: 1000000,
          priority: 'high',
        }) as never,
        { params: Promise.resolve({ id: 'proj-1' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.name).toBe('New Name');
      expect(data.targetAmount).toBe(1000000);
      expect(data.priority).toBe('high');
    });

    it('should set completedAt when status is completed', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/projects`, 'proj-1', {
        name: 'Test Project',
        type: 'other',
        status: 'active',
      });

      const { PATCH } = await import('@/app/api/projects/[id]/route');
      const response = await PATCH(
        createRequest('PATCH', { status: 'completed' }) as never,
        { params: Promise.resolve({ id: 'proj-1' }) }
      );

      expect(response.status).toBe(200);
      const project = mockDb._getDoc(`users/${TEST_USER_ID}/projects`, 'proj-1');
      expect(project?.status).toBe('completed');
      expect(project?.completedAt).toBeDefined();
    });
  });

  describe('DELETE /api/projects/[id]', () => {
    it('should return 404 for non-existent project', async () => {
      const { DELETE } = await import('@/app/api/projects/[id]/route');
      const response = await DELETE(
        createRequest('DELETE') as never,
        { params: Promise.resolve({ id: 'non-existent' }) }
      );

      expect(response.status).toBe(404);
    });

    it('should soft delete (archive) a project', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/projects`, 'proj-1', {
        name: 'To Archive',
        type: 'event',
        status: 'active',
      });

      const { DELETE } = await import('@/app/api/projects/[id]/route');
      const response = await DELETE(
        createRequest('DELETE') as never,
        { params: Promise.resolve({ id: 'proj-1' }) }
      );

      expect(response.status).toBe(200);
      const project = mockDb._getDoc(`users/${TEST_USER_ID}/projects`, 'proj-1');
      expect(project?.status).toBe('archived');
      expect(project?.archivedAt).toBeDefined();
    });
  });

  describe('GET /api/projects/[id]/transactions', () => {
    it('should return 404 for non-existent project', async () => {
      const { GET } = await import('@/app/api/projects/[id]/transactions/route');
      const response = await GET(
        createRequest('GET') as never,
        { params: Promise.resolve({ id: 'non-existent' }) }
      );

      expect(response.status).toBe(404);
    });

    it('should return transactions array', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/projects`, 'proj-1', {
        name: 'Test Project',
        type: 'construction',
        transactions: [
          { id: 'txn-1', type: 'contribution', amount: 100000, description: 'Initial' },
          { id: 'txn-2', type: 'payment', amount: 50000, description: 'Materials' },
        ],
      });

      const { GET } = await import('@/app/api/projects/[id]/transactions/route');
      const response = await GET(
        createRequest('GET') as never,
        { params: Promise.resolve({ id: 'proj-1' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.transactions).toHaveLength(2);
      expect(data.transactions[0].type).toBe('contribution');
    });

    it('should return empty array when no transactions', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/projects`, 'proj-1', {
        name: 'Test Project',
        type: 'construction',
      });

      const { GET } = await import('@/app/api/projects/[id]/transactions/route');
      const response = await GET(
        createRequest('GET') as never,
        { params: Promise.resolve({ id: 'proj-1' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.transactions).toEqual([]);
    });
  });

  describe('POST /api/projects/[id]/transactions', () => {
    it('should return 404 for non-existent project', async () => {
      const { POST } = await import('@/app/api/projects/[id]/transactions/route');
      const response = await POST(
        createRequest('POST', {
          type: 'contribution',
          amount: 100000,
          description: 'Test',
        }) as never,
        { params: Promise.resolve({ id: 'non-existent' }) }
      );

      expect(response.status).toBe(404);
    });

    it('should require valid transaction type', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/projects`, 'proj-1', {
        name: 'Test',
        type: 'construction',
      });

      const { POST } = await import('@/app/api/projects/[id]/transactions/route');
      const response = await POST(
        createRequest('POST', {
          type: 'invalid',
          amount: 100000,
          description: 'Test',
        }) as never,
        { params: Promise.resolve({ id: 'proj-1' }) }
      );

      expect(response.status).toBe(400);
    });

    it('should require positive amount', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/projects`, 'proj-1', {
        name: 'Test',
        type: 'construction',
      });

      const { POST } = await import('@/app/api/projects/[id]/transactions/route');
      const response = await POST(
        createRequest('POST', {
          type: 'contribution',
          amount: -100,
          description: 'Test',
        }) as never,
        { params: Promise.resolve({ id: 'proj-1' }) }
      );

      expect(response.status).toBe(400);
    });

    it('should require description', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/projects`, 'proj-1', {
        name: 'Test',
        type: 'construction',
      });

      const { POST } = await import('@/app/api/projects/[id]/transactions/route');
      const response = await POST(
        createRequest('POST', {
          type: 'contribution',
          amount: 100000,
        }) as never,
        { params: Promise.resolve({ id: 'proj-1' }) }
      );

      expect(response.status).toBe(400);
    });

    it('should add contribution and increase currentAmount', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/projects`, 'proj-1', {
        name: 'Test',
        type: 'construction',
        currentAmount: 100000,
        transactions: [],
      });

      const { POST } = await import('@/app/api/projects/[id]/transactions/route');
      const response = await POST(
        createRequest('POST', {
          type: 'contribution',
          amount: 50000,
          description: 'Monthly contribution',
          contributorName: 'John',
        }) as never,
        { params: Promise.resolve({ id: 'proj-1' }) }
      );

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.transaction.type).toBe('contribution');
      expect(data.transaction.amount).toBe(50000);
      expect(data.transaction.contributorName).toBe('John');

      const project = mockDb._getDoc(`users/${TEST_USER_ID}/projects`, 'proj-1');
      expect(project?.currentAmount).toBe(150000);
    });

    it('should add payment and decrease currentAmount', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/projects`, 'proj-1', {
        name: 'Test',
        type: 'construction',
        currentAmount: 100000,
        transactions: [],
      });

      const { POST } = await import('@/app/api/projects/[id]/transactions/route');
      const response = await POST(
        createRequest('POST', {
          type: 'payment',
          amount: 30000,
          description: 'Material purchase',
        }) as never,
        { params: Promise.resolve({ id: 'proj-1' }) }
      );

      expect(response.status).toBe(201);
      const project = mockDb._getDoc(`users/${TEST_USER_ID}/projects`, 'proj-1');
      expect(project?.currentAmount).toBe(70000);
    });
  });

  describe('PATCH /api/projects/[id]/transactions/[transactionId]', () => {
    it('should return 404 for non-existent project', async () => {
      const { PATCH } = await import('@/app/api/projects/[id]/transactions/[transactionId]/route');
      const response = await PATCH(
        createRequest('PATCH', { amount: 100000 }) as never,
        { params: Promise.resolve({ id: 'non-existent', transactionId: 'txn-1' }) }
      );

      expect(response.status).toBe(404);
    });

    it('should return 404 for non-existent transaction', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/projects`, 'proj-1', {
        name: 'Test',
        type: 'construction',
        transactions: [],
      });

      const { PATCH } = await import('@/app/api/projects/[id]/transactions/[transactionId]/route');
      const response = await PATCH(
        createRequest('PATCH', { amount: 100000 }) as never,
        { params: Promise.resolve({ id: 'proj-1', transactionId: 'non-existent' }) }
      );

      expect(response.status).toBe(404);
    });

    it('should update transaction amount and adjust currentAmount', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/projects`, 'proj-1', {
        name: 'Test',
        type: 'construction',
        currentAmount: 100000,
        transactions: [
          { id: 'txn-1', type: 'contribution', amount: 100000, description: 'Initial' },
        ],
      });

      const { PATCH } = await import('@/app/api/projects/[id]/transactions/[transactionId]/route');
      const response = await PATCH(
        createRequest('PATCH', { amount: 150000 }) as never,
        { params: Promise.resolve({ id: 'proj-1', transactionId: 'txn-1' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.transaction.amount).toBe(150000);

      // currentAmount should increase by 50000 (150000 - 100000)
      const project = mockDb._getDoc(`users/${TEST_USER_ID}/projects`, 'proj-1');
      expect(project?.currentAmount).toBe(150000);
    });

    it('should update transaction description', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/projects`, 'proj-1', {
        name: 'Test',
        type: 'construction',
        currentAmount: 100000,
        transactions: [
          { id: 'txn-1', type: 'contribution', amount: 100000, description: 'Old desc' },
        ],
      });

      const { PATCH } = await import('@/app/api/projects/[id]/transactions/[transactionId]/route');
      const response = await PATCH(
        createRequest('PATCH', { description: 'New description' }) as never,
        { params: Promise.resolve({ id: 'proj-1', transactionId: 'txn-1' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.transaction.description).toBe('New description');
    });
  });

  describe('DELETE /api/projects/[id]/transactions/[transactionId]', () => {
    it('should return 404 for non-existent project', async () => {
      const { DELETE } = await import('@/app/api/projects/[id]/transactions/[transactionId]/route');
      const response = await DELETE(
        createRequest('DELETE') as never,
        { params: Promise.resolve({ id: 'non-existent', transactionId: 'txn-1' }) }
      );

      expect(response.status).toBe(404);
    });

    it('should return 404 for non-existent transaction', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/projects`, 'proj-1', {
        name: 'Test',
        type: 'construction',
        transactions: [],
      });

      const { DELETE } = await import('@/app/api/projects/[id]/transactions/[transactionId]/route');
      const response = await DELETE(
        createRequest('DELETE') as never,
        { params: Promise.resolve({ id: 'proj-1', transactionId: 'non-existent' }) }
      );

      expect(response.status).toBe(404);
    });

    it('should delete contribution and decrease currentAmount', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/projects`, 'proj-1', {
        name: 'Test',
        type: 'construction',
        currentAmount: 150000,
        transactions: [
          { id: 'txn-1', type: 'contribution', amount: 100000, description: 'First' },
          { id: 'txn-2', type: 'contribution', amount: 50000, description: 'Second' },
        ],
      });

      const { DELETE } = await import('@/app/api/projects/[id]/transactions/[transactionId]/route');
      const response = await DELETE(
        createRequest('DELETE') as never,
        { params: Promise.resolve({ id: 'proj-1', transactionId: 'txn-1' }) }
      );

      expect(response.status).toBe(200);
      const project = mockDb._getDoc(`users/${TEST_USER_ID}/projects`, 'proj-1');
      expect(project?.transactions).toHaveLength(1);
      expect(project?.currentAmount).toBe(50000); // 150000 - 100000
    });

    it('should delete payment and increase currentAmount', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/projects`, 'proj-1', {
        name: 'Test',
        type: 'construction',
        currentAmount: 70000,
        transactions: [
          { id: 'txn-1', type: 'contribution', amount: 100000, description: 'Deposit' },
          { id: 'txn-2', type: 'payment', amount: 30000, description: 'Materials' },
        ],
      });

      const { DELETE } = await import('@/app/api/projects/[id]/transactions/[transactionId]/route');
      const response = await DELETE(
        createRequest('DELETE') as never,
        { params: Promise.resolve({ id: 'proj-1', transactionId: 'txn-2' }) }
      );

      expect(response.status).toBe(200);
      const project = mockDb._getDoc(`users/${TEST_USER_ID}/projects`, 'proj-1');
      expect(project?.currentAmount).toBe(100000); // 70000 + 30000
    });
  });
});
