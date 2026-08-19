/**
 * compress.worker.js
 * Creates 2 optimized image variants from the original:
 * - Compressed: max 1920px on longest side, JPEG 80% (for storage/display)
 * - Thumbnail: max 300px on longest side, JPEG 75% (for grid previews)
 *
 * Uses createImageBitmap + OffscreenCanvas for off-main-thread rendering.
 *
 * Input message: { blob: Blob }
 * Output message: { compressed: Blob, thumbnail: Blob }
 * Error message:  { error: string }
 */

const COMPRESSED_MAX_DIMENSION = 1920;
const COMPRESSED_JPEG_QUALITY = 0.8;

const THUMBNAIL_MAX_DIMENSION = 300;
const THUMBNAIL_JPEG_QUALITY = 0.75;

/**
 * Resize a bitmap to fit within maxDimension while preserving aspect ratio
 */
function calculateDimensions(width, height, maxDimension) {
  let newWidth = width;
  let newHeight = height;

  if (width > maxDimension || height > maxDimension) {
    if (width >= height) {
      newWidth = maxDimension;
      newHeight = Math.round((height / width) * maxDimension);
    } else {
      newHeight = maxDimension;
      newWidth = Math.round((width / height) * maxDimension);
    }
  }

  return { newWidth, newHeight };
}

/**
 * Create a JPEG blob from a bitmap at specified dimensions and quality
 */
async function createVariant(bitmap, maxDimension, quality) {
  const { width, height } = bitmap;
  const { newWidth, newHeight } = calculateDimensions(width, height, maxDimension);

  const canvas = new OffscreenCanvas(newWidth, newHeight);
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Could not get 2D context from OffscreenCanvas');
  }

  ctx.drawImage(bitmap, 0, 0, newWidth, newHeight);

  return await canvas.convertToBlob({
    type: 'image/jpeg',
    quality,
  });
}

self.onmessage = async function (event) {
  const { blob } = event.data;

  if (!blob) {
    self.postMessage({ error: 'No blob provided' });
    return;
  }

  try {
    // Decode the image once
    const bitmap = await createImageBitmap(blob);

    // Create compressed variant (1920px max, 80% quality)
    const compressed = await createVariant(
      bitmap,
      COMPRESSED_MAX_DIMENSION,
      COMPRESSED_JPEG_QUALITY
    );

    // Create thumbnail variant (300px max, 75% quality)
    const thumbnail = await createVariant(
      bitmap,
      THUMBNAIL_MAX_DIMENSION,
      THUMBNAIL_JPEG_QUALITY
    );

    bitmap.close();

    self.postMessage({ compressed, thumbnail });
  } catch (err) {
    self.postMessage({ error: err instanceof Error ? err.message : String(err) });
  }
};
