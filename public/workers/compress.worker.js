/**
 * compress.worker.js
 * Resizes an image to max 1920px on the longest side and compresses to JPEG 80%.
 * Uses createImageBitmap + OffscreenCanvas for off-main-thread rendering.
 *
 * Input message: { blob: Blob }
 * Output message: { blob: Blob }  (compressed JPEG)
 * Error message:  { error: string }
 */

const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.8;

self.onmessage = async function (event) {
  const { blob } = event.data;

  if (!blob) {
    self.postMessage({ error: 'No blob provided' });
    return;
  }

  try {
    // Decode the image into a bitmap (works in workers)
    const bitmap = await createImageBitmap(blob);

    const { width, height } = bitmap;

    // Calculate new dimensions, preserving aspect ratio
    let newWidth = width;
    let newHeight = height;

    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      if (width >= height) {
        newWidth = MAX_DIMENSION;
        newHeight = Math.round((height / width) * MAX_DIMENSION);
      } else {
        newHeight = MAX_DIMENSION;
        newWidth = Math.round((width / height) * MAX_DIMENSION);
      }
    }

    // Draw onto OffscreenCanvas at the new dimensions
    const canvas = new OffscreenCanvas(newWidth, newHeight);
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      self.postMessage({ error: 'Could not get 2D context from OffscreenCanvas' });
      bitmap.close();
      return;
    }

    ctx.drawImage(bitmap, 0, 0, newWidth, newHeight);
    bitmap.close();

    // Convert to JPEG blob
    const compressedBlob = await canvas.convertToBlob({
      type: 'image/jpeg',
      quality: JPEG_QUALITY,
    });

    self.postMessage({ blob: compressedBlob });
  } catch (err) {
    self.postMessage({ error: err instanceof Error ? err.message : String(err) });
  }
};
