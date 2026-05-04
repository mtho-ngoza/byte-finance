import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';

export interface ParsedTransaction {
  date: string;           // YYYY-MM-DD
  description: string;    // Cleaned merchant name
  amountInCents: number;  // Always positive integer
  type: 'debit' | 'credit';
  category: string;
  accountType: 'personal' | 'business';
}

// ---------------------------------------------------------------------------
// Rate limiter: 5 requests/minute per user
// ---------------------------------------------------------------------------

const rateLimitMap = new Map<string, number[]>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const window = 60_000;
  const max = 5;
  const timestamps = (rateLimitMap.get(userId) ?? []).filter((t) => now - t < window);
  if (timestamps.length >= max) { rateLimitMap.set(userId, timestamps); return false; }
  timestamps.push(now);
  rateLimitMap.set(userId, timestamps);
  return true;
}

// ---------------------------------------------------------------------------
// Gemini API
// ---------------------------------------------------------------------------

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

async function parseStatementWithGemini(
  fileBuffer: Buffer,
  mimeType: string
): Promise<ParsedTransaction[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

  const base64 = fileBuffer.toString('base64');

  const prompt = `You are a South African bank statement parser. Extract all transactions from this bank statement.

For each transaction return:
- date: ISO date string (YYYY-MM-DD)
- description: cleaned merchant/payee name (remove branch codes, card numbers, reference numbers, bank suffixes)
- amountInCents: positive integer (rands × 100, e.g. R450.50 = 45050)
- type: "debit" (money out) or "credit" (money in)
- category: one of: housing, transport, family, health, utilities, business, lifestyle, education, savings, other
- accountType: "business" for PAYE/accounting/business items, "personal" for everything else

Category mapping:
- housing: bond, levy, rates, electricity, rent, water
- transport: petrol, fuel, car, insurance, tracker, uber, bolt
- family: support, school, fees, maintenance
- health: medical, pharmacy, doctor, hospital, clicks, dischem
- utilities: fibre, mweb, dstv, telkom, vodacom, mtn, cell
- business: paye, accounting, tax, invoice, sage, xero
- lifestyle: grocery, checkers, woolworths, pick n pay, spar, shoprite, restaurant, dining, clothing, gym
- education: university, college, unisa, course, tuition
- savings: investment, savings, emergency, fund
- other: anything else

Skip: opening/closing balances, interest charges, bank fees summary lines.

Return ONLY a valid JSON array. No markdown, no explanation.`;

  const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: base64 } },
        ],
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    let msg = `Gemini API error (${response.status})`;
    try { msg = JSON.parse(err)?.error?.message ?? msg; } catch { /* use default */ }
    throw new Error(msg);
  }

  const data = await response.json();
  const raw: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

  let items: ParsedTransaction[];
  try { items = JSON.parse(cleaned); } catch {
    throw new Error(`Failed to parse Gemini response: ${cleaned.slice(0, 200)}`);
  }

  if (!Array.isArray(items)) throw new Error('Gemini returned unexpected format');

  return items.map((item) => ({
    date: String(item.date ?? '').slice(0, 10),
    description: String(item.description ?? '').trim(),
    amountInCents: Math.abs(Math.round(Number(item.amountInCents ?? 0))),
    type: item.type === 'credit' ? 'credit' : 'debit',
    category: String(item.category ?? 'other'),
    accountType: item.accountType === 'business' ? 'business' : 'personal',
  }));
}

// ---------------------------------------------------------------------------
// POST /api/import/statement
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  if (!checkRateLimit(userId)) {
    return NextResponse.json({ error: 'Rate limit exceeded. Maximum 5 requests per minute.' }, { status: 429 });
  }

  let formData: FormData;
  try { formData = await request.formData(); } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  // Validate type and size
  const allowedTypes = ['application/pdf', 'text/csv', 'application/vnd.ms-excel', 'text/plain'];
  const isCSV = file.name.endsWith('.csv') || file.type.includes('csv');
  const isPDF = file.name.endsWith('.pdf') || file.type === 'application/pdf';

  if (!isCSV && !isPDF) {
    return NextResponse.json({ error: 'Only PDF and CSV files are supported' }, { status: 400 });
  }

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = isPDF ? 'application/pdf' : 'text/plain';

  try {
    const transactions = await parseStatementWithGemini(buffer, mimeType);
    return NextResponse.json({ transactions });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to parse statement';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
