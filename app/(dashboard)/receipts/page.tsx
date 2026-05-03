'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useReceipts } from '@/hooks/use-receipts';
import { useGeolocation } from '@/hooks/use-geolocation';
import { useReceiptQueue } from '@/hooks/use-receipt-queue';
import { useReceiptUpload } from '@/hooks/use-receipt-upload';
import { AmountDisplay } from '@/components/shared/amount-display';
import { CurrencyInput } from '@/components/shared/currency-input';
import type { Receipt, PendingReceipt } from '@/types';

// ---------------------------------------------------------------------------
// Main Receipts Page
// ---------------------------------------------------------------------------

export default function ReceiptsPage() {
  const { receipts, needsAttention, complete, loading } = useReceipts();
  const { processQueue, getQueue } = useReceiptQueue();
  const [showCapture, setShowCapture] = useState(false);
  const [pendingQueue, setPendingQueue] = useState<PendingReceipt[]>([]);

  // Process any queued uploads on page open and refresh the pending count
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // Refresh pending count first
        const queue = await getQueue();
        if (!cancelled) setPendingQueue(queue);

        // Then attempt to process (will update queue on success)
        await processQueue();

        // Refresh again after processing
        const updated = await getQueue();
        if (!cancelled) setPendingQueue(updated);
      } catch {
        // IndexedDB may be unavailable in some environments — degrade gracefully
      }
    }

    init();
    return () => { cancelled = true; };
  }, [getQueue, processQueue]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-32 bg-surface rounded" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-40 bg-surface rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Receipts</h1>
          <p className="text-sm text-text-secondary">
            {receipts.length} receipt{receipts.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Pending upload indicator */}
        {pendingQueue.length > 0 && (
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface border border-border text-sm">
              <span
                className="inline-block animate-spin text-primary"
                aria-hidden="true"
                style={{ display: 'inline-block' }}
              >
                ⟳
              </span>
              <span className="text-text-secondary">
                {pendingQueue.length} pending
              </span>
            </div>
            {pendingQueue.filter((p) => p.uploadAttempts > 2).length > 0 && (
              <div className="flex items-center gap-1 text-xs text-warning">
                <span>⚠️</span>
                <span>
                  {pendingQueue.filter((p) => p.uploadAttempts > 2).length} failed
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Needs Attention Section */}
      {needsAttention.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-warning flex items-center gap-1.5 mb-3">
            <span>⚠️</span>
            Needs Attention ({needsAttention.length})
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {needsAttention.map((receipt) => (
              <ReceiptCard
                key={receipt.id}
                receipt={receipt}
              />
            ))}
          </div>
        </section>
      )}

      {/* All Receipts */}
      <section>
        <h2 className="text-sm font-medium text-text-primary mb-3">
          All Receipts
        </h2>
        {complete.length === 0 && needsAttention.length === 0 ? (
          <div className="text-center py-12 text-text-secondary">
            <p className="text-4xl mb-3">📷</p>
            <p>No receipts yet.</p>
            <p className="text-sm mt-1">Tap + to capture your first receipt.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {complete.map((receipt) => (
              <ReceiptCard
                key={receipt.id}
                receipt={receipt}
              />
            ))}
          </div>
        )}
      </section>

      {/* Capture FAB */}
      <button
        onClick={() => setShowCapture(true)}
        className="fixed bottom-20 right-4 w-14 h-14 rounded-full bg-primary text-background shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors z-40"
        aria-label="Capture receipt"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      {/* Capture Modal */}
      {showCapture && (
        <ReceiptCapture onClose={() => setShowCapture(false)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReceiptCard Component
// ---------------------------------------------------------------------------

interface ReceiptCardProps {
  receipt: Receipt;
}

function ReceiptCard({ receipt }: ReceiptCardProps) {
  const capturedAt = receipt.capturedAt
    ? new Date(typeof receipt.capturedAt === 'string' ? receipt.capturedAt : receipt.capturedAt.toDate()).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })
    : '';

  return (
    <Link
      href={`/receipts/${receipt.id}`}
      className="bg-surface border border-border rounded-xl overflow-hidden text-left hover:border-primary transition-colors block"
    >
      {/* Image */}
      <div className="aspect-[4/3] bg-background relative">
        {receipt.thumbnailUrl || receipt.imageUrl ? (
          <img
            src={receipt.thumbnailUrl || receipt.imageUrl}
            alt="Receipt"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-text-secondary">
            <span className="text-2xl">📄</span>
          </div>
        )}
        {receipt.needsAttention && (
          <div className="absolute top-2 right-2 w-6 h-6 bg-warning rounded-full flex items-center justify-center text-xs">
            ?
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-2">
        <div className="flex items-center justify-between">
          {receipt.amountInCents ? (
            <AmountDisplay amount={receipt.amountInCents} size="sm" />
          ) : (
            <span className="text-sm text-warning">No amount</span>
          )}
        </div>
        <p className="text-xs text-text-secondary truncate">
          {receipt.vendor || 'No vendor'}
        </p>
        <p className="text-[10px] text-text-secondary mt-0.5">{capturedAt}</p>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// ReceiptCapture Component
// ---------------------------------------------------------------------------

interface ReceiptCaptureProps {
  onClose: () => void;
}

function ReceiptCapture({ onClose }: ReceiptCaptureProps) {
  const { location, getSuggestedVendors } = useGeolocation();
  const { upload, status: uploadStatus, isUploading: saving } = useReceiptUpload();

  const [step, setStep] = useState<'camera' | 'form'>('camera');
  const [imageData, setImageData] = useState<string | null>(null);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [amount, setAmount] = useState(0);
  const [vendor, setVendor] = useState('');
  const [note, setNote] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const suggestedVendors = getSuggestedVendors([]);

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Camera error:', err);
      alert('Could not access camera. Please grant permission.');
    }
  }, []);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  // Capture photo from camera
  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      setImageData(dataUrl);
      canvas.toBlob(
        (blob) => { if (blob) setImageBlob(blob); },
        'image/jpeg',
        0.8
      );
      setStep('form');
      stopCamera();
    }
  }, [stopCamera]);

  // Handle file picked from gallery
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      setImageData(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
    setImageBlob(file);
    stopCamera();
    setStep('form');
  }, [stopCamera]);

  // Save receipt via the upload hook
  const handleSave = async () => {
    if (!imageBlob) return;

    const result = await upload({
      imageBlob,
      amount,
      vendor,
      note,
      location: location
        ? { lat: location.lat, lng: location.lng, accuracy: location.accuracy }
        : undefined,
    });

    if (!result.success && result.error) {
      alert(result.error);
    }

    onClose();
  };

  // Start camera on mount
  useState(() => {
    startCamera();
  });

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Hidden file input for gallery uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {step === 'camera' ? (
        <>
          {/* Camera view */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="flex-1 object-cover"
            onLoadedMetadata={() => videoRef.current?.play()}
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* Camera controls */}
          <div className="absolute bottom-0 left-0 right-0 p-6 flex items-center justify-center gap-6">
            <button
              onClick={handleClose}
              className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-white"
              aria-label="Close"
            >
              ✕
            </button>
            {/* Shutter */}
            <button
              onClick={capturePhoto}
              className="w-16 h-16 rounded-full bg-white border-4 border-white/50"
              aria-label="Take photo"
            />
            {/* Gallery picker */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-white"
              aria-label="Upload from gallery"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Form overlay on captured image */}
          <div className="flex-1 relative">
            {imageData && (
              <img
                src={imageData}
                alt="Captured receipt"
                className="w-full h-full object-contain"
              />
            )}

            {/* Form overlay */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-black/50 p-4 space-y-4">
              {/* Amount */}
              <div>
                <label className="block text-xs text-white/70 mb-1">Amount</label>
                <CurrencyInput
                  value={amount}
                  onChange={setAmount}
                />
              </div>

              {/* Vendor chips */}
              <div>
                <label className="block text-xs text-white/70 mb-1">Vendor</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {suggestedVendors.slice(0, 6).map((v) => (
                    <button
                      key={v}
                      onClick={() => setVendor(v)}
                      className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                        vendor === v
                          ? 'bg-primary text-black'
                          : 'bg-white/20 text-white hover:bg-white/30'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                  placeholder="Or type vendor name..."
                  className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder:text-white/50 focus:outline-none focus:border-primary text-sm"
                />
              </div>

              {/* Note */}
              <div>
                <label className="block text-xs text-white/70 mb-1">Note (optional)</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Quick context..."
                  className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder:text-white/50 focus:outline-none focus:border-primary text-sm"
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setStep('camera');
                    setImageData(null);
                    setImageBlob(null);
                    startCamera();
                  }}
                  className="flex-1 py-3 rounded-lg border border-white/30 text-white font-medium"
                >
                  Retake
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 py-3 rounded-lg bg-primary text-black font-medium disabled:opacity-50"
                >
                  {saving ? (uploadStatus || 'Saving…') : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReceiptDetail Component
// ---------------------------------------------------------------------------

interface ReceiptDetailProps {
  receipt: Receipt;
  onClose: () => void;
  onDelete: () => Promise<void>;
}

function ReceiptDetail({ receipt, onClose, onDelete }: ReceiptDetailProps) {
  const { updateReceipt } = useReceipts();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(receipt.amountInCents ?? 0);
  const [vendor, setVendor] = useState(receipt.vendor ?? '');
  const [note, setNote] = useState(receipt.note ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const capturedAt = receipt.capturedAt
    ? new Date(typeof receipt.capturedAt === 'string' ? receipt.capturedAt : receipt.capturedAt.toDate()).toLocaleString('en-ZA')
    : '';

  const handleSave = async () => {
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
    if (!confirm('Delete this receipt?')) return;
    setDeleting(true);
    try {
      await onDelete();
    } catch (err) {
      console.error('Delete error:', err);
      alert('Failed to delete receipt.');
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white"
        >
          ←
        </button>
        <button
          onClick={() => setEditing(!editing)}
          className="px-4 py-2 rounded-lg bg-white/10 text-white text-sm"
        >
          {editing ? 'Cancel' : 'Edit'}
        </button>
      </div>

      {/* Image */}
      <div className="flex-1 overflow-auto">
        {(receipt.originalImageUrl || receipt.imageUrl) && (
          <img
            src={receipt.originalImageUrl || receipt.imageUrl}
            alt="Receipt"
            className="w-full object-contain"
          />
        )}
      </div>

      {/* Details */}
      <div className="p-4 bg-surface border-t border-border space-y-4">
        {editing ? (
          <>
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
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Note</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary text-sm"
              />
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-2 bg-primary text-black font-medium rounded-lg disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-text-secondary">Amount</p>
                {receipt.amountInCents ? (
                  <AmountDisplay amount={receipt.amountInCents} size="lg" />
                ) : (
                  <p className="text-warning">Not set</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs text-text-secondary">Vendor</p>
                <p className="text-text-primary">{receipt.vendor || 'Not set'}</p>
              </div>
            </div>
            {receipt.note && (
              <div>
                <p className="text-xs text-text-secondary">Note</p>
                <p className="text-sm text-text-primary">{receipt.note}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-text-secondary">Captured</p>
              <p className="text-sm text-text-primary">{capturedAt}</p>
            </div>
          </>
        )}

        <button
          onClick={handleDelete}
          disabled={deleting}
          className="w-full py-2 border border-error text-error rounded-lg text-sm disabled:opacity-50"
        >
          {deleting ? 'Deleting...' : 'Delete Receipt'}
        </button>
      </div>
    </div>
  );
}
