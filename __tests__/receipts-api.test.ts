import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockFirestore, type MockFirestore } from './setup';

const TEST_USER_ID = 'test-user-123';

let mockDb: MockFirestore;

// Mock storage bucket
const mockBucket = {
  file: vi.fn(() => ({
    delete: vi.fn().mockResolvedValue(undefined),
  })),
};

vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => mockDb,
  getAdminStorage: () => ({
    bucket: () => mockBucket,
  }),
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => ({ _type: 'serverTimestamp' }),
    increment: (n: number) => ({ _type: 'increment', _value: n }),
    arrayUnion: (...elements: unknown[]) => ({ _type: 'arrayUnion', _elements: elements }),
    delete: () => ({ _type: 'delete' }),
  },
}));

vi.mock('@/lib/auth', () => ({
  withAuth: async () => ({ userId: TEST_USER_ID }),
}));

function createRequest(method: string, body?: unknown, url = 'http://localhost/api/receipts') {
  return {
    method,
    url,
    json: async () => body ?? {},
    headers: new Map(),
  };
}

describe('Receipts API', () => {
  beforeEach(() => {
    mockDb = createMockFirestore();
    vi.clearAllMocks();
  });

  describe('GET /api/receipts', () => {
    it('should return all receipts', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1', {
        vendor: 'Shop A',
        amountInCents: 150000,
        capturedAt: { toDate: () => new Date('2026-09-01') },
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-2', {
        vendor: 'Shop B',
        amountInCents: 200000,
        capturedAt: { toDate: () => new Date('2026-09-05') },
      });

      const { GET } = await import('@/app/api/receipts/route');
      const response = await GET(createRequest('GET') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.receipts).toHaveLength(2);
    });

    it('should filter by needsAttention', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1', {
        vendor: 'Shop A',
        amountInCents: 150000,
        needsAttention: false,
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-2', {
        vendor: null,
        amountInCents: null,
        needsAttention: true,
      });

      const { GET } = await import('@/app/api/receipts/route');
      const response = await GET(createRequest('GET', null, 'http://localhost/api/receipts?needsAttention=true') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.receipts).toHaveLength(1);
      expect(data.receipts[0].needsAttention).toBe(true);
    });

    it('should sort receipts by capturedAt descending', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1', {
        vendor: 'Shop A',
        capturedAt: { toDate: () => new Date('2026-09-01') },
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-2', {
        vendor: 'Shop B',
        capturedAt: { toDate: () => new Date('2026-09-10') },
      });

      const { GET } = await import('@/app/api/receipts/route');
      const response = await GET(createRequest('GET') as never);

      const data = await response.json();
      // Most recent first
      expect(data.receipts[0].vendor).toBe('Shop B');
      expect(data.receipts[1].vendor).toBe('Shop A');
    });

    it('should return empty array when no receipts', async () => {
      const { GET } = await import('@/app/api/receipts/route');
      const response = await GET(createRequest('GET') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.receipts).toEqual([]);
    });
  });

  describe('POST /api/receipts', () => {
    it('should require imageUrl and imageHash', async () => {
      const { POST } = await import('@/app/api/receipts/route');
      const response = await POST(createRequest('POST', {
        vendor: 'Shop',
      }) as never);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('imageUrl');
    });

    it('should create a receipt with required fields', async () => {
      const { POST } = await import('@/app/api/receipts/route');
      const response = await POST(createRequest('POST', {
        imageUrl: 'https://storage.example.com/receipt.jpg',
        imageHash: 'abc123hash',
        vendor: 'Shop A',
        amountInCents: 150000,
      }) as never);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.imageUrl).toBe('https://storage.example.com/receipt.jpg');
      expect(data.imageHash).toBe('abc123hash');
      expect(data.vendor).toBe('Shop A');
      expect(data.amountInCents).toBe(150000);
      expect(data.needsAttention).toBe(false);
    });

    it('should set needsAttention when vendor or amount is missing', async () => {
      const { POST } = await import('@/app/api/receipts/route');
      const response = await POST(createRequest('POST', {
        imageUrl: 'https://storage.example.com/receipt.jpg',
        imageHash: 'xyz789hash',
      }) as never);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.needsAttention).toBe(true);
    });

    it('should detect duplicate receipts by imageHash', async () => {
      // Create existing receipt
      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'existing-receipt', {
        imageUrl: 'https://storage.example.com/old.jpg',
        imageHash: 'duplicate-hash',
        vendor: 'Shop A',
      });

      const { POST } = await import('@/app/api/receipts/route');
      const response = await POST(createRequest('POST', {
        imageUrl: 'https://storage.example.com/new.jpg',
        imageHash: 'duplicate-hash',
      }) as never);

      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data.error).toContain('Duplicate');
      expect(data.existingId).toBe('existing-receipt');
    });

    it('should store optional fields', async () => {
      const { POST } = await import('@/app/api/receipts/route');
      const response = await POST(createRequest('POST', {
        imageUrl: 'https://storage.example.com/receipt.jpg',
        imageHash: 'unique-hash',
        originalImageUrl: 'https://storage.example.com/original.jpg',
        thumbnailUrl: 'https://storage.example.com/thumb.jpg',
        vendor: 'Coffee Shop',
        amountInCents: 5000,
        note: 'Morning coffee',
        location: 'Downtown',
        capturedAt: '2026-09-15T10:30:00Z',
      }) as never);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.originalImageUrl).toBe('https://storage.example.com/original.jpg');
      expect(data.thumbnailUrl).toBe('https://storage.example.com/thumb.jpg');
      expect(data.note).toBe('Morning coffee');
      expect(data.location).toBe('Downtown');
    });
  });

  describe('GET /api/receipts/[id]', () => {
    it('should return 404 for non-existent receipt', async () => {
      const { GET } = await import('@/app/api/receipts/[id]/route');
      const response = await GET(
        createRequest('GET') as never,
        { params: Promise.resolve({ id: 'non-existent' }) }
      );

      expect(response.status).toBe(404);
    });

    it('should return a single receipt', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1', {
        vendor: 'Shop A',
        amountInCents: 150000,
        imageUrl: 'https://storage.example.com/img.jpg',
        capturedAt: { toDate: () => new Date('2026-09-01') },
      });

      const { GET } = await import('@/app/api/receipts/[id]/route');
      const response = await GET(
        createRequest('GET') as never,
        { params: Promise.resolve({ id: 'receipt-1' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.id).toBe('receipt-1');
      expect(data.vendor).toBe('Shop A');
      expect(data.amountInCents).toBe(150000);
    });
  });

  describe('PATCH /api/receipts/[id]', () => {
    it('should return 404 for non-existent receipt', async () => {
      const { PATCH } = await import('@/app/api/receipts/[id]/route');
      const response = await PATCH(
        createRequest('PATCH', { vendor: 'New Vendor' }) as never,
        { params: Promise.resolve({ id: 'non-existent' }) }
      );

      expect(response.status).toBe(404);
    });

    it('should update receipt fields', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1', {
        vendor: 'Old Vendor',
        amountInCents: 100000,
        needsAttention: false,
      });

      const { PATCH } = await import('@/app/api/receipts/[id]/route');
      const response = await PATCH(
        createRequest('PATCH', {
          vendor: 'New Vendor',
          amountInCents: 150000,
          note: 'Updated note',
        }) as never,
        { params: Promise.resolve({ id: 'receipt-1' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.vendor).toBe('New Vendor');
      expect(data.amountInCents).toBe(150000);
      expect(data.note).toBe('Updated note');
    });

    it('should update needsAttention when linking to cycleItem', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1', {
        vendor: null,
        amountInCents: 150000,
        needsAttention: true, // Originally needs attention (no vendor)
      });

      const { PATCH } = await import('@/app/api/receipts/[id]/route');
      const response = await PATCH(
        createRequest('PATCH', {
          cycleItemId: 'item-123',
          cycleId: '2026-09',
        }) as never,
        { params: Promise.resolve({ id: 'receipt-1' }) }
      );

      expect(response.status).toBe(200);
      const receipt = mockDb._getDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1');
      // Linked receipts don't need vendor, so needsAttention should be false
      expect(receipt?.needsAttention).toBe(false);
    });

    it('should set needsAttention when amount is cleared', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1', {
        vendor: 'Shop A',
        amountInCents: 150000,
        needsAttention: false,
      });

      const { PATCH } = await import('@/app/api/receipts/[id]/route');
      const response = await PATCH(
        createRequest('PATCH', {
          amountInCents: null,
        }) as never,
        { params: Promise.resolve({ id: 'receipt-1' }) }
      );

      expect(response.status).toBe(200);
      const receipt = mockDb._getDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1');
      expect(receipt?.needsAttention).toBe(true);
    });
  });

  describe('DELETE /api/receipts/[id]', () => {
    it('should return 404 for non-existent receipt', async () => {
      const { DELETE } = await import('@/app/api/receipts/[id]/route');
      const response = await DELETE(
        createRequest('DELETE') as never,
        { params: Promise.resolve({ id: 'non-existent' }) }
      );

      expect(response.status).toBe(404);
    });

    it('should delete receipt and return success', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1', {
        vendor: 'Shop A',
        imageUrl: 'https://storage.googleapis.com/bucket/users/test/img.jpg',
      });

      const { DELETE } = await import('@/app/api/receipts/[id]/route');
      const response = await DELETE(
        createRequest('DELETE') as never,
        { params: Promise.resolve({ id: 'receipt-1' }) }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);

      // Verify receipt is deleted
      const receipt = mockDb._getDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1');
      expect(receipt).toBeUndefined();
    });

    it('should attempt to clean up storage files', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1', {
        imageUrl: 'https://storage.googleapis.com/bucket/users/test/image.jpg',
        originalImageUrl: 'https://storage.googleapis.com/bucket/users/test/original.jpg',
        thumbnailUrl: 'https://firebasestorage.googleapis.com/v0/b/bucket/o/users%2Ftest%2Fthumb.jpg?alt=media',
      });

      const { DELETE } = await import('@/app/api/receipts/[id]/route');
      await DELETE(
        createRequest('DELETE') as never,
        { params: Promise.resolve({ id: 'receipt-1' }) }
      );

      // Storage cleanup should be called
      expect(mockBucket.file).toHaveBeenCalled();
    });
  });

  describe('POST /api/receipts/cleanup-vendors', () => {
    it('should return zero cleaned when no invalid vendors', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1', {
        vendor: 'Checkers', // Valid vendor name
        amountInCents: 150000,
      });

      const { POST } = await import('@/app/api/receipts/cleanup-vendors/route');
      const response = await POST(createRequest('POST') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.cleaned).toBe(0);
    });

    it('should clean invalid vendor names (category names)', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1', {
        vendor: 'Grocery', // Invalid - category name
        amountInCents: 150000,
        needsAttention: false,
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-2', {
        vendor: 'Entertainment', // Invalid - category name
        amountInCents: 200000,
        needsAttention: false,
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-3', {
        vendor: 'Woolworths', // Valid vendor name
        amountInCents: 100000,
      });

      const { POST } = await import('@/app/api/receipts/cleanup-vendors/route');
      const response = await POST(createRequest('POST') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.cleaned).toBe(2);
      expect(data.found).toBe(2);

      // Invalid vendors should be cleared
      const receipt1 = mockDb._getDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1');
      expect(receipt1?.needsAttention).toBe(true);

      // Valid vendor should be untouched
      const receipt3 = mockDb._getDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-3');
      expect(receipt3?.vendor).toBe('Woolworths');
    });

    it('should handle case-insensitive vendor matching', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1', {
        vendor: 'HOUSING', // Uppercase category
        amountInCents: 500000,
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-2', {
        vendor: 'Transport', // Mixed case category
        amountInCents: 200000,
      });

      const { POST } = await import('@/app/api/receipts/cleanup-vendors/route');
      const response = await POST(createRequest('POST') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.cleaned).toBe(2);
    });

    it('should handle empty receipts collection', async () => {
      const { POST } = await import('@/app/api/receipts/cleanup-vendors/route');
      const response = await POST(createRequest('POST') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.cleaned).toBe(0);
      expect(data.message).toContain('No receipts');
    });
  });

  describe('GET /api/receipts/sync-links', () => {
    it('should return sync status with no data', async () => {
      const { GET } = await import('@/app/api/receipts/sync-links/route');
      const response = await GET(createRequest('GET', null, 'http://localhost/api/receipts/sync-links') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.totalReceipts).toBe(0);
      expect(data.linkedFromItems).toBe(0);
      expect(data.needsUpdate).toBe(0);
    });

    it('should identify receipts needing update', async () => {
      // Receipt not linked
      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1', {
        vendor: 'Shop A',
        amountInCents: 150000,
        cycleItemId: null,
      });

      // Cycle item linking to receipt
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        receiptId: 'receipt-1',
      });

      const { GET } = await import('@/app/api/receipts/sync-links/route');
      const response = await GET(createRequest('GET', null, 'http://localhost/api/receipts/sync-links') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.totalReceipts).toBe(1);
      expect(data.linkedFromItems).toBe(1);
      expect(data.needsUpdate).toBe(1);
    });

    it('should count already linked receipts', async () => {
      // Receipt already linked
      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1', {
        vendor: 'Shop A',
        cycleItemId: 'item-1',
        cycleId: '2026-09',
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        receiptId: 'receipt-1',
      });

      const { GET } = await import('@/app/api/receipts/sync-links/route');
      const response = await GET(createRequest('GET', null, 'http://localhost/api/receipts/sync-links') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.alreadyLinked).toBe(1);
      expect(data.needsUpdate).toBe(0);
    });

    it('should detect payment-level receipt links', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1', {
        vendor: 'Shop A',
        cycleItemId: null,
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        payments: [
          { amount: 100000, receiptId: 'receipt-1' },
        ],
      });

      const { GET } = await import('@/app/api/receipts/sync-links/route');
      const response = await GET(createRequest('GET', null, 'http://localhost/api/receipts/sync-links') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.linkedFromItems).toBe(1);
      expect(data.needsUpdate).toBe(1);
    });
  });

  describe('POST /api/receipts/sync-links', () => {
    it('should update receipts with cycleItemId', async () => {
      // Receipt not linked
      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1', {
        vendor: 'Shop A',
        amountInCents: 150000,
      });

      // Cycle item linking to receipt
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        receiptId: 'receipt-1',
      });

      const { POST } = await import('@/app/api/receipts/sync-links/route');
      const response = await POST(createRequest('POST', null, 'http://localhost/api/receipts/sync-links') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.updated).toBe(1);

      const receipt = mockDb._getDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1');
      expect(receipt?.cycleItemId).toBe('item-1');
      expect(receipt?.cycleId).toBe('2026-09');
    });

    it('should skip already linked receipts', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1', {
        vendor: 'Shop A',
        cycleItemId: 'item-1', // Already linked
        cycleId: '2026-09',
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        receiptId: 'receipt-1',
      });

      const { POST } = await import('@/app/api/receipts/sync-links/route');
      const response = await POST(createRequest('POST', null, 'http://localhost/api/receipts/sync-links') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.updated).toBe(0);
      expect(data.skipped).toBe(1);
    });

    it('should skip non-existent receipts', async () => {
      // No receipt exists, but cycle item references it
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        receiptId: 'non-existent-receipt',
      });

      const { POST } = await import('@/app/api/receipts/sync-links/route');
      const response = await POST(createRequest('POST', null, 'http://localhost/api/receipts/sync-links') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.skipped).toBe(1);
      expect(data.updated).toBe(0);
    });

    it('should handle payment-level receipt links', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1', {
        vendor: 'Shop A',
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        payments: [
          { amount: 100000, receiptId: 'receipt-1' },
        ],
      });

      const { POST } = await import('@/app/api/receipts/sync-links/route');
      const response = await POST(createRequest('POST', null, 'http://localhost/api/receipts/sync-links') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.updated).toBe(1);

      const receipt = mockDb._getDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1');
      expect(receipt?.cycleItemId).toBe('item-1');
    });
  });

  describe('POST /api/receipts/migrate-payment-data', () => {
    it('should return zero updated when no receipts need migration', async () => {
      const { POST } = await import('@/app/api/receipts/migrate-payment-data/route');
      const response = await POST(createRequest('POST', null, 'http://localhost/api/receipts/migrate-payment-data') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.updated).toBe(0);
      expect(data.message).toContain('No receipts');
    });

    it('should skip receipts with complete data', async () => {
      // Receipt with cycleItemId but already has amount and vendor
      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1', {
        cycleItemId: 'item-1',
        cycleId: '2026-09',
        amountInCents: 150000,
        vendor: 'Shop A',
      });

      const { POST } = await import('@/app/api/receipts/migrate-payment-data/route');
      const response = await POST(createRequest('POST', null, 'http://localhost/api/receipts/migrate-payment-data') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.updated).toBe(0);
    });

    it('should populate missing amount from cycle item', async () => {
      // Receipt linked but missing amount
      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1', {
        cycleItemId: 'item-1',
        cycleId: '2026-09',
        vendor: 'Shop A',
        amountInCents: null,
      });

      // Cycle item with amount
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        label: 'Groceries',
        amount: 150000,
      });

      const { POST } = await import('@/app/api/receipts/migrate-payment-data/route');
      const response = await POST(createRequest('POST', null, 'http://localhost/api/receipts/migrate-payment-data') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.updated).toBe(1);

      const receipt = mockDb._getDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1');
      expect(receipt?.amountInCents).toBe(150000);
    });

    it('should populate missing vendor from cycle item label', async () => {
      // Receipt linked but missing vendor
      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1', {
        cycleItemId: 'item-1',
        cycleId: '2026-09',
        amountInCents: 150000,
        vendor: null,
      });

      // Cycle item with label
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        label: 'Groceries',
        amount: 150000,
      });

      const { POST } = await import('@/app/api/receipts/migrate-payment-data/route');
      const response = await POST(createRequest('POST', null, 'http://localhost/api/receipts/migrate-payment-data') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.updated).toBe(1);

      const receipt = mockDb._getDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1');
      expect(receipt?.vendor).toBe('Groceries');
    });

    it('should handle missing cycle item', async () => {
      // Receipt linked to non-existent cycle item
      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1', {
        cycleItemId: 'non-existent',
        cycleId: '2026-09',
        amountInCents: null,
      });

      const { POST } = await import('@/app/api/receipts/migrate-payment-data/route');
      const response = await POST(createRequest('POST', null, 'http://localhost/api/receipts/migrate-payment-data') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.failed).toBe(1);
      expect(data.errors).toHaveLength(1);
    });

    it('should update needsAttention flag', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1', {
        cycleItemId: 'item-1',
        cycleId: '2026-09',
        needsAttention: true,
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        label: 'Groceries',
        amount: 150000,
      });

      const { POST } = await import('@/app/api/receipts/migrate-payment-data/route');
      await POST(createRequest('POST', null, 'http://localhost/api/receipts/migrate-payment-data') as never);

      const receipt = mockDb._getDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1');
      expect(receipt?.needsAttention).toBe(false);
    });
  });

  describe('GET /api/receipts/export', () => {
    it('should export receipts as CSV by default', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1', {
        vendor: 'Shop A',
        amountInCents: 150000,
        vatNumber: '123456789',
        note: 'Business expense',
        capturedAt: { toDate: () => new Date('2026-09-15T10:30:00Z') },
        cycleItemId: 'item-1',
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-2', {
        vendor: 'Shop B',
        amountInCents: 75000,
        capturedAt: { toDate: () => new Date('2026-09-10T14:00:00Z') },
      });

      const { GET } = await import('@/app/api/receipts/export/route');
      const response = await GET(createRequest('GET', null, 'http://localhost/api/receipts/export') as never);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/csv');
      expect(response.headers.get('Content-Disposition')).toContain('.csv');

      const csv = await response.text();
      const lines = csv.split('\n');

      // Check header
      expect(lines[0]).toContain('Date');
      expect(lines[0]).toContain('Vendor');
      expect(lines[0]).toContain('Amount (R)');
      expect(lines[0]).toContain('VAT Number');

      // Check data rows
      expect(csv).toContain('Shop A');
      expect(csv).toContain('1500.00'); // 150000 cents = R1500.00
      expect(csv).toContain('123456789');
      expect(csv).toContain('Business expense');
      expect(csv).toContain('Yes'); // Linked to cycle item
      expect(csv).toContain('Shop B');
      expect(csv).toContain('750.00');
      expect(csv).toContain('No'); // Not linked
    });

    it('should filter by date range', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1', {
        vendor: 'In Range',
        amountInCents: 100000,
        capturedAt: { toDate: () => new Date('2026-09-15T10:00:00Z') },
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-2', {
        vendor: 'Before Range',
        amountInCents: 200000,
        capturedAt: { toDate: () => new Date('2026-08-01T10:00:00Z') },
      });
      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-3', {
        vendor: 'After Range',
        amountInCents: 300000,
        capturedAt: { toDate: () => new Date('2026-10-20T10:00:00Z') },
      });

      const { GET } = await import('@/app/api/receipts/export/route');
      const response = await GET(createRequest('GET', null, 'http://localhost/api/receipts/export?from=2026-09-01&to=2026-09-30') as never);

      const csv = await response.text();
      expect(csv).toContain('In Range');
      expect(csv).not.toContain('Before Range');
      expect(csv).not.toContain('After Range');
    });

    it('should handle empty receipts collection', async () => {
      const { GET } = await import('@/app/api/receipts/export/route');
      const response = await GET(createRequest('GET', null, 'http://localhost/api/receipts/export') as never);

      expect(response.status).toBe(200);
      const csv = await response.text();
      const lines = csv.split('\n');

      // Only header row
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('Date');
    });

    it('should escape CSV special characters', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1', {
        vendor: 'Shop, with comma',
        amountInCents: 100000,
        note: 'Note with "quotes" inside',
        capturedAt: { toDate: () => new Date('2026-09-15T10:00:00Z') },
      });

      const { GET } = await import('@/app/api/receipts/export/route');
      const response = await GET(createRequest('GET', null, 'http://localhost/api/receipts/export') as never);

      const csv = await response.text();
      // Values with commas or quotes should be properly escaped
      expect(csv).toContain('"Shop, with comma"');
    });

    it('should return error for invalid format', async () => {
      const { GET } = await import('@/app/api/receipts/export/route');
      const response = await GET(createRequest('GET', null, 'http://localhost/api/receipts/export?format=invalid') as never);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Invalid format');
    });

    it('should handle missing optional fields', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1', {
        capturedAt: { toDate: () => new Date('2026-09-15T10:00:00Z') },
        // Missing: vendor, amountInCents, note, vatNumber
      });

      const { GET } = await import('@/app/api/receipts/export/route');
      const response = await GET(createRequest('GET', null, 'http://localhost/api/receipts/export') as never);

      expect(response.status).toBe(200);
      const csv = await response.text();
      const lines = csv.split('\n');
      expect(lines.length).toBe(2); // Header + 1 data row
    });

    it('should include date label in filename', async () => {
      const { GET } = await import('@/app/api/receipts/export/route');
      const response = await GET(createRequest('GET', null, 'http://localhost/api/receipts/export?from=2026-09-01&to=2026-09-30') as never);

      const disposition = response.headers.get('Content-Disposition');
      expect(disposition).toContain('2026-09-01_to_2026-09-30');
    });
  });
});
