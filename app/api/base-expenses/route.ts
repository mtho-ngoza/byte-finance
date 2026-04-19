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
    .collection(`users/${userId}/baseExpenses`)
    .orderBy('sortOrder')
    .get();

  const baseExpenses = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  return NextResponse.json({ baseExpenses });
}

export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await request.json();
  const { label, amount, category, accountType, linkedTo, sortOrder, isActive } = body;

  if (!label || amount == null || !category || !accountType) {
    return NextResponse.json(
      { error: 'label, amount, category, and accountType are required' },
      { status: 400 }
    );
  }

  const db = getAdminDb();
  const now = FieldValue.serverTimestamp();

  const ref = db.collection(`users/${userId}/baseExpenses`).doc();
  await ref.set({
    label,
    amount,
    category,
    accountType,
    linkedTo: linkedTo ?? null,
    sortOrder: sortOrder ?? 0,
    isActive: isActive ?? true,
    createdAt: now,
    updatedAt: now,
  });

  const created = await ref.get();
  return NextResponse.json({ id: ref.id, ...created.data() }, { status: 201 });
}
