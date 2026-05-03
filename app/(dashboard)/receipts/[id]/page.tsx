'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserId } from '@/hooks/use-user-id';
import { useReceipts } from '@/hooks/use-receipts';
import { AmountDisplay } from '@/components/shared/amount-display';
import { CurrencyInput } from '@/components/shared/currency-input';
import type { Receipt } from '@/types';

interface ReceiptDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function ReceiptDetailPage({ params }: ReceiptDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const userId = useUserId();
  const { updateReceipt, deleteReceipt } = useReceipts();

  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(0);
  const [vendor, setVendor] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  // Subscribe to receipt document
  useEffect(() => {
    if (!userId) return;
    const ref = doc(db, `users/${userId}/receipts/${id}`);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() } as Receipt;
        setReceipt(data);
        setAmount(data.amountInCents ?? 0);
        setVendor(data.vendor ?? '');
        setNote(data.note ?? '');
      }
      setLoading(false);
    });
    return unsub;
  }, [userId, id]);

  const capturedAt = receipt?.capturedAt
    ? new Date(
        typeof receipt.capturedAt === 'string'
          ? receipt.capturedAt
          : receipt.capturedAt.toDate()
      ).toLocaleString('en-ZA', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : '';

  const handleSave = async () => {
    if (!receipt) return;
    setSaving(true);
    try {
      await updateReceipt(receipt.id, {
        amountInCents: amount > 0 ? amount : undefined,
        vendor: vendor.trim() || undefined,
        note: note.trim() || undefined,
      });
      setEditing(false);
    } catch (err) {
      console.error('Update error:', err);
      alert('Failed to update receipt.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!receipt) return;
    if (!confirm('Delete this receipt? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await deleteReceipt(receipt.id);
      router.push('/receipts');
    } catch (err) {
      console.error('Delete error:', err);
      alert('Failed to delete receipt.');
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-10 w-32 bg-surface rounded" />
        <div className="aspect-[4/3] bg-surface rounded-xl" />
        <div className="h-24 bg-surface rounded-xl" />
      </div>
    );
  }

  if (!receipt) {
    return (
      <div className="text-center py-12 text-text-secondary">
        <p>Receipt not found.</p>
        <button
          onClick={() => router.push('/receipts')}
          className="mt-4 text-primary text-sm"
        >
          ← Back to receipts
        </button>
      </div>
    );
  }

  const imageUrl = receipt.originalImageUrl || receipt.imageUrl;

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push('/receipts')}
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Receipts
        </button>
        <button
          onClick={() => setEditing(!editing)}
          className="px-3 py-1.5 rounded-lg border border-border text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          {editing ? 'Cancel' : 'Edit'}
        </button>
      </div>

      {/* Image — tap to zoom */}
      <div
        className={`rounded-xl overflow-hidden bg-background cursor-zoom-in transition-all ${
          zoomed ? 'fixed inset-0 z-50 rounded-none cursor-zoom-out flex items-center justify-center bg-black' : ''
        }`}
        onClick={() => setZoomed(!zoomed)}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt="Receipt"
            className={`w-full object-contain ${zoomed ? 'max-h-screen' : 'max-h-[60vh]'}`}
          />
        ) : (
          <div className="aspect-[4/3] flex items-center justify-center text-text-secondary">
            <span className="text-4xl">📄</span>
          </div>
        )}
        {zoomed && (
          <div className="absolute top-4 right-4 text-white/70 text-xs">
            Tap to close
          </div>
        )}
      </div>

      {/* Needs attention badge */}
      {receipt.needsAttention && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-warning/10 border border-warning/30 text-sm text-warning">
          <span>⚠️</span>
          Missing amount or vendor — tap Edit to complete
        </div>
      )}

      {/* Details / Edit form */}
      <div className="rounded-xl border border-border bg-surface p-4 space-y-4">
        {editing ? (
          <>
            <h2 className="text-sm font-medium text-text-primary">Edit Receipt</h2>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Amount</label>
              <CurrencyInput value={amount} onChange={setAmount} />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Vendor</label>
              <input
                type="text"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary text-sm"
                placeholder="e.g. Engen, Makro"
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Note</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary text-sm"
                placeholder="Quick context..."
              />
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-2.5 bg-primary text-black font-medium rounded-lg disabled:opacity-50 text-sm"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-text-secondary mb-0.5">Amount</p>
                {receipt.amountInCents ? (
                  <AmountDisplay amount={receipt.amountInCents} size="lg" />
                ) : (
                  <p className="text-warning text-sm">Not set</p>
                )}
              </div>
              <div>
                <p className="text-xs text-text-secondary mb-0.5">Vendor</p>
                <p className="text-text-primary font-medium">{receipt.vendor || '—'}</p>
              </div>
            </div>

            {receipt.note && (
              <div>
                <p className="text-xs text-text-secondary mb-0.5">Note</p>
                <p className="text-sm text-text-primary">{receipt.note}</p>
              </div>
            )}

            <div>
              <p className="text-xs text-text-secondary mb-0.5">Captured</p>
              <p className="text-sm text-text-primary">{capturedAt}</p>
            </div>

            {receipt.location && (
              <div>
                <p className="text-xs text-text-secondary mb-0.5">Location</p>
                <p className="text-sm text-text-primary font-mono">
                  {receipt.location.lat.toFixed(5)}, {receipt.location.lng.toFixed(5)}
                  <span className="text-text-secondary ml-2 text-xs">
                    ±{Math.round(receipt.location.accuracy)}m
                  </span>
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Delete */}
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="w-full py-2.5 border border-danger/40 text-danger rounded-lg text-sm hover:bg-danger/5 transition-colors disabled:opacity-50"
      >
        {deleting ? 'Deleting…' : 'Delete Receipt'}
      </button>
    </div>
  );
}
