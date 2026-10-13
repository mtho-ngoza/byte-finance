import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/goals/[id]/transactions
 * Returns transactions (contributions and payments) for a project goal
 * Query params:
 *   - limit: max items to return (default 50, max 100)
 *   - cursor: ISO date string to paginate after
 */
export async function GET(request: NextRequest, { params }: Params) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id: goalId } = await params;

  const { searchParams } = new URL(request.url);
  const limitParam = parseInt(searchParams.get('limit') || '50');
  const cursor = searchParams.get('cursor');

  // Clamp limit between 1 and 100
  const limit = Math.min(Math.max(limitParam, 1), 100);

  const db = getAdminDb();

  // Verify goal exists and is a project type
  const goalRef = db.collection(`users/${userId}/goals`).doc(goalId);
  const goalSnap = await goalRef.get();

  if (!goalSnap.exists) {
    return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
  }

  const goal = goalSnap.data()!;
  if (goal.type !== 'project') {
    return NextResponse.json({ error: 'Only project goals support transactions' }, { status: 400 });
  }

  // Build query
  let queryRef = db
    .collection(`users/${userId}/projectTransactions`)
    .where('goalId', '==', goalId)
    .orderBy('date', 'desc');

  // Apply cursor if provided
  if (cursor) {
    const cursorDate = new Date(cursor);
    queryRef = queryRef.startAfter(cursorDate);
  }

  // Fetch one extra to check if there are more
  const transactionsSnap = await queryRef.limit(limit + 1).get();

  let transactions = transactionsSnap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    date: doc.data().date?.toDate?.()?.toISOString() ?? doc.data().date,
  }));

  // Check if there are more items
  const hasMore = transactions.length > limit;
  if (hasMore) {
    transactions = transactions.slice(0, limit);
  }

  // Get next cursor
  const nextCursor = hasMore && transactions.length > 0
    ? transactions[transactions.length - 1].date
    : null;

  return NextResponse.json({
    transactions,
    hasMore,
    nextCursor,
  });
}

/**
 * POST /api/goals/[id]/transactions
 * Add a contribution or payment to a project goal
 *
 * Body: {
 *   type: 'contribution' | 'payment',
 *   amount: number (in cents),
 *   description: string,
 *   contributorName?: string,
 *   receiptId?: string (for payments),
 *   date?: string (ISO date, defaults to now)
 * }
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id: goalId } = await params;
  const body = await request.json();
  const { type, amount, description, contributorName, receiptId, date } = body;

  // Validation
  if (!type || !['contribution', 'payment'].includes(type)) {
    return NextResponse.json({ error: 'type must be "contribution" or "payment"' }, { status: 400 });
  }
  if (!amount || typeof amount !== 'number' || amount <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
  }
  if (!description || typeof description !== 'string' || !description.trim()) {
    return NextResponse.json({ error: 'description is required' }, { status: 400 });
  }

  const db = getAdminDb();

  // Verify goal exists and is a project type
  const goalRef = db.collection(`users/${userId}/goals`).doc(goalId);
  const goalSnap = await goalRef.get();

  if (!goalSnap.exists) {
    return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
  }

  const goal = goalSnap.data()!;
  if (goal.type !== 'project') {
    return NextResponse.json({ error: 'Only project goals support transactions' }, { status: 400 });
  }

  const now = FieldValue.serverTimestamp();
  const transactionDate = date ? new Date(date) : new Date();

  // Create transaction
  const transactionRef = db.collection(`users/${userId}/projectTransactions`).doc();
  const transaction = {
    goalId,
    type,
    amount,
    description: description.trim(),
    ...(contributorName ? { contributorName: contributorName.trim() } : {}),
    ...(receiptId ? { receiptId } : {}),
    date: transactionDate,
    createdAt: now,
    updatedAt: now,
  };

  await transactionRef.set(transaction);

  // Link receipt to this transaction if provided (for payments)
  if (receiptId && type === 'payment') {
    const receiptRef = db.collection(`users/${userId}/receipts`).doc(receiptId);
    const receiptSnap = await receiptRef.get();

    if (receiptSnap.exists) {
      const receipt = receiptSnap.data()!;
      // Only link if not already linked to something else
      if (!receipt.cycleItemId) {
        await receiptRef.update({
          // Store transaction reference for project payments
          projectTransactionId: transactionRef.id,
          projectGoalId: goalId,
          updatedAt: now,
        });
      }
    }
  }

  // Update goal's currentAmount
  // Contributions add to the pool, payments subtract
  const amountDelta = type === 'contribution' ? amount : -amount;

  await goalRef.update({
    currentAmount: FieldValue.increment(amountDelta),
    updatedAt: now,
  });

  return NextResponse.json({
    id: transactionRef.id,
    ...transaction,
  });
}
