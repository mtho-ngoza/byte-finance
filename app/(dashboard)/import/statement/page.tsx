'use client';

import { useState, useRef, useEffect } from 'react';
import { useCycles } from '@/hooks/use-cycles';
import type { ParsedTransaction } from '@/app/api/import/statement/route';

const CATEGORIES = [
  'housing','transport','family','health','utilities',
  'business','lifestyle','education','savings','other',
] as const;

function formatCycleId(id: string): string {
  const [year, month] = id.split('-');
  return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
}

function formatAmount(cents: number): string {
  return `R ${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
}

export default function StatementImportPage() {
  const { cycles, loading: cyclesLoading } = useCycles();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedCycleId, setSelectedCycleId] = useState('');
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [parsing, setParsing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState<number | null>(null);

  const sortedCycles = [...cycles].sort((a, b) => b.id.localeCompare(a.id));

  useEffect(() => {
    if (!selectedCycleId && cycles.length > 0) {
      const active = cycles.find((c) => c.status === 'active') ?? cycles[0];
      if (active) setSelectedCycleId(active.id);
    }
  }, [cycles, selectedCycleId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setTransactions([]);
    setSelected(new Set());
    setParseError(null);
    setSuccessCount(null);
  };

  const handleParse = async () => {
    if (!selectedFile || !selectedCycleId) return;
    setParsing(true);
    setParseError(null);
    setTransactions([]);
    setSelected(new Set());

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('cycleId', selectedCycleId);

      const res = await fetch('/api/import/statement', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) { setParseError(data.error ?? 'Failed to parse statement.'); return; }

      const txs: ParsedTransaction[] = data.transactions ?? [];
      setTransactions(txs);
      // Select all debits by default (money out = expenses)
      setSelected(new Set(txs.map((_, i) => i)));
    } catch {
      setParseError('Network error. Please try again.');
    } finally {
      setParsing(false);
    }
  };

  const toggleRow = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(selected.size === transactions.length ? new Set() : new Set(transactions.map((_, i) => i)));
  };

  const updateTx = (i: number, patch: Partial<ParsedTransaction>) => {
    setTransactions((prev) => prev.map((tx, idx) => idx === i ? { ...tx, ...patch } : tx));
  };

  const handleConfirm = async () => {
    const toImport = transactions.filter((_, i) => selected.has(i));
    if (!toImport.length || !selectedCycleId) return;

    setConfirming(true);
    setConfirmError(null);

    try {
      const res = await fetch('/api/import/statement/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: toImport, cycleId: selectedCycleId }),
      });
      const data = await res.json();
      if (!res.ok) { setConfirmError(data.error ?? 'Import failed.'); return; }
      setSuccessCount(data.created);
      setTransactions([]);
      setSelected(new Set());
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch {
      setConfirmError('Network error. Please try again.');
    } finally {
      setConfirming(false);
    }
  };

  const selectedTotal = transactions
    .filter((_, i) => selected.has(i))
    .reduce((sum, tx) => sum + tx.amountInCents, 0);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Bank Statement Import</h1>
        <p className="text-sm text-text-secondary mt-1">
          Upload a PDF or CSV bank statement. Supports FNB, Standard Bank, Absa, Nedbank, Capitec, TymeBank.
        </p>
      </div>

      {/* Cycle selector */}
      <div className="p-4 rounded-xl border border-border bg-surface space-y-3">
        <label className="block text-sm font-medium text-text-primary">Import into cycle</label>
        {cyclesLoading ? (
          <div className="h-9 bg-background rounded-lg animate-pulse" />
        ) : (
          <select
            value={selectedCycleId}
            onChange={(e) => setSelectedCycleId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
          >
            <option value="" disabled>Select a cycle…</option>
            {sortedCycles.map((c) => (
              <option key={c.id} value={c.id}>
                {formatCycleId(c.id)}{c.status === 'active' ? ' (current)' : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* File upload */}
      <div className="p-4 rounded-xl border border-border bg-surface space-y-3">
        <label className="block text-sm font-medium text-text-primary">Upload statement</label>
        <p className="text-xs text-text-secondary">PDF or CSV, max 10MB. File is processed in memory and never stored.</p>

        <div
          className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          {selectedFile ? (
            <div className="space-y-1">
              <p className="text-sm font-medium text-text-primary">📄 {selectedFile.name}</p>
              <p className="text-xs text-text-secondary">{(selectedFile.size / 1024).toFixed(1)} KB</p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-sm text-text-secondary">Click to select a file</p>
              <p className="text-xs text-text-secondary">PDF or CSV</p>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.csv,application/pdf,text/csv"
          className="hidden"
          onChange={handleFileChange}
        />

        {parseError && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-danger/10 border border-danger/30">
            <p className="text-sm text-danger">{parseError}</p>
          </div>
        )}

        <button
          onClick={handleParse}
          disabled={parsing || !selectedFile || !selectedCycleId}
          className="w-full py-2.5 rounded-lg bg-primary text-background font-medium text-sm disabled:opacity-50 hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
        >
          {parsing ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Parsing with AI…
            </>
          ) : 'Parse Statement'}
        </button>
      </div>

      {/* Preview table */}
      {transactions.length > 0 && (
        <div className="p-4 rounded-xl border border-border bg-surface space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-text-primary">
              {transactions.length} transactions found
            </h2>
            <div className="text-xs text-text-secondary">
              {selected.size} selected · <span className="font-medium text-text-primary">{formatAmount(selectedTotal)}</span>
            </div>
          </div>

          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-left min-w-[640px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 px-2">
                    <input type="checkbox" checked={selected.size === transactions.length} onChange={toggleAll} className="accent-primary" />
                  </th>
                  <th className="py-2 px-3 text-xs font-medium text-text-secondary">Date</th>
                  <th className="py-2 px-3 text-xs font-medium text-text-secondary">Description</th>
                  <th className="py-2 px-3 text-xs font-medium text-text-secondary text-right">Amount</th>
                  <th className="py-2 px-3 text-xs font-medium text-text-secondary">Type</th>
                  <th className="py-2 px-3 text-xs font-medium text-text-secondary">Category</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx, i) => (
                  <tr key={i} className={`border-b border-border last:border-0 transition-colors ${selected.has(i) ? '' : 'opacity-40'}`}>
                    <td className="py-2 px-2">
                      <input type="checkbox" checked={selected.has(i)} onChange={() => toggleRow(i)} className="accent-primary" />
                    </td>
                    <td className="py-2 px-3 text-xs text-text-secondary font-mono">{tx.date}</td>
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        value={tx.description}
                        onChange={(e) => updateTx(i, { description: e.target.value })}
                        className="w-full bg-transparent text-sm text-text-primary border-b border-transparent hover:border-border focus:border-primary focus:outline-none py-0.5"
                      />
                    </td>
                    <td className="py-2 px-3 text-right text-sm font-mono text-text-primary">{formatAmount(tx.amountInCents)}</td>
                    <td className="py-2 px-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${tx.type === 'debit' ? 'bg-danger/10 text-danger' : 'bg-primary/10 text-primary'}`}>
                        {tx.type}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <select
                        value={tx.category}
                        onChange={(e) => updateTx(i, { category: e.target.value })}
                        className="text-xs rounded border border-border bg-background text-text-primary px-2 py-1 focus:outline-none focus:border-primary capitalize"
                      >
                        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {confirmError && (
            <div className="p-3 rounded-lg bg-danger/10 border border-danger/30">
              <p className="text-sm text-danger">{confirmError}</p>
            </div>
          )}

          <button
            onClick={handleConfirm}
            disabled={confirming || selected.size === 0}
            className="w-full py-2.5 rounded-lg bg-primary text-background font-medium text-sm disabled:opacity-50 hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
          >
            {confirming ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Importing…
              </>
            ) : `Import ${selected.size} transaction${selected.size !== 1 ? 's' : ''}`}
          </button>
        </div>
      )}

      {successCount !== null && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-primary/30 bg-primary/10">
          <svg className="w-5 h-5 text-primary shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm font-medium text-text-primary">
            Successfully imported {successCount} transaction{successCount !== 1 ? 's' : ''} into {selectedCycleId ? formatCycleId(selectedCycleId) : 'cycle'}.
          </p>
        </div>
      )}
    </div>
  );
}
