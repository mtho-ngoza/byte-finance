'use client';

import { useRef, useState } from 'react';

interface InlineReceiptCaptureProps {
  /** Called with the newly created receipt id after upload + Firestore doc creation */
  onCaptured: (receiptId: string) => void;
  onError?: (msg: string) => void;
}

/**
 * Lightweight inline receipt capture button.
 * Opens the camera/file picker, uploads to /api/receipts/upload,
 * creates the Firestore doc via /api/receipts, then calls onCaptured(id).
 * No workers, no queue — intentionally simple for inline use.
 */
export function InlineReceiptCapture({ onCaptured, onError }: InlineReceiptCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      // 1. Upload image to Storage
      const formData = new FormData();
      formData.append('image', file, 'receipt.jpg');
      const uploadRes = await fetch('/api/receipts/upload', { method: 'POST', body: formData });
      if (!uploadRes.ok) throw new Error('Upload failed');
      const { imageUrl, originalImageUrl, thumbnailUrl, imageHash } = await uploadRes.json();

      // 2. Create Firestore receipt doc
      const createRes = await fetch('/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl,
          originalImageUrl,
          thumbnailUrl,
          imageHash,
          capturedAt: new Date().toISOString(),
          needsAttention: true, // amount/vendor not set yet
        }),
      });
      if (!createRes.ok) throw new Error('Failed to save receipt');
      const receipt = await createRes.json();
      onCaptured(receipt.id);
    } catch (err) {
      console.error('Inline capture failed:', err);
      onError?.('Failed to upload receipt. Try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          // reset so same file can be re-selected
          e.target.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm text-text-secondary hover:border-primary hover:text-text-primary transition-colors disabled:opacity-50"
      >
        {uploading ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Uploading…
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Take / Upload photo
          </>
        )}
      </button>
    </>
  );
}
