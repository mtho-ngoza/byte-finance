'use client';

import { useState } from 'react';
import { AmountDisplay } from '@/components/shared/amount-display';
import type { BackfillCandidate } from '@/lib/smart-link';

interface BackfillSheetProps {
  targetName: string;
  targetId: string;
  targetType: 'goal' | 'investment' | 'savings_pot';
  candidates: BackfillCandidate[];
  onConfirm: (selected: BackfillCandidate[]) => Promise<void>;
  onSkip: () => void;
  onClose: () => void;
}

export function BackfillSheet({
  targetName,
  targetId,
  targetType,
  candidates,
  onConfirm,
  onSkip,
  onClose,
}: BackfillSheetProps) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(candidates.map((c) => c.expenseId)),
  );
  const [loading, setLoading] = useState(false);

  const selectedCandidates = candidates.filter((c) => selected.has(c.expenseId));
  const totalAmount = selectedCandidates.reduce((sum, c) => sum + c.amount, 0);

  function toggleCandidate(expenseId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(expenseId)) next.delete(expenseId);
      else next.add(expenseId);
      return next;
    });
  }

  async function handleConfirm() {
    if (selectedCandidates.length === 0) return;
    setLoading(true);
    try {
      await onConfirm(selectedCandidates);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Sheet */}
      <div className="relative z-10 w-full sm:max-w-md bg-surface rounded-t-2xl sm:rounded-2xl border border-border p-6 max-h-[80vh] flex flex-col">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Backfill contributions?</h2>
            <p className="text-sm text-text-secondary mt-0.5">
              Found {candidates.length} past paid expense{candidates.length !== 1 ? 's' : ''} matching{' '}
              <span className="text-text-primary font-medium">{targetName}</span>.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary transition-colors ml-4 shrink-0"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 20 20">
              <path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Candidate list */}
        <div className="flex-1 overflow-y-auto space-y-2 mb-4">
          {candidates.map((c) => (
            <label
              key={c.expenseId}
              className="flex items-center gap-3 p-3 rounded-lg border border-border bg-surface cursor-pointer hover:border-primary/40 transition-colors"
            >
              <input
                type="checkbox"
                checked={selected.has(c.expenseId)}
                onChange={() => toggleCandidate(c.expenseId)}
                className="w-4 h-4 accent-primary"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-primary truncate">{c.label}</p>
                <p className="text-xs text-text-secondary">
                  {new Date(c.paidDate).toLocaleDateString('en-ZA', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              </div>
              <AmountDisplay amount={c.amount} size="sm" />
            </label>
          ))}
        </div>

        {/* Total */}
        {selectedCandidates.length > 0 && (
          <div className="flex items-center justify-between py-2 border-t border-border mb-4">
            <span className="text-sm text-text-secondary">
              Total ({selectedCandidates.length} selected)
            </span>
            <AmountDisplay amount={totalAmount} size="sm" className="text-primary" />
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onSkip}
            className="flex-1 py-2.5 rounded-xl border border-border text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Skip
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || selectedCandidates.length === 0}
            className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Applying…' : `Backfill ${selectedCandidates.length}`}
          </button>
        </div>
      </div>
    </div>
  );
}
