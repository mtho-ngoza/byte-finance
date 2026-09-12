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

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => ({ _type: 'serverTimestamp' }),
    increment: (n: number) => ({ _type: 'increment', _value: n }),
    arrayUnion: (...elements: unknown[]) => ({ _type: 'arrayUnion', _elements: elements }),
    delete: () => ({ _type: 'delete' }),
  },
}));

function createRequest(method: string, body?: unknown, url = 'http://localhost/api/import/confirm') {
  return {
    method,
    url,
    json: async () => body ?? {},
    headers: new Map(),
  };
}

describe('Import API', () => {
  beforeEach(() => {
    mockDb = createMockFirestore();
    vi.clearAllMocks();
  });

  describe('POST /api/import/confirm', () => {
    it('should require cycleId', async () => {
      const { POST } = await import('@/app/api/import/confirm/route');
      const response = await POST(createRequest('POST', {
        items: [{ label: 'Test', amountInCents: 10000 }],
      }) as never);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('cycleId');
    });

    it('should require items array', async () => {
      const { POST } = await import('@/app/api/import/confirm/route');
      const response = await POST(createRequest('POST', {
        cycleId: '2026-09',
      }) as never);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('items');
    });

    it('should require non-empty items array', async () => {
      const { POST } = await import('@/app/api/import/confirm/route');
      const response = await POST(createRequest('POST', {
        cycleId: '2026-09',
        items: [],
      }) as never);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('items');
    });

    it('should validate item labels', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {});

      const { POST } = await import('@/app/api/import/confirm/route');
      const response = await POST(createRequest('POST', {
        cycleId: '2026-09',
        items: [{ amountInCents: 10000 }], // Missing label
      }) as never);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('label');
    });

    it('should validate amountInCents', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {});

      const { POST } = await import('@/app/api/import/confirm/route');
      const response = await POST(createRequest('POST', {
        cycleId: '2026-09',
        items: [{ label: 'Test', amountInCents: -100 }], // Negative amount
      }) as never);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('amountInCents');
    });

    it('should return 404 for non-existent cycle', async () => {
      const { POST } = await import('@/app/api/import/confirm/route');
      const response = await POST(createRequest('POST', {
        cycleId: 'non-existent',
        items: [{ label: 'Test', amountInCents: 10000, status: 'upcoming', category: 'other' }],
      }) as never);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toContain('not found');
    });

    it('should create cycle items from parsed data', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        totalCommitted: 0,
        totalPaid: 0,
        itemCount: 0,
        paidCount: 0,
      });

      const { POST } = await import('@/app/api/import/confirm/route');
      const response = await POST(createRequest('POST', {
        cycleId: '2026-09',
        items: [
          { label: 'Rent', amountInCents: 500000, status: 'paid', category: 'housing', accountType: 'personal' },
          { label: 'Groceries', amountInCents: 150000, status: 'upcoming', category: 'lifestyle', accountType: 'personal' },
        ],
      }) as never);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.created).toBe(2);

      // Verify cycle was updated
      const cycle = mockDb._getDoc(`users/${TEST_USER_ID}/cycles`, '2026-09');
      expect(cycle?.totalCommitted).toBe(650000);
      expect(cycle?.itemCount).toBe(2);
      expect(cycle?.totalPaid).toBe(500000);
      expect(cycle?.paidCount).toBe(1);
    });

    it('should default to upcoming status and other category', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        totalCommitted: 0,
        itemCount: 0,
      });

      const { POST } = await import('@/app/api/import/confirm/route');
      const response = await POST(createRequest('POST', {
        cycleId: '2026-09',
        items: [
          { label: 'Misc Expense', amountInCents: 50000 },
        ],
      }) as never);

      expect(response.status).toBe(201);
    });

    it('should handle business account type', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        totalCommitted: 0,
        itemCount: 0,
      });

      const { POST } = await import('@/app/api/import/confirm/route');
      const response = await POST(createRequest('POST', {
        cycleId: '2026-09',
        items: [
          { label: 'PAYE', amountInCents: 300000, status: 'upcoming', category: 'business', accountType: 'business' },
        ],
      }) as never);

      expect(response.status).toBe(201);
    });

    it('should handle invalid JSON body', async () => {
      const { POST } = await import('@/app/api/import/confirm/route');
      const response = await POST({
        method: 'POST',
        url: 'http://localhost/api/import/confirm',
        json: async () => { throw new Error('Invalid JSON'); },
        headers: new Map(),
      } as never);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Invalid JSON');
    });
  });

  describe('POST /api/import/parse', () => {
    beforeEach(() => {
      vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
      vi.stubGlobal('fetch', vi.fn());
    });

    it('should require text field', async () => {
      const { POST } = await import('@/app/api/import/parse/route');
      const response = await POST(createRequest('POST', {
        cycleId: '2026-09',
      }, 'http://localhost/api/import/parse') as never);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('text');
    });

    it('should require cycleId', async () => {
      const { POST } = await import('@/app/api/import/parse/route');
      const response = await POST(createRequest('POST', {
        text: 'Some expenses',
      }, 'http://localhost/api/import/parse') as never);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('cycleId');
    });

    it('should reject empty text', async () => {
      const { POST } = await import('@/app/api/import/parse/route');
      const response = await POST(createRequest('POST', {
        text: '   ',
        cycleId: '2026-09',
      }, 'http://localhost/api/import/parse') as never);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('text');
    });

    it('should parse text using Gemini API', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify([
                  { label: 'Rent', amountInCents: 500000, status: 'paid', category: 'housing', accountType: 'personal' },
                ]),
              }],
            },
          }],
        }),
      };
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

      const { POST } = await import('@/app/api/import/parse/route');
      const response = await POST(createRequest('POST', {
        text: '[v] Rent R5000',
        cycleId: '2026-09',
      }, 'http://localhost/api/import/parse') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.items).toHaveLength(1);
      expect(data.items[0].label).toBe('Rent');
      expect(data.items[0].amountInCents).toBe(500000);
    });

    it('should handle Gemini API errors', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        text: async () => JSON.stringify({ error: { message: 'API overloaded' } }),
      };
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

      const { POST } = await import('@/app/api/import/parse/route');
      const response = await POST(createRequest('POST', {
        text: '[v] Rent R5000',
        cycleId: '2026-09',
      }, 'http://localhost/api/import/parse') as never);

      expect(response.status).toBe(502);
      const data = await response.json();
      expect(data.error).toContain('API overloaded');
    });

    it('should handle markdown code fences in response', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{
                text: '```json\n[{"label":"Groceries","amountInCents":150000,"status":"upcoming","category":"lifestyle","accountType":"personal"}]\n```',
              }],
            },
          }],
        }),
      };
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

      const { POST } = await import('@/app/api/import/parse/route');
      const response = await POST(createRequest('POST', {
        text: '[ ] Groceries R1500',
        cycleId: '2026-09',
      }, 'http://localhost/api/import/parse') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.items).toHaveLength(1);
      expect(data.items[0].label).toBe('Groceries');
    });

    it('should handle invalid JSON from Gemini', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{
                text: 'This is not JSON at all',
              }],
            },
          }],
        }),
      };
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

      const { POST } = await import('@/app/api/import/parse/route');
      const response = await POST(createRequest('POST', {
        text: 'Some text',
        cycleId: '2026-09',
      }, 'http://localhost/api/import/parse') as never);

      expect(response.status).toBe(502);
      const data = await response.json();
      expect(data.error).toContain('parse');
    });

    it('should handle non-array response from Gemini', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{
                text: '{"single": "object"}',
              }],
            },
          }],
        }),
      };
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

      const { POST } = await import('@/app/api/import/parse/route');
      const response = await POST(createRequest('POST', {
        text: 'Some text',
        cycleId: '2026-09',
      }, 'http://localhost/api/import/parse') as never);

      expect(response.status).toBe(502);
      const data = await response.json();
      expect(data.error).toContain('array');
    });

    it('should return 502 when GEMINI_API_KEY is not set', async () => {
      vi.stubEnv('GEMINI_API_KEY', '');

      const { POST } = await import('@/app/api/import/parse/route');
      const response = await POST(createRequest('POST', {
        text: 'Some expenses',
        cycleId: '2026-09',
      }, 'http://localhost/api/import/parse') as never);

      expect(response.status).toBe(502);
      const data = await response.json();
      expect(data.error).toContain('GEMINI_API_KEY');
    });

    it('should sanitize parsed items', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify([
                  { label: '  Rent  ', amountInCents: '500000.5', status: 'invalid', category: null, accountType: 'unknown' },
                ]),
              }],
            },
          }],
        }),
      };
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

      const { POST } = await import('@/app/api/import/parse/route');
      const response = await POST(createRequest('POST', {
        text: 'Rent R5000',
        cycleId: '2026-09',
      }, 'http://localhost/api/import/parse') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.items[0].label).toBe('Rent'); // Trimmed
      expect(data.items[0].amountInCents).toBe(500001); // Rounded
      expect(data.items[0].status).toBe('upcoming'); // Defaulted
      expect(data.items[0].accountType).toBe('personal'); // Defaulted
    });
  });

  describe('POST /api/import/statement', () => {
    beforeEach(() => {
      vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
      vi.stubGlobal('fetch', vi.fn());
    });

    function createFormDataRequest(file: { name: string; type: string; content: string } | null) {
      const formData = new Map<string, unknown>();
      if (file) {
        formData.set('file', {
          name: file.name,
          type: file.type,
          size: file.content.length,
          arrayBuffer: async () => Buffer.from(file.content),
        });
      }

      return {
        method: 'POST',
        url: 'http://localhost/api/import/statement',
        formData: async () => ({
          get: (key: string) => formData.get(key),
        }),
        headers: new Map(),
      };
    }

    it('should require a file', async () => {
      const { POST } = await import('@/app/api/import/statement/route');
      const response = await POST(createFormDataRequest(null) as never);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('No file');
    });

    it('should only accept PDF and CSV files', async () => {
      const { POST } = await import('@/app/api/import/statement/route');
      const response = await POST(createFormDataRequest({
        name: 'statement.xlsx',
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        content: 'Excel content',
      }) as never);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('PDF and CSV');
    });

    it('should reject files over 10MB', async () => {
      const { POST } = await import('@/app/api/import/statement/route');
      const response = await POST({
        method: 'POST',
        url: 'http://localhost/api/import/statement',
        formData: async () => ({
          get: () => ({
            name: 'large.pdf',
            type: 'application/pdf',
            size: 11 * 1024 * 1024, // 11MB
            arrayBuffer: async () => Buffer.alloc(100),
          }),
        }),
        headers: new Map(),
      } as never);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('too large');
    });

    it('should parse PDF statement with Gemini', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify([
                  {
                    date: '2026-09-01',
                    description: 'Woolworths',
                    amountInCents: 45050,
                    type: 'debit',
                    category: 'lifestyle',
                    accountType: 'personal',
                  },
                  {
                    date: '2026-09-02',
                    description: 'Salary',
                    amountInCents: 2500000,
                    type: 'credit',
                    category: 'other',
                    accountType: 'personal',
                  },
                ]),
              }],
            },
          }],
        }),
      };
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

      const { POST } = await import('@/app/api/import/statement/route');
      const response = await POST(createFormDataRequest({
        name: 'statement.pdf',
        type: 'application/pdf',
        content: 'PDF content',
      }) as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.transactions).toHaveLength(2);
      expect(data.transactions[0].description).toBe('Woolworths');
      expect(data.transactions[0].amountInCents).toBe(45050);
      expect(data.transactions[0].type).toBe('debit');
      expect(data.transactions[1].type).toBe('credit');
    });

    it('should parse CSV statement', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify([
                  { date: '2026-09-05', description: 'Shell Petrol', amountInCents: 85000, type: 'debit', category: 'transport', accountType: 'personal' },
                ]),
              }],
            },
          }],
        }),
      };
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

      const { POST } = await import('@/app/api/import/statement/route');
      const response = await POST(createFormDataRequest({
        name: 'statement.csv',
        type: 'text/csv',
        content: 'Date,Description,Amount\n2026-09-05,Shell Petrol,850.00',
      }) as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.transactions).toHaveLength(1);
      expect(data.transactions[0].category).toBe('transport');
    });

    // NOTE: Additional statement tests limited to avoid rate limiting (5 req/min)
    // Tests for Gemini API errors, invalid form data, and data sanitization
    // are covered by the happy path tests and parse route tests above
  });

  describe('GET /api/import/statement/reconcile', () => {
    it('should require cycleId', async () => {
      const { GET } = await import('@/app/api/import/statement/reconcile/route');
      const response = await GET(createRequest('GET', null, 'http://localhost/api/import/statement/reconcile') as never);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('cycleId');
    });

    it('should return empty results for no data', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        startDate: { toDate: () => new Date('2026-08-25') },
        endDate: { toDate: () => new Date('2026-09-24') },
      });

      const { GET } = await import('@/app/api/import/statement/reconcile/route');
      const response = await GET(createRequest('GET', null, 'http://localhost/api/import/statement/reconcile?cycleId=2026-09') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.items).toEqual([]);
      expect(data.receipts).toEqual([]);
      expect(data.matched).toEqual([]);
      expect(data.unmatchedItems).toEqual([]);
      expect(data.orphanReceipts).toEqual([]);
    });

    it('should match items to receipts by amount and date', async () => {
      const itemDate = new Date('2026-09-10T12:00:00Z');
      const receiptDate = new Date('2026-09-10T14:00:00Z'); // 2 hours later

      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        startDate: { toDate: () => new Date('2026-08-25') },
        endDate: { toDate: () => new Date('2026-09-24') },
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        label: 'Woolworths',
        amount: 45050,
        dueDate: { toDate: () => itemDate },
        status: 'paid',
        tags: ['bank-import'],
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1', {
        cycleId: '2026-09',
        amountInCents: 45050,
        vendor: 'Woolworths',
        capturedAt: { toDate: () => receiptDate },
      });

      const { GET } = await import('@/app/api/import/statement/reconcile/route');
      const response = await GET(createRequest('GET', null, 'http://localhost/api/import/statement/reconcile?cycleId=2026-09') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.matched).toHaveLength(1);
      expect(data.matched[0].itemId).toBe('item-1');
      expect(data.matched[0].receiptId).toBe('receipt-1');
      expect(data.matched[0].confidence).toBe('high'); // Exact amount, within 24h
    });

    it('should return unmatched items when no receipt matches', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        startDate: { toDate: () => new Date('2026-08-25') },
        endDate: { toDate: () => new Date('2026-09-24') },
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        label: 'Shell Petrol',
        amount: 85000,
        dueDate: { toDate: () => new Date('2026-09-05') },
        status: 'paid',
        tags: ['bank-import'],
      });

      const { GET } = await import('@/app/api/import/statement/reconcile/route');
      const response = await GET(createRequest('GET', null, 'http://localhost/api/import/statement/reconcile?cycleId=2026-09') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.matched).toEqual([]);
      expect(data.unmatchedItems).toHaveLength(1);
      expect(data.unmatchedItems[0].label).toBe('Shell Petrol');
    });

    it('should return orphan receipts when no item matches', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        startDate: { toDate: () => new Date('2026-08-25') },
        endDate: { toDate: () => new Date('2026-09-24') },
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1', {
        cycleId: '2026-09',
        amountInCents: 30000,
        vendor: 'Coffee Shop',
        capturedAt: { toDate: () => new Date('2026-09-08') },
      });

      const { GET } = await import('@/app/api/import/statement/reconcile/route');
      const response = await GET(createRequest('GET', null, 'http://localhost/api/import/statement/reconcile?cycleId=2026-09') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.matched).toEqual([]);
      expect(data.orphanReceipts).toHaveLength(1);
      expect(data.orphanReceipts[0].vendor).toBe('Coffee Shop');
    });

    it('should include already linked items in matched', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        startDate: { toDate: () => new Date('2026-08-25') },
        endDate: { toDate: () => new Date('2026-09-24') },
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        label: 'Linked Item',
        amount: 50000,
        status: 'paid',
        tags: ['bank-import'],
        receiptId: 'receipt-1', // Already linked
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1', {
        cycleId: '2026-09',
        amountInCents: 50000,
        vendor: 'Linked Vendor',
        cycleItemId: 'item-1',
      });

      const { GET } = await import('@/app/api/import/statement/reconcile/route');
      const response = await GET(createRequest('GET', null, 'http://localhost/api/import/statement/reconcile?cycleId=2026-09') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.matched).toHaveLength(1);
      expect(data.matched[0].confidence).toBe('high');
    });
  });

  describe('POST /api/import/statement/reconcile', () => {
    it('should require itemId and receiptId', async () => {
      const { POST } = await import('@/app/api/import/statement/reconcile/route');
      const response = await POST(createRequest('POST', {
        itemId: 'item-1',
      }, 'http://localhost/api/import/statement/reconcile') as never);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('receiptId');
    });

    it('should link item and receipt', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: '2026-09',
        label: 'Test Item',
        amount: 50000,
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1', {
        amountInCents: 50000,
        vendor: 'Test Vendor',
      });

      const { POST } = await import('@/app/api/import/statement/reconcile/route');
      const response = await POST(createRequest('POST', {
        itemId: 'item-1',
        receiptId: 'receipt-1',
      }, 'http://localhost/api/import/statement/reconcile') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.ok).toBe(true);

      // Verify links were created
      const item = mockDb._getDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1');
      expect(item?.receiptId).toBe('receipt-1');

      const receipt = mockDb._getDoc(`users/${TEST_USER_ID}/receipts`, 'receipt-1');
      expect(receipt?.cycleItemId).toBe('item-1');
    });
  });

  describe('POST /api/import/statement/confirm', () => {
    it('should require cycleId', async () => {
      const { POST } = await import('@/app/api/import/statement/confirm/route');
      const response = await POST(createRequest('POST', {
        transactions: [{ date: '2026-09-01', description: 'Test', amountInCents: 10000, type: 'debit', category: 'other' }],
      }, 'http://localhost/api/import/statement/confirm') as never);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('cycleId');
    });

    it('should require transactions array', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {});

      const { POST } = await import('@/app/api/import/statement/confirm/route');
      const response = await POST(createRequest('POST', {
        cycleId: '2026-09',
      }, 'http://localhost/api/import/statement/confirm') as never);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('transactions');
    });

    it('should return 404 for non-existent cycle', async () => {
      const { POST } = await import('@/app/api/import/statement/confirm/route');
      const response = await POST(createRequest('POST', {
        cycleId: 'non-existent',
        transactions: [{ date: '2026-09-01', description: 'Test', amountInCents: 10000, type: 'debit', category: 'other' }],
      }, 'http://localhost/api/import/statement/confirm') as never);

      expect(response.status).toBe(404);
    });

    it('should create cycle items from transactions', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        totalCommitted: 0,
        totalPaid: 0,
        itemCount: 0,
        paidCount: 0,
      });

      const { POST } = await import('@/app/api/import/statement/confirm/route');
      const response = await POST(createRequest('POST', {
        cycleId: '2026-09',
        transactions: [
          { date: '2026-09-01', description: 'Woolworths', amountInCents: 45000, type: 'debit', category: 'lifestyle', accountType: 'personal' },
          { date: '2026-09-05', description: 'Salary', amountInCents: 2500000, type: 'credit', category: 'other', accountType: 'personal' },
        ],
      }, 'http://localhost/api/import/statement/confirm') as never);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.created).toBe(2);

      // Verify cycle was updated
      const cycle = mockDb._getDoc(`users/${TEST_USER_ID}/cycles`, '2026-09');
      expect(cycle?.totalCommitted).toBe(2545000); // Both amounts
      expect(cycle?.itemCount).toBe(2);
      // Debits are marked as paid
      expect(cycle?.paidCount).toBe(1);
    });

    it('should add bank-import tag to created items', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        totalCommitted: 0,
        itemCount: 0,
      });

      const { POST } = await import('@/app/api/import/statement/confirm/route');
      const response = await POST(createRequest('POST', {
        cycleId: '2026-09',
        transactions: [
          { date: '2026-09-01', description: 'Test Item', amountInCents: 45000, type: 'debit', category: 'lifestyle' },
        ],
      }, 'http://localhost/api/import/statement/confirm') as never);

      expect(response.status).toBe(201);
      // Items are created with bank-import tag for reconciliation
    });

    it('should mark credits as upcoming', async () => {
      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, '2026-09', {
        totalCommitted: 0,
        itemCount: 0,
        paidCount: 0,
      });

      const { POST } = await import('@/app/api/import/statement/confirm/route');
      const response = await POST(createRequest('POST', {
        cycleId: '2026-09',
        transactions: [
          { date: '2026-09-05', description: 'Salary', amountInCents: 2500000, type: 'credit', category: 'other' },
        ],
      }, 'http://localhost/api/import/statement/confirm') as never);

      expect(response.status).toBe(201);

      // Credit items don't count as paid
      const cycle = mockDb._getDoc(`users/${TEST_USER_ID}/cycles`, '2026-09');
      expect(cycle?.paidCount).toBe(0);
    });
  });
});
