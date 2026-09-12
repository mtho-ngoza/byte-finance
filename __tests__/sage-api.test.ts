import { describe, it, expect, beforeEach, vi } from 'vitest';
import './setup'; // Import for NextResponse mock

const TEST_USER_ID = 'test-user-123';

// Mock token data
let mockTokens: {
  companyId: string;
  companyName: string;
  connectedAt: string;
  accessToken: string;
} | null = null;

let deletedTokens = false;

vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => ({}),
}));

vi.mock('@/lib/auth', () => ({
  withAuth: async () => ({ userId: TEST_USER_ID }),
}));

vi.mock('@/lib/sage', () => ({
  getSageTokens: async () => mockTokens,
  deleteSageTokens: async () => { deletedTokens = true; },
  SAGE_AUTH_URL: 'https://www.sageone.com/oauth2/auth',
  SAGE_TOKEN_URL: 'https://oauth.accounting.sage.com/token',
}));

function createRequest(method: string, body?: unknown, url = 'http://localhost/api/sage/status') {
  return {
    method,
    url,
    json: async () => body ?? {},
    headers: new Map(),
  };
}

describe('Sage API', () => {
  beforeEach(() => {
    mockTokens = null;
    deletedTokens = false;
    vi.clearAllMocks();
    // Reset env vars
    vi.stubEnv('SAGE_CLIENT_ID', '');
    vi.stubEnv('SAGE_CLIENT_SECRET', '');
    vi.stubEnv('SAGE_REDIRECT_URI', '');
  });

  describe('GET /api/sage/status', () => {
    it('should return not connected when no tokens', async () => {
      mockTokens = null;

      const { GET } = await import('@/app/api/sage/status/route');
      const response = await GET(createRequest('GET') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.connected).toBe(false);
    });

    it('should return connected with company info when tokens exist', async () => {
      mockTokens = {
        companyId: 'company-123',
        companyName: 'Test Company',
        connectedAt: '2026-09-01T10:00:00Z',
        accessToken: 'secret-token',
      };

      const { GET } = await import('@/app/api/sage/status/route');
      const response = await GET(createRequest('GET') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.connected).toBe(true);
      expect(data.companyId).toBe('company-123');
      expect(data.companyName).toBe('Test Company');
      expect(data.connectedAt).toBe('2026-09-01T10:00:00Z');
      // Should NOT expose tokens
      expect(data.accessToken).toBeUndefined();
    });
  });

  describe('GET /api/sage/connect', () => {
    it('should return 503 when OAuth is not configured', async () => {
      // No env vars set

      const { GET } = await import('@/app/api/sage/connect/route');
      const response = await GET(createRequest('GET', null, 'http://localhost/api/sage/connect') as never);

      expect(response.status).toBe(503);
      const data = await response.json();
      expect(data.error).toContain('not configured');
    });

    it('should redirect to Sage auth URL when configured', async () => {
      vi.stubEnv('SAGE_CLIENT_ID', 'test-client-id');
      vi.stubEnv('SAGE_REDIRECT_URI', 'http://localhost/api/sage/callback');

      const { GET } = await import('@/app/api/sage/connect/route');
      const response = await GET(createRequest('GET', null, 'http://localhost/api/sage/connect') as never);

      // Redirect responses have status 307/308
      expect(response.status).toBeGreaterThanOrEqual(300);
      expect(response.status).toBeLessThan(400);
    });
  });

  describe('DELETE /api/sage/disconnect', () => {
    it('should return 404 when not connected', async () => {
      mockTokens = null;

      const { DELETE } = await import('@/app/api/sage/disconnect/route');
      const response = await DELETE(createRequest('DELETE', null, 'http://localhost/api/sage/disconnect') as never);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toContain('not connected');
    });

    it('should delete tokens when connected', async () => {
      mockTokens = {
        companyId: 'company-123',
        companyName: 'Test Company',
        connectedAt: '2026-09-01T10:00:00Z',
        accessToken: 'secret-token',
      };

      const { DELETE } = await import('@/app/api/sage/disconnect/route');
      const response = await DELETE(createRequest('DELETE', null, 'http://localhost/api/sage/disconnect') as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(deletedTokens).toBe(true);
    });
  });
});
