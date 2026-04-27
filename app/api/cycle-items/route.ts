import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function GET(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(request.url);
  const cycleId = searchParams.get('cycleId');

  if (!cycleId) {
    return NextResponse.json({ error: 'cycleId is required' }, { status: 400 });
  }

  const db = getAdminDb();
  const snap = await db
    .collection(`users/${userId}/cycleItems`)
    .where('cycleId', '==', cycleId)
    .orderBy('sortOrder')
    .get();

  const items = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await request.json();
  const {
    cycleId,
    label,
    amount,
    category,
    accountType,
    linkedGoalId,
    dueDate,
    paidDate,
    notes,
    sortOrder,
    status,
  } = body;

  if (!cycleId || !label || amount === undefined || !category || !accountType) {
    return NextResponse.json(
      { error: 'cycleId, label, amount, category, and accountType are required' },
      { status: 400 }
    );
  }

  const db = getAdminDb();
  const now = FieldValue.serverTimestamp();

  const isPaid = status === 'paid';
  const providedPaidDate = paidDate ? new Date(paidDate) : null;

  const itemData = {
    cycleId,
    commitmentId: null, // One-off item
    label,
    amount,
    category,
    accountType,
    status: status ?? 'upcoming',
    linkedGoalId: linkedGoalId ?? null,
    dueDate: dueDate ?? null,
    paidDate: isPaid ? (providedPaidDate ?? now) : null,
    notes: notes ?? null,
    tags: [],
    sortOrder: sortOrder ?? 0,
    createdAt: now,
    updatedAt: now,
  };

  const ref = db.collection(`users/${userId}/cycleItems`).doc();
  await ref.set(itemData);

  // Update cycle totals
  const cycleRef = db.collection(`users/${userId}/cycles`).doc(cycleId);
  const cycleUpdate: Record<string, unknown> = {
    totalCommitted: FieldValue.increment(amount),
    itemCount: FieldValue.increment(1),
    updatedAt: now,
  };

  if (isPaid) {
    cycleUpdate.totalPaid = FieldValue.increment(amount);
    cycleUpdate.paidCount = FieldValue.increment(1);
  }

  await cycleRef.update(cycleUpdate);

  // Record goal contribution if paid with linkedGoalId
  if (isPaid && linkedGoalId) {
    const contributionDate = providedPaidDate ?? new Date();
    const goalRef = db.collection(`users/${userId}/goals`).doc(linkedGoalId);
    await goalRef.update({
      currentAmount: FieldValue.increment(amount),
      contributions: FieldValue.arrayUnion({
        id: `${ref.id}-${Date.now()}`,
        date: contributionDate,
        amount: amount,
        cycleId: cycleId,
        cycleItemId: ref.id,
      }),
      updatedAt: now,
    });
  }

  const created = await ref.get();
  return NextResponse.json({ id: ref.id, ...created.data() }, { status: 201 });
}
