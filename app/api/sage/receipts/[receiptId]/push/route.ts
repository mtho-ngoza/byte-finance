import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb, getAdminStorage } from '@/lib/firebase-admin';
import { sageApiFetch } from '@/lib/sage';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/sage/receipts/[receiptId]/push
 * Body: { transactionId: string }
 *
 * Downloads the receipt image from Firebase Storage and uploads it as an
 * attachment to the specified Sage bank transaction. Updates the receipt
 * document with sageTransactionId, sagePushedAt, and sageMatchStatus.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ receiptId: string }> }
) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { receiptId } = await params;

  const body = await request.json();
  const { transactionId } = body;

  if (!transactionId) {
    return NextResponse.json({ error: 'transactionId is required' }, { status: 400 });
  }

  // Fetch receipt from Firestore
  const db = getAdminDb();
  const receiptRef = db.doc(`users/${userId}/receipts/${receiptId}`);
  const receiptDoc = await receiptRef.get();

  if (!receiptDoc.exists) {
    return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
  }

  const receipt = receiptDoc.data()!;

  // Determine which image URL to use (prefer compressed, fall back to original)
  const imageUrl: string | undefined = receipt.imageUrl || receipt.originalImageUrl;
  if (!imageUrl) {
    return NextResponse.json({ error: 'Receipt has no image' }, { status: 422 });
  }

  // Download the image from Firebase Storage
  let imageBuffer: Buffer;
  let contentType = 'image/jpeg';

  try {
    const bucket = getAdminStorage().bucket();

    // Extract storage path from the URL
    // URL format: https://storage.googleapis.com/{bucket}/users/{userId}/receipts/{id}/image.jpg
    //         or: https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{encoded-path}?...
    let storagePath: string | null = null;

    const gsMatch = imageUrl.match(/storage\.googleapis\.com\/[^/]+\/(.+)/);
    if (gsMatch) {
      storagePath = decodeURIComponent(gsMatch[1]);
    } else {
      const fbMatch = imageUrl.match(/\/o\/([^?]+)/);
      if (fbMatch) {
        storagePath = decodeURIComponent(fbMatch[1]);
      }
    }

    if (!storagePath) {
      throw new Error(`Cannot parse storage path from URL: ${imageUrl}`);
    }

    const [fileBuffer] = await bucket.file(storagePath).download();
    imageBuffer = fileBuffer;

    // Infer content type from path
    if (storagePath.endsWith('.png')) contentType = 'image/png';
    else if (storagePath.endsWith('.webp')) contentType = 'image/webp';
    else if (storagePath.endsWith('.pdf')) contentType = 'application/pdf';
  } catch (err) {
    console.error('Failed to download receipt image:', err);
    return NextResponse.json(
      { error: 'Failed to download receipt image from storage' },
      { status: 500 }
    );
  }

  // Upload attachment to Sage transaction
  // Sage API: POST /bank_transactions/{id}/attachments
  // Uses multipart/form-data
  const filename = `receipt-${receiptId}.${contentType.split('/')[1]}`;

  const formData = new FormData();
  formData.append(
    'file',
    new Blob([imageBuffer], { type: contentType }),
    filename
  );

  const sageRes = await sageApiFetch(
    userId,
    `/bank_transactions/${transactionId}/attachments`,
    {
      method: 'POST',
      // Don't set Content-Type — let fetch set it with the boundary for multipart
      headers: {},
      body: formData,
    }
  );

  if (!sageRes.ok) {
    const text = await sageRes.text();
    console.error('Sage attachment upload failed:', sageRes.status, text);
    return NextResponse.json(
      { error: `Failed to upload attachment to Sage: ${sageRes.status}` },
      { status: 502 }
    );
  }

  // Update receipt in Firestore
  await receiptRef.update({
    sageTransactionId: transactionId,
    sagePushedAt: FieldValue.serverTimestamp(),
    sageMatchStatus: 'pushed',
    updatedAt: FieldValue.serverTimestamp(),
  });

  const updated = await receiptRef.get();
  const data = updated.data()!;

  return NextResponse.json({
    id: updated.id,
    sageTransactionId: data.sageTransactionId,
    sagePushedAt: data.sagePushedAt?.toDate?.()?.toISOString() ?? null,
    sageMatchStatus: data.sageMatchStatus,
  });
}
