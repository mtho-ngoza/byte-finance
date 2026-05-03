'use client';

import { useState, useCallback, useRef } from 'react';
import { addToQueue, removeFromQueue } from '@/hooks/use-receipt-queue';
import { useReceipts } from '@/hooks/use-receipts';
import type { PendingReceipt } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReceiptUploadParams {
  imageBlob: Blob;
  amount: number;
  vendor: string;
  note: string;
  location?: {
    lat: number;
    lng: number;
    accuracy: number;
  };
}

export interface ReceiptUploadResult {
  success: boolean;
  error?: string;
}

export type UploadStatus =
  | ''
  | 'Hashing…'
  | 'Compressing…'
  | 'Queuing…'
  | 'Uploading…'
  | 'Saving…';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Orchestrates the full receipt upload pipeline:
 *  1. Hash original blob (duplicate detection)
 *  2. Compress blob via Web Worker
 *  3. Save to IndexedDB queue (safety net before any network call)
 *  4. Register Background Sync
 *  5. Upload compressed blob to /api/receipts/upload
 *  6. Create Firestore doc via createReceipt
 *  7. Remove from queue on success
 *
 * On failure the receipt stays in the IndexedDB queue and will be retried
 * on next app open or when the Background Sync event fires.
 */
export function useReceiptUpload() {
  const { createReceipt } = useReceipts();
  const [status, setStatus] = useState<UploadStatus>('');
  const [isUploading, setIsUploading] = useState(false);

  // Run a Web Worker and return its result, with a timeout fallback
  const runWorker = useCallback(
    <T,>(workerPath: string, message: object, timeoutMs = 15000): Promise<T> => {
      return new Promise((resolve, reject) => {
        let worker: Worker;
        try {
          worker = new Worker(workerPath);
        } catch (err) {
          reject(err);
          return;
        }

        const timer = setTimeout(() => {
          worker.terminate();
          reject(new Error(`Worker ${workerPath} timed out`));
        }, timeoutMs);

        worker.onmessage = (event) => {
          clearTimeout(timer);
          worker.terminate();
          if (event.data.error) {
            reject(new Error(event.data.error));
          } else {
            resolve(event.data as T);
          }
        };

        worker.onerror = (err) => {
          clearTimeout(timer);
          worker.terminate();
          reject(err);
        };

        worker.postMessage(message);
      });
    },
    []
  );

  const upload = useCallback(
    async (params: ReceiptUploadParams): Promise<ReceiptUploadResult> => {
      const { imageBlob, amount, vendor, note, location } = params;

      setIsUploading(true);

      try {
        // Step 1: Hash the original blob for duplicate detection
        let imageHash = '';
        try {
          setStatus('Hashing…');
          const hashResult = await runWorker<{ hash: string }>(
            '/workers/hash.worker.js',
            { blob: imageBlob }
          );
          imageHash = hashResult.hash;
        } catch (hashErr) {
          console.warn('Hash worker failed, using fallback hash:', hashErr);
          // Fallback: timestamp-based pseudo-hash so queue entry is still valid
          imageHash = `fallback-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        }

        // Step 2: Compress the blob (fall back to original if worker fails)
        let compressedBlob: Blob | undefined;
        try {
          setStatus('Compressing…');
          const compressResult = await runWorker<{ blob: Blob }>(
            '/workers/compress.worker.js',
            { blob: imageBlob }
          );
          compressedBlob = compressResult.blob;
        } catch (compressErr) {
          console.warn('Compress worker failed, will upload original:', compressErr);
        }

        // Step 3: Save to IndexedDB BEFORE any upload attempt (safety net)
        const pendingId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const pendingReceipt: PendingReceipt = {
          id: pendingId,
          imageBlob,
          compressedBlob,
          imageHash,
          amountInCents: amount > 0 ? amount : undefined,
          vendor: vendor.trim() || undefined,
          note: note.trim() || undefined,
          location,
          capturedAt: Date.now(),
          uploadAttempts: 0,
        };

        setStatus('Queuing…');
        await addToQueue(pendingReceipt);

        // Step 4: Register Background Sync so the SW can retry if the tab closes
        if ('serviceWorker' in navigator) {
          try {
            const sw = await navigator.serviceWorker.ready;
            // Background Sync API — not available in all browsers (graceful degradation)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const swWithSync = sw as any;
            if (swWithSync.sync) {
              await swWithSync.sync.register('receipt-upload');
            }
          } catch (syncErr) {
            // Graceful degradation — retry will happen on next app open instead
            console.warn('Background Sync registration failed:', syncErr);
          }
        }

        // Step 5: Attempt upload now (optimistic — may fail if offline)
        setStatus('Uploading…');
        const uploadBlob = compressedBlob ?? imageBlob;
        const formData = new FormData();
        formData.append('image', uploadBlob, 'receipt.jpg');

        const uploadRes = await fetch('/api/receipts/upload', {
          method: 'POST',
          body: formData,
        });

        if (!uploadRes.ok) {
          const err = await uploadRes.json();
          throw new Error(err.error || 'Upload failed');
        }

        const {
          imageUrl,
          originalImageUrl,
          thumbnailUrl,
          imageHash: serverHash,
        } = await uploadRes.json();

        // Step 6: Create Firestore doc
        setStatus('Saving…');
        await createReceipt({
          imageUrl,
          originalImageUrl,
          thumbnailUrl,
          imageHash: imageHash.startsWith('fallback-') ? serverHash : imageHash,
          amountInCents: amount > 0 ? amount : undefined,
          vendor: vendor.trim() || undefined,
          note: note.trim() || undefined,
          location,
          capturedAt: new Date().toISOString(),
        });

        // Step 7: Upload succeeded — remove from queue
        await removeFromQueue(pendingId);

        return { success: true };
      } catch (err) {
        console.error('Receipt upload error:', err);
        // Receipt is already in IndexedDB queue — it will retry on next app open
        // or when Background Sync fires.
        return {
          success: false,
          error:
            'Upload failed. Your receipt has been saved locally and will upload automatically when you reconnect.',
        };
      } finally {
        setIsUploading(false);
        setStatus('');
      }
    },
    [runWorker, createReceipt]
  );

  return { upload, status, isUploading };
}
