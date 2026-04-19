import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function GET(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const folderId = request.nextUrl.searchParams.get('folderId');
  if (!folderId) {
    return NextResponse.json({ error: 'folderId query param is required' }, { status: 400 });
  }

  const db = getAdminDb();
  const snap = await db
    .collection(`users/${userId}/expenses`)
    .where('folderId', '==', folderId)
    .orderBy('sortOrder')
    .get();

  const expenses = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  return NextResponse.json({ expenses });
}

export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await request.json();
  const { folderId, label, amount, category, accountType, status, linkedTo, dueDate, notes, tags, sortOrder } = body;

  if (!folderId || !label || amount == null || !category || !accountType) {
    return NextResponse.json(
      { error: 'folderId, label, amount, category, and accountType are required' },
      { status: 400 }
    );
  }

  const db = getAdminDb();
  const now = FieldValue.serverTimestamp();

  const ref = db.collection(`users/${userId}/expenses`).doc();
  await ref.set({
    folderId,
    label,
    amount,
    status: status ?? 'pending',
    category,
    accountType,
    linkedTo: linkedTo ?? null,
    dueDate: dueDate ?? null,
    paidDate: null,
    notes: notes ?? null,
    tags: tags ?? [],
    sortOrder: sortOrder ?? 0,
    createdAt: now,
    updatedAt: now,
  });

  const created = await ref.get();
  return NextResponse.json({ id: ref.id, ...created.data() }, { status: 201 });
}
