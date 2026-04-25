import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function GET(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const db = getAdminDb();
  const snap = await db
    .collection(`users/${userId}/commitments`)
    .orderBy('sortOrder')
    .get();

  const commitments = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  return NextResponse.json({ commitments });
}

export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await request.json();
  const {
    label,
    amount,
    category,
    accountType,
    linkedGoalId,
    dueDay,
    isVariable,
    sortOrder,
  } = body;

  if (!label || amount === undefined || !category || !accountType) {
    return NextResponse.json(
      { error: 'label, amount, category, and accountType are required' },
      { status: 400 }
    );
  }

  const db = getAdminDb();
  const now = FieldValue.serverTimestamp();

  const commitmentData = {
    label,
    amount,
    category,
    accountType,
    linkedGoalId: linkedGoalId ?? null,
    dueDay: dueDay ?? null,
    isVariable: isVariable ?? false,
    sortOrder: sortOrder ?? 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  const ref = db.collection(`users/${userId}/commitments`).doc();
  await ref.set(commitmentData);

  const created = await ref.get();
  return NextResponse.json({ id: ref.id, ...created.data() }, { status: 201 });
}
