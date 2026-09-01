import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

interface RouteParams {
  params: Promise<{ id: string; transactionId: string }>;
}

/**
 * PATCH /api/projects/[id]/transactions/[transactionId]
 * Edit a transaction
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id: projectId, transactionId } = await params;
  const body = await request.json();

  const db = getAdminDb();
  const projectRef = db.collection(`users/${userId}/projects`).doc(projectId);
  const projectSnap = await projectRef.get();

  if (!projectSnap.exists) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const project = projectSnap.data()!;
  const transactions: Array<{
    id: string;
    type: 'contribution' | 'payment';
    amount: number;
    description: string;
    contributorName?: string;
    date: unknown;
    receiptId?: string;
  }> = project.transactions || [];

  const txnIndex = transactions.findIndex((t) => t.id === transactionId);
  if (txnIndex === -1) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
  }

  const oldTxn = transactions[txnIndex];
  const oldImpact = oldTxn.type === 'contribution' ? oldTxn.amount : -oldTxn.amount;

  // Build updated transaction
  const updatedTxn = {
    ...oldTxn,
    ...(body.amount !== undefined && { amount: body.amount }),
    ...(body.description !== undefined && { description: body.description.trim() }),
    ...(body.contributorName !== undefined && { contributorName: body.contributorName?.trim() || null }),
    ...(body.date !== undefined && { date: new Date(body.date) }),
    ...(body.type !== undefined && { type: body.type }),
  };

  const newImpact = updatedTxn.type === 'contribution' ? updatedTxn.amount : -updatedTxn.amount;
  const amountDelta = newImpact - oldImpact;

  // Update transactions array
  transactions[txnIndex] = updatedTxn;

  await projectRef.update({
    transactions,
    currentAmount: FieldValue.increment(amountDelta),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ transaction: updatedTxn });
}

/**
 * DELETE /api/projects/[id]/transactions/[transactionId]
 * Delete a transaction
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id: projectId, transactionId } = await params;

  const db = getAdminDb();
  const projectRef = db.collection(`users/${userId}/projects`).doc(projectId);
  const projectSnap = await projectRef.get();

  if (!projectSnap.exists) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const project = projectSnap.data()!;
  const transactions: Array<{
    id: string;
    type: 'contribution' | 'payment';
    amount: number;
  }> = project.transactions || [];

  const txn = transactions.find((t) => t.id === transactionId);
  if (!txn) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
  }

  const amountDelta = txn.type === 'contribution' ? -txn.amount : txn.amount;
  const updatedTransactions = transactions.filter((t) => t.id !== transactionId);

  await projectRef.update({
    transactions: updatedTransactions,
    currentAmount: FieldValue.increment(amountDelta),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Unlink receipt if exists
  if ((txn as any).receiptId) {
    try {
      const receiptRef = db.collection(`users/${userId}/receipts`).doc((txn as any).receiptId);
      await receiptRef.update({
        projectTransactionId: FieldValue.delete(),
        projectId: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.error('Failed to unlink receipt:', e);
    }
  }

  return NextResponse.json({ success: true });
}
