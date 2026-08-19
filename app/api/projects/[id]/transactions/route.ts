import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * GET /api/projects/[id]/transactions
 * Get all transactions for a project
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id: projectId } = await params;
  const db = getAdminDb();
  const projectRef = db.collection(`users/${userId}/projects`).doc(projectId);
  const projectSnap = await projectRef.get();

  if (!projectSnap.exists) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const project = projectSnap.data()!;
  const transactions = project.transactions || [];

  return NextResponse.json({ transactions });
}

/**
 * POST /api/projects/[id]/transactions
 * Add a contribution or payment to a project
 * Body: { type, amount, description, contributorName?, receiptId?, date? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id: projectId } = await params;
  const body = await request.json();

  // Validate request
  if (!['contribution', 'payment'].includes(body.type)) {
    return NextResponse.json({ error: 'Invalid transaction type' }, { status: 400 });
  }

  if (!body.amount || typeof body.amount !== 'number' || body.amount <= 0) {
    return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 });
  }

  if (!body.description?.trim()) {
    return NextResponse.json({ error: 'Description is required' }, { status: 400 });
  }

  const db = getAdminDb();
  const projectRef = db.collection(`users/${userId}/projects`).doc(projectId);
  const projectSnap = await projectRef.get();

  if (!projectSnap.exists) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const now = FieldValue.serverTimestamp();
  const transactionDate = body.date ? new Date(body.date) : new Date();
  const transactionId = `txn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const transaction = {
    id: transactionId,
    type: body.type,
    amount: body.amount,
    description: body.description.trim(),
    contributorName: body.contributorName?.trim() || null,
    receiptId: body.receiptId || null,
    date: transactionDate,
  };

  // Update project: add transaction and update currentAmount
  const amountDelta = body.type === 'contribution' ? body.amount : -body.amount;

  await projectRef.update({
    transactions: FieldValue.arrayUnion(transaction),
    currentAmount: FieldValue.increment(amountDelta),
    updatedAt: now,
  });

  // Link receipt if provided
  if (body.receiptId && body.type === 'payment') {
    try {
      const receiptRef = db.collection(`users/${userId}/receipts`).doc(body.receiptId);
      await receiptRef.update({
        projectTransactionId: transactionId,
        projectId: projectId,
        updatedAt: now,
      });
    } catch (receiptError) {
      console.error('Failed to link receipt:', receiptError);
      // Don't fail the transaction if receipt linking fails
    }
  }

  return NextResponse.json({ transaction }, { status: 201 });
}
