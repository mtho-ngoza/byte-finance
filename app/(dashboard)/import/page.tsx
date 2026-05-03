'use client';

import { useState, useEffect } from 'react';
import { useCycles } from '@/hooks/use-cycles';
import type { ParsedItem } from '@/app/api/import/parse/route';

// ---------------------------------------------------------------------------
// Category options (matches types/index.ts)
// ---------------------------------------------------------------------------

const CATEGORIES = [
  'housing',
  'transport',
  'family',
  'health',
  'utilities',
  'business',
  'lifestyle',
  'education',
  'savings',
  'other',
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCycleId(id: string): string {
  const [year, month] = id.split('-');
  const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1);
  return date.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
}

function formatAmount(cents: number): string {
  return `R ${(cents / 100).toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ---------------------------------------------------------------------------
// EditableRow component
// ---------------------------------------------------------------------------

interface EditableRowProps {
  item: ParsedItem;
  index: number;
  onChange: (index: number, updated: ParsedItem) => void;
  onRemove: (index: number) => void;
}

function EditableRow({ item, index, onChange, onRemove }: EditableRowProps) {
  const [editingAmount, setEditingAmount] = useState(false);
  const [amountInput, setAmountInput] = useState((item.amountInCents / 100).toFixed(2));

  const handleAmountBlur = () => {
    const parsed = parseFloat(amountInput);
    if (!isNaN(parsed) && parsed >= 0) {
      onChange(index, { ...item, amountInCents: Math.round(parsed * 100) });
    } else {
      setAmountInput((item.amountInCents / 100).toFixed(2));
    }
    setEditingAmount(false);
  };

  const handleAmountKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAmountBlur();
    if (e.key === 'Escape') {
      setAmountInput((item.amountInCents / 100).toFixed(2));
      setEditingAmount(false);
    }
  };

  return (
    <tr className="border-b border-border last:border-0 hover:bg-background/50 transition-colors">
      {/* Label */}
      <td className="py-2 px-3">
        <input
          type="text"
          value={item.label}
          onChange={(e) => onChange(index, { ...item, label: e.target.value })}
          className="w-full bg-transparent text-sm text-text-primary border-b border-transparent hover:border-border focus:border-primary focus:outline-none py-0.5 transition-colors"
        />
      </td>

      {/* Amount */}
      <td className="py-2 px-3 text-right">
        {editingAmount ? (
          <div className="flex items-center justify-end gap-1">
            <span className="text-xs text-text-secondary">R</span>
            <input
              type="number"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              onBlur={handleAmountBlur}
              onKeyDown={handleAmountKeyDown}
              autoFocus
              step="0.01"
              min="0"
              className="w-24 px-2 py-0.5 text-sm text-right rounded border border-primary bg-background text-text-primary focus:outline-none"
            />
          </div>
        ) : (
          <button
            onClick={() => {
              setAmountInput((item.amountInCents / 100).toFixed(2));
              setEditingAmount(true);
            }}
            className="text-sm text-text-primary hover:text-primary transition-colors font-mono"
            title="Click to edit"
          >
            {formatAmount(item.amountInCents)}
          </button>
        )}
      </td>

      {/* Status */}
      <td className="py-2 px-3">
        <select
          value={item.status}
          onChange={(e) =>
            onChange(index, { ...item, status: e.target.value as 'paid' | 'upcoming' })
          }
          className="text-xs rounded border border-border bg-background text-text-primary px-2 py-1 focus:outline-none focus:border-primary"
        >
          <option value="upcoming">Upcoming</option>
          <option value="paid">Paid</option>
        </select>
      </td>

      {/* Category */}
      <td className="py-2 px-3">
        <select
          value={item.category}
          onChange={(e) => onChange(index, { ...item, category: e.target.value })}
          className="text-xs rounded border border-border bg-background text-text-primary px-2 py-1 focus:outline-none focus:border-primary capitalize"
        >
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat} className="capitalize">
              {cat}
            </option>
          ))}
        </select>
      </td>

      {/* Account type */}
      <td className="py-2 px-3">
        <select
          value={item.accountType}
          onChange={(e) =>
            onChange(index, {
              ...item,
              accountType: e.target.value as 'personal' | 'business',
            })
          }
          className="text-xs rounded border border-border bg-background text-text-primary px-2 py-1 focus:outline-none focus:border-primary"
        >
          <option value="personal">Personal</option>
          <option value="business">Business</option>
        </select>
      </td>

      {/* Remove */}
      <td className="py-2 px-2 text-center">
        <button
          onClick={() => onRemove(index)}
          className="w-6 h-6 flex items-center justify-center rounded text-text-secondary hover:text-error hover:bg-error/10 transition-colors mx-auto"
          title="Remove item"
          aria-label="Remove item"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Main ImportPage
// ---------------------------------------------------------------------------

export default function ImportPage() {
  const { cycles, loading: cyclesLoading } = useCycles();

  const [rawText, setRawText] = useState('');
  const [selectedCycleId, setSelectedCycleId] = useState('');
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [parsing, setParsing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState<number | null>(null);

  // Default to the most recent/active cycle
  useEffect(() => {
    if (!selectedCycleId && cycles.length > 0) {
      const active = cycles.find((c) => c.status === 'active') ?? cycles[0];
      if (active) setSelectedCycleId(active.id);
    }
  }, [cycles, selectedCycleId]);

  // Sort cycles newest first
  const sortedCycles = [...cycles].sort((a, b) => b.id.localeCompare(a.id));

  const handleParse = async () => {
    if (!rawText.trim()) return;
    if (!selectedCycleId) {
      setParseError('Please select a cycle first.');
      return;
    }

    setParsing(true);
    setParseError(null);
    setSuccessCount(null);
    setParsedItems([]);

    try {
      const res = await fetch('/api/import/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: rawText, cycleId: selectedCycleId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setParseError(data.error ?? 'Failed to parse text. Please try again.');
        return;
      }

      setParsedItems(data.items ?? []);
    } catch {
      setParseError('Network error. Please check your connection and try again.');
    } finally {
      setParsing(false);
    }
  };

  const handleItemChange = (index: number, updated: ParsedItem) => {
    setParsedItems((prev) => prev.map((item, i) => (i === index ? updated : item)));
  };

  const handleItemRemove = (index: number) => {
    setParsedItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleConfirm = async () => {
    if (parsedItems.length === 0 || !selectedCycleId) return;

    setConfirming(true);
    setConfirmError(null);
    setSuccessCount(null);

    try {
      const res = await fetch('/api/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: parsedItems, cycleId: selectedCycleId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setConfirmError(data.error ?? 'Failed to import items. Please try again.');
        return;
      }

      setSuccessCount(data.created);
      setParsedItems([]);
      // Keep rawText so user can retry or re-parse if needed
    } catch {
      setConfirmError('Network error. Please check your connection and try again.');
    } finally {
      setConfirming(false);
    }
  };

  const totalAmount = parsedItems.reduce((sum, item) => sum + item.amountInCents, 0);
  const paidCount = parsedItems.filter((i) => i.status === 'paid').length;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Import Expenses</h1>
        <p className="text-sm text-text-secondary mt-1">
          Paste your Samsung Notes expense text and let AI extract the items.
        </p>
      </div>

      {/* Cycle selector */}
      <div className="p-4 rounded-xl border border-border bg-surface space-y-3">
        <label className="block text-sm font-medium text-text-primary">
          Import into cycle
        </label>
        {cyclesLoading ? (
          <div className="h-9 bg-background rounded-lg animate-pulse" />
        ) : (
          <select
            value={selectedCycleId}
            onChange={(e) => setSelectedCycleId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm focus:outline-none focus:border-primary"
          >
            <option value="" disabled>
              Select a cycle…
            </option>
            {sortedCycles.map((cycle) => (
              <option key={cycle.id} value={cycle.id}>
                {formatCycleId(cycle.id)}
                {cycle.status === 'active' ? ' (current)' : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Text input */}
      <div className="p-4 rounded-xl border border-border bg-surface space-y-3">
        <label className="block text-sm font-medium text-text-primary">
          Paste expense text
        </label>
        <p className="text-xs text-text-secondary">
          Supports Samsung Notes format: <code className="bg-background px-1 rounded">[v]</code> for paid,{' '}
          <code className="bg-background px-1 rounded">[ ]</code> for upcoming.
        </p>
        <textarea
          value={rawText}
          onChange={(e) => {
            setRawText(e.target.value);
            // Clear previous results when text changes
            if (parsedItems.length > 0) {
              setParsedItems([]);
              setSuccessCount(null);
            }
          }}
          placeholder={`March expenses 2026\n[v] Bond - R9 000\n[v] Medical aid - R6 000\n[ ] Petrol - R2 500\n[v] Byte Fusion - R3 000`}
          rows={10}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text-primary text-sm font-mono resize-y focus:outline-none focus:border-primary placeholder:text-text-secondary/50"
        />

        {parseError && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-error/10 border border-error/30">
            <svg className="w-4 h-4 text-error shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path strokeLinecap="round" d="M12 8v4M12 16h.01" />
            </svg>
            <p className="text-sm text-error">{parseError}</p>
          </div>
        )}

        <button
          onClick={handleParse}
          disabled={parsing || !rawText.trim() || !selectedCycleId}
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
          ) : (
            'Parse with AI'
          )}
        </button>
      </div>

      {/* Preview table */}
      {parsedItems.length > 0 && (
        <div className="p-4 rounded-xl border border-border bg-surface space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-text-primary">
              Preview — {parsedItems.length} item{parsedItems.length !== 1 ? 's' : ''}
            </h2>
            <div className="text-xs text-text-secondary">
              {paidCount} paid · {parsedItems.length - paidCount} upcoming ·{' '}
              <span className="font-medium text-text-primary">{formatAmount(totalAmount)}</span>
            </div>
          </div>

          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-left min-w-[600px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 px-3 text-xs font-medium text-text-secondary">Label</th>
                  <th className="py-2 px-3 text-xs font-medium text-text-secondary text-right">Amount</th>
                  <th className="py-2 px-3 text-xs font-medium text-text-secondary">Status</th>
                  <th className="py-2 px-3 text-xs font-medium text-text-secondary">Category</th>
                  <th className="py-2 px-3 text-xs font-medium text-text-secondary">Account</th>
                  <th className="py-2 px-2 text-xs font-medium text-text-secondary text-center">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {parsedItems.map((item, index) => (
                  <EditableRow
                    key={index}
                    item={item}
                    index={index}
                    onChange={handleItemChange}
                    onRemove={handleItemRemove}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {confirmError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-error/10 border border-error/30">
              <svg className="w-4 h-4 text-error shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path strokeLinecap="round" d="M12 8v4M12 16h.01" />
              </svg>
              <p className="text-sm text-error">{confirmError}</p>
            </div>
          )}

          <button
            onClick={handleConfirm}
            disabled={confirming || parsedItems.length === 0}
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
            ) : (
              `Import ${parsedItems.length} item${parsedItems.length !== 1 ? 's' : ''}`
            )}
          </button>
        </div>
      )}

      {/* Success message */}
      {successCount !== null && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-primary/30 bg-primary/10">
          <svg className="w-5 h-5 text-primary shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-text-primary">
              Successfully imported {successCount} item{successCount !== 1 ? 's' : ''}
            </p>
            <p className="text-xs text-text-secondary mt-0.5">
              Added to{' '}
              <span className="font-medium">{selectedCycleId ? formatCycleId(selectedCycleId) : 'cycle'}</span>.
              You can paste more text above to import additional items.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
