import { vi } from 'vitest';

// Create mock NextResponse class that can be used with instanceof
class MockNextResponseClass {
  data: unknown;
  status: number;

  constructor(data: unknown, status: number = 200) {
    this.data = data;
    this.status = status;
  }

  async json() {
    return this.data;
  }

  static json(data: unknown, init?: { status?: number }) {
    return new MockNextResponseClass(data, init?.status ?? 200);
  }
}

// Mock next/server globally
vi.mock('next/server', () => {
  return {
    NextRequest: class MockNextRequest {
      headers: Map<string, string>;
      url: string;
      method: string;
      private _body: unknown;

      constructor(url: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) {
        this.url = url;
        this.method = init?.method ?? 'GET';
        this.headers = new Map(Object.entries(init?.headers ?? {}));
        this._body = init?.body ? JSON.parse(init.body) : null;
      }

      async json() {
        return this._body;
      }
    },
    NextResponse: MockNextResponseClass,
  };
});

// Mock firebase-admin/firestore
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    increment: (n: number) => ({ _type: 'increment', _value: n }),
    arrayUnion: (...elements: unknown[]) => ({ _type: 'arrayUnion', _elements: elements }),
    serverTimestamp: () => ({ _type: 'serverTimestamp' }),
  },
  Timestamp: {
    now: () => new Date(),
    fromDate: (d: Date) => d,
  },
}));

// Mock auth - default returns test user
vi.mock('@/lib/auth', () => ({
  withAuth: vi.fn().mockResolvedValue({ userId: 'test-user-123' }),
}));
