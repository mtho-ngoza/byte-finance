import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminStorage } from '@/lib/firebase-admin';
import crypto from 'crypto';

/**
 * POST /api/receipts/upload
 * Upload receipt image variants to Firebase Storage
 *
 * Accepts two formats for backward compatibility:
 * 1. New format (3 files): 'original', 'compressed', 'thumbnail'
 * 2. Legacy format (1 file): 'image' (uploads same buffer 3 times)
 */
export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const formData = await request.formData();

    // Check for new 3-file format
    const originalFile = formData.get('original') as File | null;
    const compressedFile = formData.get('compressed') as File | null;
    const thumbnailFile = formData.get('thumbnail') as File | null;

    // Check for legacy single-file format
    const legacyFile = formData.get('image') as File | null;

    let originalBuffer: Buffer;
    let compressedBuffer: Buffer;
    let thumbnailBuffer: Buffer;

    if (originalFile && compressedFile && thumbnailFile) {
      // New 3-file format
      if (!originalFile.type.startsWith('image/') ||
          !compressedFile.type.startsWith('image/') ||
          !thumbnailFile.type.startsWith('image/')) {
        return NextResponse.json({ error: 'All files must be images' }, { status: 400 });
      }

      if (originalFile.size > 10 * 1024 * 1024) {
        return NextResponse.json({ error: 'Original file too large (max 10MB)' }, { status: 400 });
      }

      originalBuffer = Buffer.from(await originalFile.arrayBuffer());
      compressedBuffer = Buffer.from(await compressedFile.arrayBuffer());
      thumbnailBuffer = Buffer.from(await thumbnailFile.arrayBuffer());
    } else if (legacyFile) {
      // Legacy single-file format - use same buffer for all 3 variants
      if (!legacyFile.type.startsWith('image/')) {
        return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
      }

      if (legacyFile.size > 10 * 1024 * 1024) {
        return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });
      }

      const buffer = Buffer.from(await legacyFile.arrayBuffer());
      originalBuffer = buffer;
      compressedBuffer = buffer;
      thumbnailBuffer = buffer;
    } else {
      return NextResponse.json(
        { error: 'No image provided. Send either "image" or "original", "compressed", "thumbnail"' },
        { status: 400 }
      );
    }

    // Generate hash from original image for duplicate detection
    const imageHash = crypto.createHash('sha256').update(originalBuffer).digest('hex');

    // Generate unique receipt ID
    const receiptId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const basePath = `users/${userId}/receipts/${receiptId}`;

    const storage = getAdminStorage();
    const bucket = storage.bucket();

    // Upload original image (full resolution)
    const originalStorageFile = bucket.file(`${basePath}/original.jpg`);
    await originalStorageFile.save(originalBuffer, {
      metadata: { contentType: 'image/jpeg' },
    });
    await originalStorageFile.makePublic();
    const originalImageUrl = `https://storage.googleapis.com/${bucket.name}/${basePath}/original.jpg`;

    // Upload compressed image (1920px max, JPEG 80%)
    const imageStorageFile = bucket.file(`${basePath}/image.jpg`);
    await imageStorageFile.save(compressedBuffer, {
      metadata: { contentType: 'image/jpeg' },
    });
    await imageStorageFile.makePublic();
    const imageUrl = `https://storage.googleapis.com/${bucket.name}/${basePath}/image.jpg`;

    // Upload thumbnail (300px max, JPEG 75%)
    const thumbStorageFile = bucket.file(`${basePath}/thumb.jpg`);
    await thumbStorageFile.save(thumbnailBuffer, {
      metadata: { contentType: 'image/jpeg' },
    });
    await thumbStorageFile.makePublic();
    const thumbnailUrl = `https://storage.googleapis.com/${bucket.name}/${basePath}/thumb.jpg`;

    return NextResponse.json({
      imageUrl,
      originalImageUrl,
      thumbnailUrl,
      imageHash,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload image' },
      { status: 500 }
    );
  }
}
