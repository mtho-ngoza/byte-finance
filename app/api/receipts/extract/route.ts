import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb, getAdminStorage } from '@/lib/firebase-admin';

/**
 * POST /api/receipts/extract
 * Body: { receiptId: string }
 *
 * Downloads the receipt image from Storage, sends it to Gemini Vision,
 * and returns extracted: { amountInCents, vendor, date, vatNumber, confidence }
 * Does NOT update the receipt — caller decides whether to apply.
 */
export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 503 });
  }

  const body = await request.json();
  const { receiptId } = body;
  if (!receiptId) return NextResponse.json({ error: 'receiptId is required' }, { status: 400 });

  // Fetch receipt doc
  const db = getAdminDb();
  const receiptDoc = await db.doc(`users/${userId}/receipts/${receiptId}`).get();
  if (!receiptDoc.exists) return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });

  const receipt = receiptDoc.data()!;
  const imageUrl: string = receipt.originalImageUrl || receipt.imageUrl;
  if (!imageUrl) return NextResponse.json({ error: 'Receipt has no image' }, { status: 422 });

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
    console.error('Failed to download receipt image:', err);
    return NextResponse.json({ error: 'Failed to download image' }, { status: 500 });
  }

  // Call Gemini Vision
  const prompt = `You are a South African receipt parser. Extract information from this receipt image.

Return ONLY valid JSON with these fields:
{
  "vendor": "string (merchant/store name, cleaned up)",
  "amountInCents": number (total amount paid in ZAR cents, e.g. R450.50 = 45050),
  "date": "YYYY-MM-DD (date on receipt, or null if not visible)",
  "vatNumber": "string (VAT registration number if visible, or null)",
  "vatAmountInCents": number (VAT amount in cents if shown separately, or null),
  "confidence": "high|medium|low (how confident you are in the extraction)"
}

Rules:
- amountInCents: use the TOTAL amount paid (bottom of receipt), multiply rands by 100
- vendor: clean merchant name, remove branch codes and suffixes
- If a field is not visible or unclear, use null
- Return ONLY the JSON object, no explanation`;

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
        generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
      }),
    }
  );

  if (!geminiRes.ok) {
    const err = await geminiRes.text();
    return NextResponse.json({ error: `Gemini error: ${geminiRes.status}` }, { status: 502 });
  }

  const geminiData = await geminiRes.json();
  const raw: string = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

  let extracted: Record<string, unknown>;
  try {
    extracted = JSON.parse(cleaned);
  } catch {
    return NextResponse.json({ error: 'Failed to parse AI response', raw: cleaned.slice(0, 200) }, { status: 502 });
  }

  return NextResponse.json({
    vendor: extracted.vendor ?? null,
    amountInCents: extracted.amountInCents ?? null,
    date: extracted.date ?? null,
    vatNumber: extracted.vatNumber ?? null,
    vatAmountInCents: extracted.vatAmountInCents ?? null,
    confidence: extracted.confidence ?? 'low',
  });
}
