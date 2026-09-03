import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb, getAdminStorage } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/receipts/sync-extract
 *
 * Finds receipts that needsAttention (missing vendor/amount) and
 * attempts to extract data using Gemini Vision.
 */
export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 503 });
  }

  const db = getAdminDb();

  // Find receipts needing attention
  const receiptsSnap = await db
    .collection(`users/${userId}/receipts`)
    .where('needsAttention', '==', true)
    .limit(20) // Process in batches to avoid timeouts
    .get();

  const results: Array<{
    receiptId: string;
    success: boolean;
    vendor?: string;
    amountInCents?: number;
    error?: string;
  }> = [];

  for (const doc of receiptsSnap.docs) {
    const receipt = doc.data();
    const receiptId = doc.id;

    // Skip if already has both vendor and amount
    if (receipt.vendor && receipt.amountInCents) {
      await doc.ref.update({ needsAttention: false, updatedAt: FieldValue.serverTimestamp() });
      results.push({ receiptId, success: true, vendor: receipt.vendor, amountInCents: receipt.amountInCents });
      continue;
    }

    const imageUrl: string = receipt.originalImageUrl || receipt.imageUrl;
    if (!imageUrl) {
      results.push({ receiptId, success: false, error: 'No image URL' });
      continue;
    }

    // Download image from Storage
    let imageBase64: string;
    let mimeType = 'image/jpeg';
    try {
      const bucket = getAdminStorage().bucket();
      const match = imageUrl.match(/storage\.googleapis\.com\/[^/]+\/(.+)/);
      if (!match) throw new Error('Cannot parse storage path');
      const storagePath = decodeURIComponent(match[1]);
      const [buffer] = await bucket.file(storagePath).download();
      imageBase64 = buffer.toString('base64');
      if (storagePath.endsWith('.png')) mimeType = 'image/png';
    } catch (err) {
      results.push({ receiptId, success: false, error: 'Failed to download image' });
      continue;
    }

    // Call Gemini Vision
    const prompt = `You are a South African receipt parser. Extract information from this receipt image.

Return ONLY valid JSON with these fields:
{
  "vendor": "string (merchant/store name, cleaned up)",
  "amountInCents": number (total amount paid in ZAR cents, e.g. R450.50 = 45050),
  "confidence": "high|medium|low"
}

Rules:
- amountInCents: use the TOTAL amount paid, multiply rands by 100
- vendor: clean merchant name, remove branch codes
- Return ONLY the JSON object`;

    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: prompt },
                { inlineData: { mimeType, data: imageBase64 } },
              ],
            }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 256 },
          }),
        }
      );

      if (!geminiRes.ok) {
        results.push({ receiptId, success: false, error: `Gemini error: ${geminiRes.status}` });
        continue;
      }

      const geminiData = await geminiRes.json();
      const raw: string = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

      const extracted = JSON.parse(cleaned);

      // Update receipt with extracted data
      const updateData: Record<string, unknown> = {
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (extracted.vendor && !receipt.vendor) {
        updateData.vendor = extracted.vendor;
      }
      if (extracted.amountInCents && !receipt.amountInCents) {
        updateData.amountInCents = extracted.amountInCents;
      }

      // Check if we now have both fields
      const hasVendor = receipt.vendor || updateData.vendor;
      const hasAmount = receipt.amountInCents || updateData.amountInCents;
      updateData.needsAttention = !(hasVendor && hasAmount);

      await doc.ref.update(updateData);

      results.push({
        receiptId,
        success: true,
        vendor: (updateData.vendor as string) || receipt.vendor,
        amountInCents: (updateData.amountInCents as number) || receipt.amountInCents,
      });
    } catch (err) {
      results.push({ receiptId, success: false, error: 'Extraction failed' });
    }
  }

  const successCount = results.filter(r => r.success).length;
  const remainingSnap = await db
    .collection(`users/${userId}/receipts`)
    .where('needsAttention', '==', true)
    .count()
    .get();

  return NextResponse.json({
    processed: results.length,
    successCount,
    remaining: remainingSnap.data().count,
    results,
  });
}
