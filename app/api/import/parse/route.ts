import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedItem {
  label: string;
  amountInCents: number;
  status: 'paid' | 'upcoming';
  category: string;
  accountType: 'personal' | 'business';
}

// ---------------------------------------------------------------------------
// In-memory rate limiter: 10 requests/minute per user (sliding window)
// ---------------------------------------------------------------------------

interface RateLimitEntry {
  timestamps: number[];
}

const rateLimitMap = new Map<string, RateLimitEntry>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId) ?? { timestamps: [] };

  // Remove timestamps outside the sliding window
  entry.timestamps = entry.timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (entry.timestamps.length >= RATE_LIMIT_MAX) {
    rateLimitMap.set(userId, entry);
    return false; // Rate limit exceeded
  }

  entry.timestamps.push(now);
  rateLimitMap.set(userId, entry);
  return true;
}

// ---------------------------------------------------------------------------
// Gemini API call
// ---------------------------------------------------------------------------

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

async function parseWithGemini(text: string): Promise<ParsedItem[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const prompt = `You are a financial data parser. Parse the following Samsung Notes expense text and extract each expense item.

Rules:
- [v], [x], ✓, ✅ at the start of a line means the item is PAID (status: "paid")
- [ ] at the start of a line means the item is PENDING/UPCOMING (status: "upcoming")
- Lines without a checkbox marker should be treated as upcoming
- Skip header lines (like "March expenses 2026") — they are not expense items
- Amount parsing: "R9 000", "R9,000", "R9000", "9000" all equal 900000 cents (multiply rands by 100, remove spaces/commas)
- Category mapping (use lowercase):
  - "housing": bond, levies, rates, electricity, rent, mortgage
  - "transport": car, petrol, insurance, tracker, fuel, uber
  - "family": support, fees, school, maintenance, child
  - "health": medical, aid, pharmacy, doctor, dentist, hospital
  - "utilities": fibre, mweb, dstv, internet, water, telkom, vodacom, cell, phone
  - "business": paye, accounting, tax, vat, invoice, business
  - "lifestyle": grocery, groceries, entertainment, dining, restaurant, shopping, clothing, gym
  - "education": unisa, university, college, course, tuition, study
  - "savings": emergency, byte fusion, investment, savings, fund
  - "other": anything that doesn't fit above
- accountType: use "business" for PAYE, accounting, business-related items; "personal" for everything else

Return ONLY a valid JSON array with no markdown, no explanation. Each object must have:
{
  "label": "string (the expense name, cleaned up)",
  "amountInCents": number (integer, rands * 100),
  "status": "paid" | "upcoming",
  "category": "housing" | "transport" | "family" | "health" | "utilities" | "business" | "lifestyle" | "education" | "savings" | "other",
  "accountType": "personal" | "business"
}

Text to parse:
${text}`;

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2048,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let errorMessage = `Gemini API error (${response.status})`;
    try {
      const parsed = JSON.parse(errorBody);
      errorMessage = parsed?.error?.message ?? errorMessage;
    } catch {
      // use default message
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();
  const rawText: string =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  // Strip markdown code fences if present
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  let items: ParsedItem[];
  try {
    items = JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse Gemini response as JSON: ${cleaned.slice(0, 200)}`);
  }

  if (!Array.isArray(items)) {
    throw new Error('Gemini returned unexpected format — expected a JSON array');
  }

  // Validate and sanitize each item
  return items.map((item) => ({
    label: String(item.label ?? '').trim(),
    amountInCents: Math.round(Number(item.amountInCents ?? 0)),
    status: item.status === 'paid' ? 'paid' : 'upcoming',
    category: String(item.category ?? 'other'),
    accountType: item.accountType === 'business' ? 'business' : 'personal',
  }));
}

// ---------------------------------------------------------------------------
// POST /api/import/parse
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  // Rate limit check
  if (!checkRateLimit(userId)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Maximum 10 parse requests per minute.' },
      { status: 429 }
    );
  }

  let body: { text?: string; cycleId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { text, cycleId } = body;

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return NextResponse.json({ error: 'text is required and must be a non-empty string' }, { status: 400 });
  }

  if (!cycleId || typeof cycleId !== 'string') {
    return NextResponse.json({ error: 'cycleId is required' }, { status: 400 });
  }

  try {
    const items = await parseWithGemini(text);
    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error calling Gemini API';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
