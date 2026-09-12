import { vi } from 'vitest';

// Create actual classes that can be used with instanceof
class MockNextResponseClass {
  data: unknown;
  status: number;
  headers: Map<string, string>;
  _isMockNextResponse = true;
  private _bodyText: string | null = null;

  constructor(body?: BodyInit | null, init?: { status?: number; headers?: Record<string, string> | Headers }) {
    // Handle body
    if (typeof body === 'string') {
      this._bodyText = body;
      try {
        this.data = JSON.parse(body);
      } catch {
        this.data = body;
      }
    } else {
      this.data = body;
    }

    this.status = init?.status ?? 200;

    // Handle headers with a mock Headers-like interface
    const headersMap = new Map<string, string>();
    if (init?.headers) {
      if (init.headers instanceof Map) {
        init.headers.forEach((v, k) => headersMap.set(k, v));
      } else if (typeof init.headers === 'object') {
        for (const [key, value] of Object.entries(init.headers)) {
          headersMap.set(key, value);
        }
      }
    }
    // Create headers object with get method
    this.headers = {
      get: (key: string) => headersMap.get(key) ?? null,
      set: (key: string, value: string) => headersMap.set(key, value),
      has: (key: string) => headersMap.has(key),
      forEach: (cb: (value: string, key: string) => void) => headersMap.forEach(cb),
    } as unknown as Map<string, string>;
  }

  async json() {
    return this.data;
  }

  async text() {
    if (this._bodyText !== null) {
      return this._bodyText;
    }
    return typeof this.data === 'string' ? this.data : JSON.stringify(this.data);
  }

