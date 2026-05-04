import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { sageApiFetch, scoreMatch } from '@/lib/sage';

/**
 * GET /api/sage/receipts/[receiptId]/match
 *
 * Fetches Sage bank transactions within ±48 hours of the receipt's capturedAt,
 * filters to those within ±5% of the receipt amount, and returns them sorted
 * by match score (best first).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ receiptId: string }> }
) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { receiptId } = await params;

  // Fetch receipt from Firestore
  const db = getAdminDb();
  const receiptDoc = await db.doc(`users/${userId}/receipts/${receiptId}`).get();

  if (!receiptDoc.exists) {
    return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
  }

  const receipt = receiptDoc.data()!;

  if (!receipt.amountInCents || !receipt.capturedAt) {
    return NextResponse.json(
      { error: 'Receipt must have an amount and capturedAt to find matches' },
      { status: 422 }
    );
  }

  const receiptDate: Date =
    typeof receipt.capturedAt.toDate === 'function'
      ? receipt.capturedAt.toDate()
      : new Date(receipt.capturedAt);

  const receiptAmountInCents: number = receipt.amountInCents;
  const receiptAmountZAR = receiptAmountInCents / 100;

  // Build ±48hr date window
  const windowMs = 48 * 60 * 60 * 1000;
  const fromDate = new Date(receiptDate.getTime() - windowMs);
  const toDate = new Date(receiptDate.getTime() + windowMs);

  // Fetch Sage bank transactions in the date window
  const queryParams = new URLSearchParams({
    from_date: fromDate.toISOString().split('T')[0],
    to_date: toDate.toISOString().split('T')[0],
    items_per_page: '200',
  });

  const sageRes = await sageApiFetch(
    userId,
    `/bank_transactions?${queryParams.toString()}`
  );

  if (!sageRes.ok) {
    const text = await sageRes.text();
    console.error('Sage bank_transactions error:', sageRes.status, text);
    return NextResponse.json(
      { error: 'Failed to fetch Sage transactions' },
      { status: 502 }
    );
  }

  const sageData = await sageRes.json();
  const transactions: Array<{
    id: string;
    date: string;
    description: string;
    total_amount: number;
    reference?: string;
    transaction_type?: { id: string; name: string };
  }> = sageData.$items ?? sageData.items ?? sageData ?? [];

  // Filter by ±5% amount variance
  const amountVariance = 0.05;
  const minAmount = receiptAmountZAR * (1 - amountVariance);
  const maxAmount = receiptAmountZAR * (1 + amountVariance);

  const candidates = transactions
    .filter((tx) => {
      const txAmt = Math.abs(tx.total_amount); // Sage may return negative for debits
      return txAmt >= minAmount && txAmt <= maxAmount;
    })
    .map((tx) => ({
      ...tx,
      total_amount: Math.abs(tx.total_amount),
      score: scoreMatch(receiptAmountInCents, receiptDate, Math.abs(tx.total_amount), tx.date),
    }))
    .sort((a, b) => a.score - b.score); // Lower score = better match

  return NextResponse.json({ matches: candidates });
}
