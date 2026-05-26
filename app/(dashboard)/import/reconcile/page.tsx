'use client';

import { useState, useEffect } from 'react';
import { useCycles } from '@/hooks/use-cycles';

interface ReconcileItem {
  id: string; label: string; amount: number; date: string | null; status: string; receiptId?: string;
}
interface ReconcileReceipt {
  id: string; amountInCents?: number; vendor?: string; capturedAt: string | null; cycleItemId?: string;
}
interface MatchedPair { itemId: string; receiptId: string; confidence: 'high' | 'medium'; }
interface ReconcileData {
  matched: MatchedPair[];
  unmatchedItems: ReconcileItem[];
  orphanReceipts: ReconcileReceipt[];
  items: ReconcileItem[];
  receipts: ReconcileReceipt[];
}

function formatCycleId(id: string) {
  const [y, m] = id.split('-');
  return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
}
function fmt(cents: number) { return `R${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`; }
function fmtDate(iso: string | null) { return iso ? new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }) : '—'; }

export default function ReconcilePage() {
  const { cycles, loading: cyclesLoading } = useCycles();
  const [cycleId, setCycleId] = useState('');
  const [data, setData] = useState<ReconcileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState<string | null>(null);

  useEffect(() => {
    if (!cycleId && cycles.length > 0) {
      const active = cycles.find((c) => c.status === 'active') ?? cycles[0];
      if (active) setCycleId(active.id);
    }
  }, [cycles, cycleId]);

  const load = async () => {
    if (!cycleId) return;
    setLoading(true); setError(null); setData(null);
    try {
      const res = await fetch(`/api/import/statement/reconcile?cycleId=${cycleId}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Failed'); return; }
      setData(json);
    } catch { setError('Network error.'); }
    finally { setLoading(false); }
  };

  const link = async (itemId: string, receiptId: string) => {
    setLinking(itemId);
    try {
      await fetch('/api/import/statement/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, receiptId }),
      });
      setData((prev) => prev ? {
        ...prev,
        unmatchedItems: prev.unmatchedItems.filter((i) => i.id !== itemId),
        orphanReceipts: prev.orphanReceipts.filter((r) => r.id !== receiptId),
        matched: [...prev.matched, { itemId, receiptId, confidence: 'high' }],
      } : prev);
    } finally { setLinking(null); }
  };

  return (
    <div className="space-y-6 max-w-3xl pb-8">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Statement Reconciliation</h1>
        <p className="text-sm text-text-secondary mt-1">Match imported bank transactions against captured receipts.</p>
      </div>

      <div className="p-4 rounded-xl border border-border bg-surface space-y-3">
        <label className="block text-sm font-medium text-text-primary">Select cycle</label>
        {cyclesLoading ? <div className="h-9 bg-background rounded-lg animate-pulse" /> : (
          <div className="flex gap-3">
            <select value={cycleId} onChange={(e) => { setCycleId(e.target.value); setData(null); }}
              className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary">
              <option value="" disabled>Select a cycle…</option>
              {[...cycles].sort((a, b) => b.id.localeCompare(a.id)).map((c) => (
                <option key={c.id} value={c.id}>{formatCycleId(c.id)}{c.status === 'active' ? ' (current)' : ''}</option>
              ))}
            </select>
            <button onClick={load} disabled={loading || !cycleId}
              className="px-4 py-2 rounded-lg bg-primary text-background text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors">
              {loading ? 'Loading…' : 'Reconcile'}
            </button>
          </div>
        )}
        {error && <p className="text-sm text-error">{error}</p>}
      </div>

      {data && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Matched', value: data.matched.length, color: 'text-primary border-primary/30 bg-primary/5' },
              { label: 'Unmatched', value: data.unmatchedItems.length, color: 'text-warning border-warning/30 bg-warning/5' },
              { label: 'Orphan receipts', value: data.orphanReceipts.length, color: 'text-text-primary border-border bg-surface' },
            ].map(({ label, value, color }) => (
              <div key={label} className={`p-3 rounded-xl border text-center ${color}`}>
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-xs text-text-secondary mt-1">{label}</p>
              </div>
            ))}
          </div>

          {/* Matched */}
          {data.matched.length > 0 && (
            <section>
              <h2 className="text-sm font-medium text-text-primary mb-3">✓ Matched ({data.matched.length})</h2>
              <div className="rounded-xl border border-border bg-surface divide-y divide-border">
                {data.matched.map((m) => {
                  const item = data.items.find((i) => i.id === m.itemId);
                  const receipt = data.receipts.find((r) => r.id === m.receiptId);
                  if (!item || !receipt) return null;
                  return (
                    <div key={m.itemId} className="flex items-center gap-3 p-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${m.confidence === 'high' ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning'}`}>
                        {m.confidence}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text-primary truncate">{item.label}</p>
                        <p className="text-xs text-text-secondary">{fmtDate(item.date)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-mono text-text-primary">{fmt(item.amount)}</p>
                        <p className="text-xs text-text-secondary">{receipt.vendor ?? '—'}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Unmatched */}
          {data.unmatchedItems.length > 0 && (
            <section>
              <h2 className="text-sm font-medium text-warning mb-3">⚠ Unmatched Transactions ({data.unmatchedItems.length})</h2>
              <div className="rounded-xl border border-border bg-surface divide-y divide-border">
                {data.unmatchedItems.map((item) => (
                  <div key={item.id} className="p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text-primary truncate">{item.label}</p>
                        <p className="text-xs text-text-secondary">{fmtDate(item.date)}</p>
                      </div>
                      <p className="text-sm font-mono text-text-primary shrink-0">{fmt(item.amount)}</p>
                    </div>
                    {data.orphanReceipts.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-text-secondary">Link to:</span>
                        {data.orphanReceipts.map((r) => (
                          <button key={r.id} onClick={() => link(item.id, r.id)} disabled={linking === item.id}
                            className="text-xs px-2 py-1 rounded border border-border hover:border-primary text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50">
                            {r.vendor ?? 'Receipt'} {r.amountInCents ? fmt(r.amountInCents) : ''} {fmtDate(r.capturedAt)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Orphan receipts */}
          {data.orphanReceipts.length > 0 && (
            <section>
              <h2 className="text-sm font-medium text-text-secondary mb-3">📷 Orphan Receipts ({data.orphanReceipts.length})</h2>
              <p className="text-xs text-text-secondary mb-3">Receipts with no matching bank transaction.</p>
              <div className="rounded-xl border border-border bg-surface divide-y divide-border">
                {data.orphanReceipts.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary">{r.vendor ?? 'Unknown vendor'}</p>
                      <p className="text-xs text-text-secondary">{fmtDate(r.capturedAt)}</p>
                    </div>
                    <p className="text-sm font-mono text-text-primary shrink-0">{r.amountInCents ? fmt(r.amountInCents) : '—'}</p>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-border text-text-secondary shrink-0">no match</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {data.items.length === 0 && (
            <div className="text-center py-12 text-text-secondary">
              <p className="text-4xl mb-3">📊</p>
              <p className="text-sm">No imported transactions found for this cycle.</p>
              <p className="text-xs mt-1">Import a bank statement first from the Import page.</p>
            </div>
          )}

          {data.matched.length === data.items.length && data.items.length > 0 && (
            <div className="flex items-center gap-3 p-4 rounded-xl border border-primary/30 bg-primary/5">
              <svg className="w-5 h-5 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-medium text-text-primary">All transactions reconciled.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
