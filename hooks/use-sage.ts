import { useCallback, useEffect, useState } from 'react';

export interface SageStatus {
  connected: boolean;
  companyId?: string;
  companyName?: string;
  connectedAt?: string;
}

export interface SageMatch {
  id: string;
  date: string;
  description: string;
  total_amount: number;
  reference?: string;
  score: number;
}

/**
 * Hook for Sage Business Cloud integration.
 *
 * Provides:
 *  - connectionStatus  — current Sage connection state
 *  - connect()         — redirects to Sage OAuth flow
 *  - disconnect()      — revokes token and removes integration
 *  - findMatches()     — fetches candidate Sage transactions for a receipt
 *  - pushToSage()      — links a receipt to a Sage transaction and uploads attachment
 */
export function useSage() {
  const [connectionStatus, setConnectionStatus] = useState<SageStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  // Fetch connection status on mount
  useEffect(() => {
    let cancelled = false;

    async function fetchStatus() {
      try {
        const res = await fetch('/api/sage/status');
        if (!res.ok) throw new Error('Failed to fetch Sage status');
        const data: SageStatus = await res.json();
        if (!cancelled) setConnectionStatus(data);
      } catch (err) {
        console.error('Sage status error:', err);
        if (!cancelled) setConnectionStatus({ connected: false });
      } finally {
        if (!cancelled) setStatusLoading(false);
      }
    }

    fetchStatus();
    return () => { cancelled = true; };
  }, []);

  /** Redirect to Sage OAuth authorization page. */
  const connect = useCallback(() => {
    window.location.href = '/api/sage/connect';
  }, []);

  /** Revoke Sage token and remove integration. */
  const disconnect = useCallback(async () => {
    const res = await fetch('/api/sage/disconnect', { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to disconnect Sage');
    }
    setConnectionStatus({ connected: false });
  }, []);

  /**
   * Find candidate Sage transactions matching a receipt.
   * Returns matches sorted by score (best first).
   */
  const findMatches = useCallback(async (receiptId: string): Promise<SageMatch[]> => {
    const res = await fetch(`/api/sage/receipts/${receiptId}/match`);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to find Sage matches');
    }
    const data = await res.json();
    return data.matches as SageMatch[];
  }, []);

  /**
   * Push a receipt as an attachment to a Sage transaction.
   * @param receiptId     Firestore receipt ID
   * @param transactionId Sage bank transaction ID
   */
  const pushToSage = useCallback(async (
    receiptId: string,
    transactionId: string
  ): Promise<{ sageTransactionId: string; sagePushedAt: string }> => {
    const res = await fetch(`/api/sage/receipts/${receiptId}/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionId }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to push receipt to Sage');
    }
    return res.json();
  }, []);

  return {
    connectionStatus,
    statusLoading,
    connect,
    disconnect,
    findMatches,
    pushToSage,
  };
}
