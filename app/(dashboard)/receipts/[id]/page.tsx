'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useReceipts } from '@/hooks/use-receipts';
import { useSage, type SageMatch } from '@/hooks/use-sage';
import { AmountDisplay } from '@/components/shared/amount-display';
import { CurrencyInput } from '@/components/shared/currency-input';
import { useToast } from '@/components/shared/toast';
import type { Receipt } from '@/types';

interface ReceiptDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function ReceiptDetailPage({ params }: ReceiptDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { receipts, loading, updateReceipt, deleteReceipt } = useReceipts();

  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(0);
  const [vendor, setVendor] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  const { toast, confirm } = useToast();

  // Sage integration state
  const { connectionStatus, findMatches, pushToSage } = useSage();
  const [sageMatches, setSageMatches] = useState<SageMatch[] | null>(null);
  const [sageLoading, setSageLoading] = useState(false);
  const [sageError, setSageError] = useState<string | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<string | null>(null);
  const [pushing, setPushing] = useState(false);

  const receipt = receipts.find((r) => r.id === id) ?? null;

  // Sync form state when receipt loads
  useEffect(() => {
    if (receipt) {
      setAmount(receipt.amountInCents ?? 0);
      setVendor(receipt.vendor ?? '');
      setNote(receipt.note ?? '');
    }
  }, [receipt]);

  const capturedAt = receipt?.capturedAt
    ? new Date(
        typeof receipt.capturedAt === 'string'
          ? receipt.capturedAt
          : (receipt.capturedAt as unknown as { toDate: () => Date }).toDate()
      ).toLocaleString('en-ZA', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
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
      toast('Failed to update receipt.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!receipt) return;
    confirm('This will permanently delete the receipt.', async () => {
      setDeleting(true);
      try {
        await deleteReceipt(receipt.id);
        router.push('/receipts');
        toast('Receipt deleted', 'success');
      } catch (err) {
        console.error('Delete error:', err);
        toast('Failed to delete receipt.', 'error');
        setDeleting(false);
      }
    }, { title: 'Delete Receipt', confirmLabel: 'Delete', danger: true });
  };

  const handleFindMatches = async () => {
    if (!receipt) return;
    setSageLoading(true);
    setSageError(null);
    setSageMatches(null);
    setSelectedMatch(null);
    try {
      const matches = await findMatches(receipt.id);
      setSageMatches(matches);
      if (matches.length === 0) setSageError('No matching Sage transactions found.');
    } catch (err) {
      console.error('Sage match error:', err);
      setSageError(err instanceof Error ? err.message : 'Failed to find matches.');
    } finally {
      setSageLoading(false);
    }
  };

  const handlePushToSage = async () => {
    if (!receipt || !selectedMatch) return;
    setPushing(true);
    setSageError(null);
    try {
      await pushToSage(receipt.id, selectedMatch);
      // Receipt will update via Firestore subscription
      setSageMatches(null);
      setSelectedMatch(null);
    } catch (err) {
      console.error('Sage push error:', err);
      setSageError(err instanceof Error ? err.message : 'Failed to push to Sage.');
    } finally {
      setPushing(false);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-32 bg-surface rounded" />
        <div className="aspect-[4/3] bg-surface rounded-xl" />
        <div className="h-24 bg-surface rounded-xl" />
      </div>
    );
  }

  if (!receipt) {
    return (
      <div className="text-center py-12 text-text-secondary">
        <p className="text-4xl mb-3">🔍</p>
        <p>Receipt not found.</p>
        <button
          onClick={() => router.push('/receipts')}
          className="mt-4 text-primary text-sm hover:underline"
        >
          Back to receipts
        </button>
      </div>
    );
  }

  const imageUrl = receipt.originalImageUrl || receipt.imageUrl;

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10H5m5-5-5 5 5 5" />
          </svg>
          <span className="text-sm">Receipts</span>
        </button>
        <div className="flex items-center gap-2">
          {/* Download button */}
          {imageUrl && (
            <a
              href={imageUrl}
              download={`receipt-${receipt.vendor ?? receipt.id}-${capturedAt.split(',')[0]}.jpg`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-9 h-9 flex items-center justify-center rounded-lg border border-border text-text-secondary hover:text-text-primary hover:border-primary transition-colors"
              aria-label="Download receipt"
              title="Download receipt"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </a>
          )}
          <button
            onClick={() => setEditing(!editing)}
            className="px-3 py-1.5 rounded-lg border border-border text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            {editing ? 'Cancel' : 'Edit'}
          </button>
        </div>
      </div>

      {/* Receipt image */}
      {imageUrl && (
        <div
          className={`rounded-xl overflow-hidden bg-background cursor-zoom-in ${zoomed ? 'fixed inset-0 z-50 flex items-center justify-center bg-black/95 cursor-zoom-out rounded-none' : ''}`}
          onClick={() => setZoomed(!zoomed)}
        >
          <img
            src={imageUrl}
            alt="Receipt"
            className={`w-full object-contain ${zoomed ? 'max-h-screen' : 'max-h-[60vh]'}`}
          />
          {zoomed && (
            <button
              onClick={(e) => { e.stopPropagation(); setZoomed(false); }}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white"
              aria-label="Close zoom"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* Needs attention banner */}
      {receipt.needsAttention && !editing && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-warning/10 border border-warning/30">
          <span>⚠️</span>
          <p className="text-sm text-warning">Missing amount or vendor — tap Edit to complete.</p>
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
              className="w-full py-2.5 bg-primary text-black font-medium rounded-lg disabled:opacity-50 transition-opacity"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-text-secondary mb-1">Amount</p>
                {receipt.amountInCents ? (
                  <AmountDisplay amount={receipt.amountInCents} size="lg" />
                ) : (
                  <p className="text-warning text-sm">Not set</p>
                )}
              </div>
              <div>
                <p className="text-xs text-text-secondary mb-1">Vendor</p>
                <p className="text-text-primary font-medium">{receipt.vendor || <span className="text-warning text-sm">Not set</span>}</p>
              </div>
            </div>

            {receipt.note && (
              <div>
                <p className="text-xs text-text-secondary mb-1">Note</p>
                <p className="text-sm text-text-primary">{receipt.note}</p>
              </div>
            )}

            <div>
              <p className="text-xs text-text-secondary mb-1">Captured</p>
              <p className="text-sm text-text-primary">{capturedAt}</p>
            </div>

            {receipt.location && (
              <div>
                <p className="text-xs text-text-secondary mb-1">Location</p>
                <p className="text-sm text-text-primary font-mono">
                  {receipt.location.lat.toFixed(5)}, {receipt.location.lng.toFixed(5)}
                  <span className="text-text-secondary ml-2 text-xs">±{Math.round(receipt.location.accuracy)}m</span>
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Sage Business Cloud push panel */}
      {!editing && connectionStatus?.connected && !receipt.needsAttention && (
        <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
          <div className="flex items-center gap-2">
            {/* Sage logo placeholder */}
            <div className="w-6 h-6 rounded bg-green-600/20 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-green-400">S</span>
            </div>
            <p className="text-sm font-medium text-text-primary">Sage Business Cloud</p>
          </div>

          {receipt.sageMatchStatus === 'pushed' ? (
            /* Already pushed */
            <div className="flex items-center gap-2 text-sm text-green-400">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span>
                Linked to transaction{' '}
                <span className="font-mono text-xs text-text-secondary">
                  {receipt.sageTransactionId}
                </span>
              </span>
            </div>
          ) : (
            /* Not yet pushed */
            <>
              {sageError && (
                <p className="text-xs text-danger">{sageError}</p>
              )}

              {sageMatches === null ? (
                <button
                  onClick={handleFindMatches}
                  disabled={sageLoading}
                  className="w-full py-2 border border-border rounded-lg text-sm text-text-primary hover:border-primary transition-colors disabled:opacity-50"
                >
                  {sageLoading ? 'Searching Sage…' : 'Find Sage Match'}
                </button>
              ) : sageMatches.length === 0 ? (
                <div className="space-y-2">
                  <p className="text-xs text-text-secondary">No matching transactions found.</p>
                  <button
                    onClick={handleFindMatches}
                    className="text-xs text-primary hover:underline"
                  >
                    Try again
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-text-secondary">Select a transaction to link:</p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {sageMatches.map((match) => (
                      <button
                        key={match.id}
                        onClick={() => setSelectedMatch(match.id === selectedMatch ? null : match.id)}
                        className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                          selectedMatch === match.id
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-text-primary truncate">{match.description}</span>
                          <span className="text-text-primary font-medium flex-shrink-0">
                            R {match.total_amount.toFixed(2)}
                          </span>
                        </div>
                        <p className="text-xs text-text-secondary mt-0.5">
                          {new Date(match.date).toLocaleDateString('en-ZA')}
                          {match.reference && ` · ${match.reference}`}
                        </p>
                      </button>
                    ))}
                  </div>

                  {selectedMatch && (
                    <button
                      onClick={handlePushToSage}
                      disabled={pushing}
                      className="w-full py-2.5 bg-green-600 text-white font-medium rounded-lg text-sm hover:bg-green-700 transition-colors disabled:opacity-50"
                    >
                      {pushing ? 'Linking…' : 'Link & Push to Sage'}
                    </button>
                  )}

                  <button
                    onClick={() => { setSageMatches(null); setSelectedMatch(null); setSageError(null); }}
                    className="w-full text-xs text-text-secondary hover:text-text-primary transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Delete */}
      {!editing && (
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="w-full py-2.5 border border-danger/40 text-danger rounded-xl text-sm hover:bg-danger/5 transition-colors disabled:opacity-50"
        >
          {deleting ? 'Deleting…' : 'Delete Receipt'}
        </button>
      )}
    </div>
  );
}
