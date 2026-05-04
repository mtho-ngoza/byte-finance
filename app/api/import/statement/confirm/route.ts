import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { ParsedTransaction } from '@/app/api/import/statement/route';

export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  let body: { transactions?: ParsedTransaction[]; cycleId?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { transactions, cycleId } = body;

  if (!cycleId) return NextResponse.json({ error: 'cycleId is required' }, { status: 400 });
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return NextResponse.json({ error: 'transactions must be a non-empty array' }, { status: 400 });
  }

  const db = getAdminDb();
  const now = FieldValue.serverTimestamp();

  const cycleRef = db.collection(`users/${userId}/cycles`).doc(cycleId);
  const cycleSnap = await cycleRef.get();
  if (!cycleSnap.exists) {
    return NextResponse.json({ error: `Cycle "${cycleId}" not found` }, { status: 404 });
  }

  const batch = db.batch();
  let totalAdded = 0;
  let paidAdded = 0;
  let paidCountAdded = 0;

  transactions.forEach((tx, index) => {
    const isPaid = tx.type === 'debit'; // debits = money spent = paid
    const itemRef = db.collection(`users/${userId}/cycleItems`).doc();

    batch.set(itemRef, {
      cycleId,
      commitmentId: null,
      label: tx.description,
      amount: tx.amountInCents,
      category: tx.category ?? 'other',
      accountType: tx.accountType ?? 'personal',
      status: isPaid ? 'paid' : 'upcoming',
      linkedGoalId: null,
      dueDate: tx.date ? new Date(tx.date) : null,
      paidDate: isPaid ? now : null,
      notes: `Imported from bank statement (${tx.date})`,
      tags: ['bank-import'],
      sortOrder: index,
      createdAt: now,
      updatedAt: now,
    });

    totalAdded += tx.amountInCents;
    if (isPaid) { paidAdded += tx.amountInCents; paidCountAdded++; }
  });

  const cycleUpdate: Record<string, unknown> = {
    totalCommitted: FieldValue.increment(totalAdded),
    itemCount: FieldValue.increment(transactions.length),
    updatedAt: now,
  };
  if (paidAdded > 0) {
    cycleUpdate.totalPaid = FieldValue.increment(paidAdded);
    cycleUpdate.paidCount = FieldValue.increment(paidCountAdded);
  }
  batch.update(cycleRef, cycleUpdate);

  await batch.commit();
  return NextResponse.json({ created: transactions.length }, { status: 201 });
}
