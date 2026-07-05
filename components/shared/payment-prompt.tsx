'use client';

import { useState } from 'react';
import { InlineReceiptCapture } from './inline-receipt-capture';
import { GroupedReceiptPicker, ReceiptItem } from './grouped-receipt-picker';
import { DateInput } from './date-input';
import { useToast } from './toast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PaymentPromptProps {
  itemLabel: string;
  budgetAmount: number;
  totalPaidSoFar: number;
  isPartial: boolean;
  onConfirm: (amount: number, note?: string, receiptId?: string, date?: string) => Promise<void>;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// PaymentPrompt Component
// ---------------------------------------------------------------------------

export function PaymentPrompt({
  itemLabel,
  budgetAmount,
  totalPaidSoFar,
  isPartial,
  onConfirm,
  onClose,
}: PaymentPromptProps) {
  const { toast } = useToast();

  const [paymentValue, setPaymentValue] = useState(
    isPartial ? '' : (budgetAmount / 100).toFixed(2)
  );
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentReceiptId, setPaymentReceiptId] = useState<string | undefined>(undefined);
  const [showReceiptPicker, setShowReceiptPicker] = useState(false);
  const [receipts, setReceipts] = useState<ReceiptItem[]>([]);
  const [receiptsLoaded, setReceiptsLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Fetch receipts when opening the picker
  const fetchReceipts = () => {
    if (!receiptsLoaded) {
      fetch('/api/receipts')
        .then((r) => r.json())
        .then((d) => {
          setReceipts(d.receipts ?? []);
          setReceiptsLoaded(true);
        })
        .catch(() => setReceiptsLoaded(true));
    }
  };

  const handleConfirm = async () => {
    const amt = Math.round(parseFloat(paymentValue) * 100);
    if (isNaN(amt) || amt <= 0) {
      toast('Please enter a valid amount', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await onConfirm(amt, paymentNote.trim() || undefined, paymentReceiptId, paymentDate || undefined);
      onClose();
    } catch {
      toast('Failed to add payment', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
      <div className="bg-surface border border-border rounded-t-2xl sm:rounded-xl w-full sm:max-w-sm flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-border shrink-0">
          <h3 className="text-sm font-semibold text-text-primary">Add Payment — {itemLabel}</h3>
          <p className="text-xs text-text-secondary mt-1">
            {isPartial
              ? `Paid so far: R${(totalPaidSoFar / 100).toFixed(2)} · Budget: R${(budgetAmount / 100).toFixed(2)}`
              : `Budget: R${(budgetAmount / 100).toFixed(2)}`}
          </p>
        </div>

        {/* Form content */}
        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          {/* Amount */}
          <div>
            <label className="block text-xs text-text-secondary mb-1">Amount paid</label>
            <div className="flex items-center gap-2">
              <span className="text-lg text-text-secondary font-mono">R</span>
              <input
                type="number"
                value={paymentValue}
                onChange={(e) => setPaymentValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !showReceiptPicker) handleConfirm();
                  if (e.key === 'Escape') onClose();
                }}
                autoFocus
                step="0.01"
                min="0"
                className="flex-1 px-3 py-2.5 text-lg rounded-lg border border-primary bg-background text-text-primary focus:outline-none font-mono"
              />
            </div>
          </div>

          {/* Note + Date row */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs text-text-secondary mb-1">Note</label>
              <input
                type="text"
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                placeholder="optional"
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-text-primary focus:outline-none focus:border-primary"
              />
            </div>
            <DateInput
              label="Date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              containerClassName="w-[130px] shrink-0"
            />
          </div>

          {/* Receipt section - collapsible */}
          <div className="pt-1">
            {!showReceiptPicker && !paymentReceiptId ? (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowReceiptPicker(true);
                    fetchReceipts();
                  }}
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-border text-text-secondary text-sm hover:border-primary hover:text-text-primary transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Link existing receipt
                </button>
                <InlineReceiptCapture
                  onCaptured={(id) => {
                    setPaymentReceiptId(id);
                    setReceipts((prev) => [{ id, thumbnailUrl: undefined, imageUrl: undefined }, ...prev]);
                    setReceiptsLoaded(true);
                  }}
                  onError={(msg) => toast(msg, 'error')}
                />
              </div>
            ) : paymentReceiptId ? (
              <div className="flex items-center gap-3 p-2 rounded-lg bg-primary/10 border border-primary/30">
                {(() => {
                  const selected = receipts.find((r) => r.id === paymentReceiptId);
                  return (
                    <>
                      {selected?.thumbnailUrl || selected?.imageUrl ? (
                        <img src={selected.thumbnailUrl || selected.imageUrl} alt="" className="w-10 h-10 rounded object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-primary/20 flex items-center justify-center">
                          <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text-primary truncate">{selected?.vendor || 'Receipt attached'}</p>
                        {selected?.amountInCents && (
                          <p className="text-xs text-text-secondary">R{(selected.amountInCents / 100).toFixed(2)}</p>
                        )}
                      </div>
                      <button
                        onClick={() => { setPaymentReceiptId(undefined); setShowReceiptPicker(false); }}
                        className="p-1.5 rounded-full hover:bg-background text-text-secondary hover:text-error transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </>
                  );
                })()}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-secondary">Select a receipt</span>
                  <button
                    onClick={() => setShowReceiptPicker(false)}
                    className="text-xs text-text-secondary hover:text-text-primary"
                  >
                    Cancel
                  </button>
                </div>
                {receiptsLoaded ? (
                  <GroupedReceiptPicker
                    receipts={receipts}
                    selectedId={paymentReceiptId}
                    onSelect={(id) => {
                      setPaymentReceiptId(paymentReceiptId === id ? undefined : id);
                      if (paymentReceiptId !== id) setShowReceiptPicker(false);
                    }}
                    filterLinked={true}
                    collapsible={false}
                  />
                ) : (
                  <div className="flex items-center justify-center py-4">
                    <svg className="w-5 h-5 animate-spin text-text-secondary" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="p-4 border-t border-border shrink-0 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-border text-text-secondary text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-lg bg-primary text-background font-medium text-sm disabled:opacity-50"
          >
            {submitting ? 'Adding...' : paymentReceiptId ? 'Add + Receipt' : 'Add Payment'}
          </button>
        </div>
      </div>
    </div>
  );
}
