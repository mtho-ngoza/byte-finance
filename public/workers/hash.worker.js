/**
 * hash.worker.js
 * Computes a SHA-256 hash of image bytes using SubtleCrypto.
 * Returns the hash as a lowercase hex string.
 *
 * Input message: { blob: Blob }
 * Output message: { hash: string }  (64-char hex string)
 * Error message:  { error: string }
 */

self.onmessage = async function (event) {
  const { blob } = event.data;

  if (!blob) {
    self.postMessage({ error: 'No blob provided' });
    return;
  }

  try {
    // Read blob into an ArrayBuffer
    const arrayBuffer = await blob.arrayBuffer();

    // Compute SHA-256 using SubtleCrypto (available in workers)
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);

    // Convert ArrayBuffer to hex string
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');

    self.postMessage({ hash: hashHex });
  } catch (err) {
    self.postMessage({ error: err instanceof Error ? err.message : String(err) });
  }
};
