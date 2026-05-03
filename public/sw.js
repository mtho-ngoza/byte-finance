const CACHE_NAME = 'bytefinance-v1';
const OFFLINE_URL = '/offline';

// Assets to cache immediately on install
const PRECACHE_ASSETS = [
  '/',
  '/offline',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ---------------------------------------------------------------------------
// Install — cache core app shell assets
// ---------------------------------------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  self.skipWaiting();
});

// ---------------------------------------------------------------------------
// Activate — clean up old caches
// ---------------------------------------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// ---------------------------------------------------------------------------
// Fetch — cache-first for static assets, network-first for everything else
// ---------------------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip API requests — always go to network
  if (event.request.url.includes('/api/')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses for static assets
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(async () => {
        // Try cache first
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }

        // For navigation requests, show offline page
        if (event.request.mode === 'navigate') {
          const offlineResponse = await caches.match(OFFLINE_URL);
          if (offlineResponse) {
            return offlineResponse;
          }
        }

        // Return a basic offline response
        return new Response('Offline', {
          status: 503,
          statusText: 'Service Unavailable',
        });
      })
  );
});

// ---------------------------------------------------------------------------
// Background Sync — retry pending receipt uploads
// ---------------------------------------------------------------------------

const DB_NAME = 'bytereceipt-queue';
const STORE_NAME = 'pending-receipts';
const DB_VERSION = 1;

/** Open (or create) the IndexedDB queue database */
function openQueueDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Read all pending receipts from IndexedDB */
async function getAllPending(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Remove a successfully uploaded receipt from the queue */
async function removeFromQueueDB(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Update a failed receipt (increment uploadAttempts) */
async function updateQueueItem(db, item) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Process the receipt upload queue.
 * Called from the Background Sync event so it runs even when the app is closed.
 */
async function processReceiptQueue() {
  let db;
  try {
    db = await openQueueDB();
  } catch (err) {
    console.warn('[SW] Could not open IndexedDB queue:', err);
    return;
  }

  let items;
  try {
    items = await getAllPending(db);
  } catch (err) {
    console.warn('[SW] Could not read queue:', err);
    db.close();
    return;
  }

  if (!items || items.length === 0) {
    db.close();
    return;
  }

  for (const item of items) {
    try {
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
      await removeFromQueueDB(db, item.id);
      console.log('[SW] Uploaded queued receipt:', item.id);
    } catch (err) {
      console.warn('[SW] Failed to upload queued receipt:', item.id, err);

      // Increment retry counter
      try {
        await updateQueueItem(db, {
          ...item,
          uploadAttempts: (item.uploadAttempts || 0) + 1,
          lastAttempt: Date.now(),
        });
      } catch {
        // Best-effort
      }
    }
  }

  db.close();
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'receipt-upload') {
    event.waitUntil(processReceiptQueue());
  }
});

