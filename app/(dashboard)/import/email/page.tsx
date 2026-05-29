'use client';

import { useState, useEffect } from 'react';
import { useCycles } from '@/hooks/use-cycles';

interface InvoicePreview {
  messageId: string;
  subject: string;
  from: string;
  date: string;
  attachments: Array<{ filename: string; size: number; contentType: string }>;
  selected?: boolean;
}

function formatCycleId(id: string) {
  const [y, m] = id.split('-');
  return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
}

export default function EmailImportPage() {
  const { cycles, loading: cyclesLoading } = useCycles();
  const [cycleId, setCycleId] = useState('');

  // Connection form
  const [host, setHost] = useState('');
  const [port, setPort] = useState('993');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [maxMessages, setMaxMessages] = useState('20');

  // State
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<InvoicePreview[]>([]);

  useEffect(() => {
    if (!cycleId && cycles.length > 0) {
      const active = cycles.find((c) => c.status === 'active') ?? cycles[0];
      if (active) setCycleId(active.id);
    }
  }, [cycles, cycleId]);

  const handleFetch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!host || !user || !password || !cycleId) return;
    setFetching(true);
    setError(null);
    setInvoices([]);

    try {
      const res = await fetch('/api/import/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, port: parseInt(port), user, password, cycleId, maxMessages: parseInt(maxMessages) }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to connect'); return; }
      setInvoices((data.invoices ?? []).map((inv: InvoicePreview) => ({ ...inv, selected: true })));
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setFetching(false);
    }
  };

  const toggle = (id: string) => {
    setInvoices((prev) => prev.map((inv) => inv.messageId === id ? { ...inv, selected: !inv.selected } : inv));
  };

  const selectedCount = invoices.filter((i) => i.selected).length;

  return (
    <div className="space-y-6 max-w-2xl pb-8">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Email Invoice Harvesting</h1>
        <p className="text-sm text-text-secondary mt-1">
          Connect to your mailbox via IMAP to find emails with PDF invoice attachments.
        </p>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl border border-border bg-surface">
        <span className="text-lg shrink-0">💡</span>
        <div className="text-xs text-text-secondary space-y-1">
          <p>Use an <strong className="text-text-primary">app password</strong>, not your main account password.</p>
          <p>Gmail: <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">myaccount.google.com/apppasswords</a></p>
          <p>Outlook: Settings → Security → App passwords</p>
          <p>Common IMAP hosts: <code className="bg-background px-1 rounded">imap.gmail.com</code> · <code className="bg-background px-1 rounded">outlook.office365.com</code></p>
        </div>
      </div>

      {/* Connection form */}
      <form onSubmit={handleFetch} className="p-4 rounded-xl border border-border bg-surface space-y-4">
        <h2 className="text-sm font-medium text-text-primary">Mailbox Connection</h2>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-xs text-text-secondary mb-1">IMAP Host</label>
            <input value={host} onChange={(e) => setHost(e.target.value)} required placeholder="imap.gmail.com"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Port</label>
            <input value={port} onChange={(e) => setPort(e.target.value)} type="number" min="1" max="65535"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-text-secondary mb-1">Email Address</label>
            <input value={user} onChange={(e) => setUser(e.target.value)} required type="email" placeholder="you@gmail.com"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-text-secondary mb-1">App Password</label>
            <input value={password} onChange={(e) => setPassword(e.target.value)} required type="password" placeholder="App password (not your main password)"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Import into cycle</label>
            {cyclesLoading ? <div className="h-9 bg-background rounded-lg animate-pulse" /> : (
              <select value={cycleId} onChange={(e) => setCycleId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary">
                <option value="" disabled>Select…</option>
                {[...cycles].sort((a, b) => b.id.localeCompare(a.id)).map((c) => (
                  <option key={c.id} value={c.id}>{formatCycleId(c.id)}{c.status === 'active' ? ' (current)' : ''}</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Scan last N messages</label>
            <input value={maxMessages} onChange={(e) => setMaxMessages(e.target.value)} type="number" min="1" max="200"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary" />
          </div>
        </div>

        {error && <p className="text-sm text-error">{error}</p>}

        <button type="submit" disabled={fetching || !host || !user || !password || !cycleId}
          className="w-full py-2.5 rounded-lg bg-primary text-background font-medium text-sm disabled:opacity-50 hover:bg-primary/90 transition-colors flex items-center justify-center gap-2">
          {fetching ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Scanning inbox…
            </>
          ) : 'Scan for Invoices'}
        </button>
      </form>

      {/* Results */}
      {invoices.length > 0 && (
        <div className="p-4 rounded-xl border border-border bg-surface space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-text-primary">
              {invoices.length} invoice email{invoices.length !== 1 ? 's' : ''} found
            </h2>
            <span className="text-xs text-text-secondary">{selectedCount} selected</span>
          </div>

          <div className="space-y-2">
            {invoices.map((inv) => (
              <div key={inv.messageId}
                onClick={() => toggle(inv.messageId)}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${inv.selected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}>
                <input type="checkbox" checked={inv.selected ?? false} onChange={() => toggle(inv.messageId)}
                  onClick={(e) => e.stopPropagation()} className="mt-0.5 accent-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{inv.subject}</p>
                  <p className="text-xs text-text-secondary truncate">{inv.from}</p>
                  <p className="text-xs text-text-secondary">{new Date(inv.date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {inv.attachments.map((a, i) => (
                      <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-background border border-border text-text-secondary">
                        📎 {a.filename} ({(a.size / 1024).toFixed(0)}KB)
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-text-secondary">
            Selected invoices will be saved as receipts in your account. AI extraction of amounts and vendors happens automatically.
          </p>

          <button
            disabled={selectedCount === 0}
            className="w-full py-2.5 rounded-lg bg-primary text-background font-medium text-sm disabled:opacity-50 hover:bg-primary/90 transition-colors"
            onClick={() => {
              // TODO: implement confirm endpoint that downloads PDFs and creates receipt docs
              alert(`Import of ${selectedCount} invoice(s) — full PDF download + receipt creation coming soon.`);
            }}
          >
            Import {selectedCount} Invoice{selectedCount !== 1 ? 's' : ''}
          </button>
        </div>
      )}

      {invoices.length === 0 && !fetching && error === null && (
        <div className="text-center py-8 text-text-secondary text-sm">
          <p className="text-3xl mb-2">📧</p>
          <p>No results yet. Fill in your mailbox details and scan.</p>
        </div>
      )}
    </div>
  );
}
