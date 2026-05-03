import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

/**
 * Generate SHA-256 hash from an ArrayBuffer
 */
export async function generateImageHash(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Compress an image using canvas
 * Target: ~200KB for quick uploads
 */
export async function compressImage(
  file: File | Blob,
  maxWidth = 1200,
  quality = 0.7
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Calculate new dimensions
      let { width, height } = img;
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      // Draw to canvas
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);

      // Convert to blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to compress image'));
          }
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

/**
 * Generate a small thumbnail
 */
export async function generateThumbnail(
  file: File | Blob,
  maxSize = 150
): Promise<Blob> {
  return compressImage(file, maxSize, 0.6);
}

interface UploadResult {
  imageUrl: string;
  originalImageUrl: string;
  thumbnailUrl: string;
  imageHash: string;
}

/**
 * Upload a receipt image to Firebase Storage
 * Returns URLs for compressed, original, and thumbnail versions
 */
export async function uploadReceiptImage(
  userId: string,
  file: File | Blob
): Promise<UploadResult> {
  // Generate a unique ID for this receipt
  const receiptId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  // Get original image buffer for hashing
  const originalBuffer = await file.arrayBuffer();
  const imageHash = await generateImageHash(originalBuffer);

  // Compress and generate thumbnail
  const [compressed, thumbnail] = await Promise.all([
    compressImage(file),
    generateThumbnail(file),
  ]);

  // Upload all versions in parallel
  const basePath = `users/${userId}/receipts/${receiptId}`;

  const [compressedRef, originalRef, thumbRef] = [
    ref(storage, `${basePath}/image.jpg`),
    ref(storage, `${basePath}/original.jpg`),
    ref(storage, `${basePath}/thumb.jpg`),
  ];

  const [compressedSnap, originalSnap, thumbSnap] = await Promise.all([
    uploadBytes(compressedRef, compressed, { contentType: 'image/jpeg' }),
    uploadBytes(originalRef, file, { contentType: 'image/jpeg' }),
    uploadBytes(thumbRef, thumbnail, { contentType: 'image/jpeg' }),
  ]);

  // Get download URLs
  const [imageUrl, originalImageUrl, thumbnailUrl] = await Promise.all([
    getDownloadURL(compressedSnap.ref),
    getDownloadURL(originalSnap.ref),
    getDownloadURL(thumbSnap.ref),
  ]);

  return {
    imageUrl,
    originalImageUrl,
    thumbnailUrl,
    imageHash,
  };
}
