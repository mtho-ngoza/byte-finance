import { vi } from 'vitest';

// Create actual classes that can be used with instanceof
class MockNextResponseClass {
  data: unknown;
  status: number;
  _isMockNextResponse = true;

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
    where: (field: string, op: string, value: unknown) => ({
      where: (field2: string, op2: string, value2: unknown) => ({
        get: async () => {
          const collection = getCollection(path);
          const docs = Array.from(collection.entries())
            .filter(([, doc]) => matchesCondition(doc, field, op, value) && matchesCondition(doc, field2, op2, value2))
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
              .filter(([, doc]) => matchesCondition(doc, field, op, value) && matchesCondition(doc, field2, op2, value2))
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
          .filter(([, doc]) => matchesCondition(doc, field, op, value))
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
            .filter(([, doc]) => matchesCondition(doc, field, op, value))
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

function matchesCondition(doc: Record<string, unknown>, field: string, op: string, value: unknown): boolean {
  const fieldValue = doc[field];
  switch (op) {
    case '==':
      return fieldValue === value;
    case 'in':
      return Array.isArray(value) && value.includes(fieldValue);
    case '!=':
      return fieldValue !== value;
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
