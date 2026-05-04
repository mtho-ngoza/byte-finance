/**
 * Sage Business Cloud API helpers
 *
 * OAuth2 flow:
 *   Authorization URL : https://www.sageone.com/oauth2/auth/central
 *   Token URL         : https://oauth.accounting.sage.com/token
 *   API base          : https://api.accounting.sage.com/v3.1
 *
 * Tokens are stored in Firestore at:
 *   users/{userId}/integrations/sage
 */

import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SAGE_AUTH_URL = 'https://www.sageone.com/oauth2/auth/central';
export const SAGE_TOKEN_URL = 'https://oauth.accounting.sage.com/token';
export const SAGE_API_BASE = 'https://api.accounting.sage.com/v3.1';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SageTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix ms
  companyId: string;
  companyName: string;
  connectedAt: string; // ISO string
}

export interface SageTransaction {
  id: string;
  date: string;           // ISO date string
  description: string;
  total_amount: number;   // in the account's currency (ZAR)
  reference?: string;
  transaction_type?: { id: string; name: string };
}

// ---------------------------------------------------------------------------
// Firestore helpers
// ---------------------------------------------------------------------------

/** Read stored Sage tokens for a user. Returns null if not connected. */
export async function getSageTokens(userId: string): Promise<SageTokens | null> {
  const db = getAdminDb();
  const snap = await db.doc(`users/${userId}/integrations/sage`).get();
  if (!snap.exists) return null;
  return snap.data() as SageTokens;
}

/** Persist Sage tokens to Firestore. */
export async function saveSageTokens(
  userId: string,
  tokens: SageTokens
): Promise<void> {
  const db = getAdminDb();
  await db.doc(`users/${userId}/integrations/sage`).set(tokens, { merge: true });
}

/** Remove Sage integration document from Firestore. */
export async function deleteSageTokens(userId: string): Promise<void> {
  const db = getAdminDb();
  await db.doc(`users/${userId}/integrations/sage`).delete();
}

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

/**
 * Returns a valid access token, refreshing if the stored one is expired.
 * Throws if no tokens are stored or refresh fails.
 */
export async function getValidAccessToken(userId: string): Promise<string> {
  const tokens = await getSageTokens(userId);
  if (!tokens) throw new Error('Sage not connected');

  // Refresh if expired (with 60-second buffer)
  if (Date.now() >= tokens.expiresAt - 60_000) {
    const refreshed = await refreshAccessToken(tokens.refreshToken);
    const updated: SageTokens = {
      ...tokens,
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? tokens.refreshToken,
      expiresAt: Date.now() + refreshed.expires_in * 1000,
    };
    await saveSageTokens(userId, updated);
    return updated.accessToken;
  }

  return tokens.accessToken;
}

/** Exchange a refresh token for a new access token. */
async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}> {
  const clientId = process.env.SAGE_CLIENT_ID!;
  const clientSecret = process.env.SAGE_CLIENT_SECRET!;

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(SAGE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sage token refresh failed: ${res.status} ${text}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Sage API fetch wrapper
// ---------------------------------------------------------------------------

/** Make an authenticated request to the Sage API. */
export async function sageApiFetch(
  userId: string,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const accessToken = await getValidAccessToken(userId);

  return fetch(`${SAGE_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
}

// ---------------------------------------------------------------------------
// Match scoring
// ---------------------------------------------------------------------------

/**
 * Score a Sage transaction against a receipt.
 * Lower score = better match.
 *
 * @param receiptAmountInCents  Receipt amount (integer ZAR cents)
 * @param receiptDate           Receipt capturedAt date
 * @param txAmount              Sage transaction amount (ZAR, decimal)
 * @param txDate                Sage transaction date (ISO string)
 */
export function scoreMatch(
  receiptAmountInCents: number,
  receiptDate: Date,
  txAmount: number,
  txDate: string
): number {
  const receiptAmountZAR = receiptAmountInCents / 100;
  const amountDiff = Math.abs(receiptAmountZAR - txAmount) / receiptAmountZAR;

  const txDateObj = new Date(txDate);
  const timeDiffMs = Math.abs(receiptDate.getTime() - txDateObj.getTime());
  const timeDiffHours = timeDiffMs / (1000 * 60 * 60);

  // Weighted score: amount diff (0-1) * 0.6 + time diff (0-48h normalised) * 0.4
  const timeScore = Math.min(timeDiffHours / 48, 1);
  return amountDiff * 0.6 + timeScore * 0.4;
}