  static json(data: unknown, init?: { status?: number; headers?: Record<string, string> }) {
    const response = new MockNextResponseClass(JSON.stringify(data), {
      status: init?.status ?? 200,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
    response.data = data;
    return response;
  }
}

// Export the class so tests can use it
export const MockNextResponse = MockNextResponseClass;

// Mock next/server BEFORE any imports
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

// In-memory Firestore mock
export function createMockFirestore() {
  const collections: Map<string, Map<string, Record<string, unknown>>> = new Map();

  const getCollection = (path: string) => {
    if (!collections.has(path)) {
      collections.set(path, new Map());
    }
    return collections.get(path)!;
  };

  const parseCollectionPath = (fullPath: string) => {
    // Handle paths like "users/userId/cycleItems"
    const parts = fullPath.split('/');
    return parts.join('/');
  };

  const mockDoc = (collectionPath: string, docId: string) => {
    const collection = getCollection(collectionPath);
    const docRef = {
      id: docId,
      path: `${collectionPath}/${docId}`,
    };
    return {
      id: docId,
      path: `${collectionPath}/${docId}`,
      ref: docRef,
      get: async () => {
        const data = collection.get(docId);
        return {
          exists: !!data,
          id: docId,
          data: () => data,
          ref: docRef,
        };
      },
      set: async (data: Record<string, unknown>) => {
        collection.set(docId, { ...data, id: docId });
      },
      update: async (data: Record<string, unknown>) => {
        const existing = collection.get(docId) ?? {};
        // Handle FieldValue operations
        const processed = processFieldValues(existing, data);
        collection.set(docId, { ...existing, ...processed });
      },
      delete: async () => {
        collection.delete(docId);
      },
    };
  };

  const mockCollection = (path: string) => ({
    doc: (docId?: string) => {
      const id = docId ?? `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      return mockDoc(path, id);
    },
    add: async (data: Record<string, unknown>) => {
      const id = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const collection = getCollection(path);
      collection.set(id, { ...data, id });
      return { id, path: `${path}/${id}` };
    },
    orderBy: () => ({
      orderBy: () => ({
        get: async () => {
          const collection = getCollection(path);
          const docs = Array.from(collection.entries()).map(([id, data]) => ({
            id,
            ref: mockDoc(path, id),
            data: () => data,
          }));
          return { docs, empty: docs.length === 0, size: docs.length };
        },
        limit: () => ({
          get: async () => {
            const collection = getCollection(path);
            const docs = Array.from(collection.entries()).map(([id, data]) => ({
              id,
              ref: mockDoc(path, id),
              data: () => data,
            }));
            return { docs, empty: docs.length === 0, size: docs.length };
          },
        }),
      }),
      get: async () => {
        const collection = getCollection(path);
        const docs = Array.from(collection.entries()).map(([id, data]) => ({
          id,
          ref: mockDoc(path, id),
          data: () => data,
        }));
        return { docs, empty: docs.length === 0, size: docs.length };
      },
      limit: () => ({
        get: async () => {
          const collection = getCollection(path);
          const docs = Array.from(collection.entries()).map(([id, data]) => ({
            id,
            ref: mockDoc(path, id),
            data: () => data,
          }));
          return { docs, empty: docs.length === 0, size: docs.length };
        },
      }),
    }),
    where: (field: string, op: string, value: unknown) => ({
      where: (field2: string, op2: string, value2: unknown) => ({
        get: async () => {
          const collection = getCollection(path);
          const docs = Array.from(collection.entries())
            .filter(([id, doc]) => matchesCondition(doc, field, op, value, id) && matchesCondition(doc, field2, op2, value2, id))
            .map(([id, data]) => ({
              id,
              ref: mockDoc(path, id),
              data: () => data,
            }));
          return { docs, empty: docs.length === 0, size: docs.length };
        },
        orderBy: () => ({
          get: async () => {
            const collection = getCollection(path);
            const docs = Array.from(collection.entries())
              .filter(([id, doc]) => matchesCondition(doc, field, op, value, id) && matchesCondition(doc, field2, op2, value2, id))
              .map(([id, data]) => ({
                id,
                ref: mockDoc(path, id),
                data: () => data,
              }));
            return { docs, empty: docs.length === 0, size: docs.length };
          },
        }),
      }),
      get: async () => {
        const collection = getCollection(path);
        const docs = Array.from(collection.entries())
          .filter(([id, doc]) => matchesCondition(doc, field, op, value, id))
          .map(([id, data]) => ({
            id,
            ref: mockDoc(path, id),
            data: () => data,
          }));
        return { docs, empty: docs.length === 0, size: docs.length };
      },
      orderBy: () => ({
        get: async () => {
          const collection = getCollection(path);
          const docs = Array.from(collection.entries())
            .filter(([id, doc]) => matchesCondition(doc, field, op, value, id))
            .map(([id, data]) => ({
              id,
              ref: mockDoc(path, id),
              data: () => data,
            }));
          return { docs, empty: docs.length === 0, size: docs.length };
        },
        limit: () => ({
          get: async () => {
            const collection = getCollection(path);
            const docs = Array.from(collection.entries())
              .filter(([id, doc]) => matchesCondition(doc, field, op, value, id))
              .map(([id, data]) => ({
                id,
                ref: mockDoc(path, id),
                data: () => data,
              }));
            return { docs, empty: docs.length === 0, size: docs.length };
          },
        }),
      }),
    }),
    get: async () => {
      const collection = getCollection(path);
      const docs = Array.from(collection.entries()).map(([id, data]) => ({
        id,
        ref: mockDoc(path, id),
        data: () => data,
      }));
      return { docs, empty: docs.length === 0, size: docs.length };
    },
  });

  return {
    collection: (path: string) => mockCollection(parseCollectionPath(path)),
    doc: (path: string) => {
      const parts = path.split('/');
      const docId = parts.pop()!;
      const collectionPath = parts.join('/');
      return mockDoc(collectionPath, docId);
    },
    batch: () => {
      const operations: Array<() => Promise<void>> = [];
      return {
        set: (ref: { id: string; path?: string; ref?: { path: string } }, data: Record<string, unknown>) => {
          operations.push(async () => {
            const path = ref.path ?? ref.ref?.path;
            if (!path) {
              console.warn('Batch set: no path found on ref', ref);
              return;
            }
            const parts = path.split('/');
            const docId = parts.pop()!;
            const collectionPath = parts.join('/');
            const collection = getCollection(collectionPath);
            collection.set(docId, { ...data, id: docId });
          });
        },
        update: (ref: { id: string; path?: string; ref?: { path: string } }, data: Record<string, unknown>) => {
          operations.push(async () => {
            const path = ref.path ?? ref.ref?.path;
            if (!path) {
              console.warn('Batch update: no path found on ref', ref);
              return;
            }
            const parts = path.split('/');
            const docId = parts.pop()!;
            const collectionPath = parts.join('/');
            const collection = getCollection(collectionPath);
            const existing = collection.get(docId) ?? {};
            const processed = processFieldValues(existing, data);
            collection.set(docId, { ...existing, ...processed });
          });
        },
        delete: (ref: { id: string; path?: string; ref?: { path: string } }) => {
          operations.push(async () => {
            const path = ref.path ?? ref.ref?.path;
            if (!path) {
              console.warn('Batch delete: no path found on ref', ref);
              return;
            }
            const parts = path.split('/');
            const docId = parts.pop()!;
            const collectionPath = parts.join('/');
            const collection = getCollection(collectionPath);
            collection.delete(docId);
          });
        },
        commit: async () => {
          for (const op of operations) {
            await op();
          }
        },
      };
    },
    // Helper to directly manipulate data for test setup
    _setDoc: (collectionPath: string, docId: string, data: Record<string, unknown>) => {
      const collection = getCollection(collectionPath);
      collection.set(docId, { ...data, id: docId });
    },
    _getDoc: (collectionPath: string, docId: string) => {
      const collection = getCollection(collectionPath);
      return collection.get(docId);
    },
    _clear: () => {
      collections.clear();
    },
  };
}

function matchesCondition(doc: Record<string, unknown>, field: string, op: string, value: unknown, docId?: string): boolean {
  // Handle __name__ (document ID) queries
  let fieldValue: unknown;
  if (field === '__name__') {
    fieldValue = docId ?? doc.id;
  } else {
    fieldValue = doc[field];
  }

  // Convert Date values for comparison
  const normalizeValue = (v: unknown): unknown => {
    if (v instanceof Date) return v.getTime();
    if (v && typeof v === 'object' && 'toDate' in v) {
      return (v as { toDate: () => Date }).toDate().getTime();
    }
    return v;
  };

  const normalizedFieldValue = normalizeValue(fieldValue);
  const normalizedValue = normalizeValue(value);

  switch (op) {
    case '==':
      return normalizedFieldValue === normalizedValue;
    case 'in':
      return Array.isArray(value) && value.includes(fieldValue);
    case '!=':
      return normalizedFieldValue !== normalizedValue;
    case '>=':
      if (typeof normalizedFieldValue === 'string' && typeof normalizedValue === 'string') {
        return normalizedFieldValue >= normalizedValue;
      }
      if (typeof normalizedFieldValue === 'number' && typeof normalizedValue === 'number') {
        return normalizedFieldValue >= normalizedValue;
      }
      return false;
    case '<=':
      if (typeof normalizedFieldValue === 'string' && typeof normalizedValue === 'string') {
        return normalizedFieldValue <= normalizedValue;
      }
      if (typeof normalizedFieldValue === 'number' && typeof normalizedValue === 'number') {
        return normalizedFieldValue <= normalizedValue;
      }
      return false;
    case '>':
      if (typeof normalizedFieldValue === 'string' && typeof normalizedValue === 'string') {
        return normalizedFieldValue > normalizedValue;
      }
      if (typeof normalizedFieldValue === 'number' && typeof normalizedValue === 'number') {
        return normalizedFieldValue > normalizedValue;
      }
      return false;
    case '<':
      if (typeof normalizedFieldValue === 'string' && typeof normalizedValue === 'string') {
        return normalizedFieldValue < normalizedValue;
      }
      if (typeof normalizedFieldValue === 'number' && typeof normalizedValue === 'number') {
        return normalizedFieldValue < normalizedValue;
      }
      return false;
    default:
      return false;
  }
}

function processFieldValues(existing: Record<string, unknown>, updates: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(updates)) {
    if (value && typeof value === 'object' && '_type' in value) {
      const fieldValue = value as { _type: string; _value?: unknown; _elements?: unknown[] };
      switch (fieldValue._type) {
        case 'increment':
          result[key] = ((existing[key] as number) ?? 0) + (fieldValue._value as number);
          break;
        case 'arrayUnion':
          result[key] = [...((existing[key] as unknown[]) ?? []), ...(fieldValue._elements ?? [])];
          break;
        case 'serverTimestamp':
          result[key] = new Date();
          break;
        default:
          result[key] = value;
      }
    } else {
      result[key] = value;
    }
  }

  return result;
}

// Mock FieldValue
export const mockFieldValue = {
  increment: (n: number) => ({ _type: 'increment', _value: n }),
  arrayUnion: (...elements: unknown[]) => ({ _type: 'arrayUnion', _elements: elements }),
  serverTimestamp: () => ({ _type: 'serverTimestamp' }),
};

export type MockFirestore = ReturnType<typeof createMockFirestore>;
