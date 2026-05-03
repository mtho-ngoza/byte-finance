import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminStorage } from '@/lib/firebase-admin';
import crypto from 'crypto';

/**
 * POST /api/receipts/upload
 * Upload receipt image to Firebase Storage
 * Accepts multipart/form-data with 'image' file
 */
export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const formData = await request.formData();
    const file = formData.get('image') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Generate hash for duplicate detection
    const imageHash = crypto.createHash('sha256').update(buffer).digest('hex');

    // Generate unique receipt ID
    const receiptId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const basePath = `users/${userId}/receipts/${receiptId}`;

    const storage = getAdminStorage();
    const bucket = storage.bucket();

    // Upload original image
    const originalFile = bucket.file(`${basePath}/original.jpg`);
    await originalFile.save(buffer, {
      metadata: { contentType: 'image/jpeg' },
    });
    await originalFile.makePublic();
    const originalImageUrl = `https://storage.googleapis.com/${bucket.name}/${basePath}/original.jpg`;

    // For compressed and thumbnail, we'll use the same image for now
    // (proper compression should be done client-side before upload for performance)
    const imageFile = bucket.file(`${basePath}/image.jpg`);
    await imageFile.save(buffer, {
      metadata: { contentType: 'image/jpeg' },
    });
    await imageFile.makePublic();
    const imageUrl = `https://storage.googleapis.com/${bucket.name}/${basePath}/image.jpg`;

    // Create a simple thumbnail (using same image for MVP)
    const thumbFile = bucket.file(`${basePath}/thumb.jpg`);
    await thumbFile.save(buffer, {
      metadata: { contentType: 'image/jpeg' },
    });
    await thumbFile.makePublic();
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
