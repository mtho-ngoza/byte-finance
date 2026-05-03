'use client';

import { useCallback } from 'react';
import type { PendingReceipt } from '@/types';

// ---------------------------------------------------------------------------
// IndexedDB constants
// ---------------------------------------------------------------------------

const DB_NAME = 'bytereceipt-queue';
const STORE_NAME = 'pending-receipts';
const DB_VERSION = 1;

// ---------------------------------------------------------------------------
// Low-level IndexedDB helpers
// ---------------------------------------------------------------------------

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ---------------------------------------------------------------------------
// Queue operations (standalone — usable from SW context too)
// ---------------------------------------------------------------------------

/**
 * Save a pending receipt to IndexedDB.
 * Call this BEFORE any upload attempt — it is the safety net.
 */
export async function addToQueue(pending: PendingReceipt): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(pending);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Remove a pending receipt from IndexedDB after a successful upload.
 */
export async function removeFromQueue(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Return all pending receipts from IndexedDB.
 */
export async function getQueue(): Promise<PendingReceipt[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      db.close();
      resolve(req.result as PendingReceipt[]);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Attempt to upload each pending receipt.
 * On success → remove from queue.
 * On failure → increment uploadAttempts and update lastAttempt.
 *
 * This is called:
 *  - On app open (processQueue from the hook)
 *  - From the Service Worker sync event (processReceiptQueue exported below)
 */
export async function processQueue(): Promise<void> {
  let items: PendingReceipt[];
  try {
    items = await getQueue();
  } catch {
    // IndexedDB unavailable (e.g., private browsing in some browsers)
    return;
  }

  if (items.length === 0) return;

  for (const item of items) {
    try {
      // Build FormData from the stored blob
      const blob = item.compressedBlob ?? item.imageBlob;
      const formData = new FormData();
      formData.append('image', blob, 'receipt.jpg');

      const uploadRes = await fetch('/api/receipts/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) {
        throw new Error(`Upload failed: ${uploadRes.status}`);
      }

      const { imageUrl, originalImageUrl, thumbnailUrl, imageHash: serverHash } =
        await uploadRes.json();

      // Write Firestore document via receipts API
      const receiptRes = await fetch('/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl,
          originalImageUrl,
          thumbnailUrl,
          imageHash: item.imageHash || serverHash,
          amountInCents: item.amountInCents,
          vendor: item.vendor,
          note: item.note,
          location: item.location,
          capturedAt: new Date(item.capturedAt).toISOString(),
        }),
      });

      if (!receiptRes.ok) {
        throw new Error(`Receipt creation failed: ${receiptRes.status}`);
      }

      // Success — remove from queue
      await removeFromQueue(item.id);
    } catch (err) {
      console.warn(`[ReceiptQueue] Failed to upload ${item.id}:`, err);

      // Increment retry counter and record last attempt time
      const updated: PendingReceipt = {
        ...item,
        uploadAttempts: item.uploadAttempts + 1,
        lastAttempt: Date.now(),
      };
      try {
        await addToQueue(updated);
      } catch {
        // Best-effort update
      }
    }
  }
}

// Alias used by the Service Worker (sw.js)
export { processQueue as processReceiptQueue };

// ---------------------------------------------------------------------------
// React hook — wraps the standalone functions for component use
// ---------------------------------------------------------------------------

export function useReceiptQueue() {
  const add = useCallback((pending: PendingReceipt) => addToQueue(pending), []);
  const remove = useCallback((id: string) => removeFromQueue(id), []);
  const get = useCallback(() => getQueue(), []);
  const process = useCallback(() => processQueue(), []);

  return {
    addToQueue: add,
    removeFromQueue: remove,
    getQueue: get,
    processQueue: process,
  };
}
