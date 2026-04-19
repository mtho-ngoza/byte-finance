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
    .collection(`users/${userId}/folders`)
    .where('isArchived', '==', false)
    .orderBy('sortOrder')
    .get();

  const folders = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  return NextResponse.json({ folders });
}

export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await request.json();
  const { name, type, icon, color, period, income, sortOrder } = body;

  if (!name || !type) {
    return NextResponse.json({ error: 'name and type are required' }, { status: 400 });
  }

  const db = getAdminDb();
  const now = FieldValue.serverTimestamp();

  const folderRef = db.collection(`users/${userId}/folders`).doc();
  const folderData = {
    name,
    type,
    icon: icon ?? null,
    color: color ?? null,
    period: period ?? null,
    income: income ?? null,
    sortOrder: sortOrder ?? 0,
    isArchived: false,
    createdAt: now,
    updatedAt: now,
  };

  await folderRef.set(folderData);

  // Auto-populate monthly folders with active BaseExpenses
  if (type === 'monthly') {
    const baseExpensesSnap = await db
      .collection(`users/${userId}/baseExpenses`)
      .where('isActive', '==', true)
      .orderBy('sortOrder')
      .get();

    if (!baseExpensesSnap.empty) {
      const batch = db.batch();
      baseExpensesSnap.docs.forEach((baseDoc) => {
        const base = baseDoc.data();
        const expenseRef = db.collection(`users/${userId}/expenses`).doc();
        batch.set(expenseRef, {
          folderId: folderRef.id,
          label: base.label,
          amount: base.amount,
          status: 'pending',
          category: base.category,
          accountType: base.accountType,
          linkedTo: base.linkedTo ?? null,
          sortOrder: base.sortOrder,
          createdAt: now,
          updatedAt: now,
        });
      });
      await batch.commit();
    }
  }

  const created = await folderRef.get();
  return NextResponse.json({ id: folderRef.id, ...created.data() }, { status: 201 });
}
