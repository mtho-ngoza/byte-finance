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
    .collection(`users/${userId}/goals`)
    .orderBy('year', 'desc')
    .orderBy('priority')
    .get();

  const goals = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  return NextResponse.json({ goals });
}

export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await request.json();
  const { title, type, targetAmount, currentAmount, year, priority, status, notes,
    expectedMonthlyContribution, linkedExpenseLabel, startDate, targetDate,
    debtTracking } = body;

  if (!title || !type || !year || !priority) {
    return NextResponse.json(
      { error: 'title, type, year, and priority are required' },
      { status: 400 }
    );
  }

  const db = getAdminDb();
  const now = FieldValue.serverTimestamp();

  const goalData: Record<string, unknown> = {
    title,
    type,
    targetAmount: targetAmount ?? null,
    currentAmount: currentAmount ?? 0,
    contributions: [],
    status: status ?? 'pending',
    isOnTrack: false,
    monthsBehind: 0,
    year,
    priority,
    notes: notes ?? null,
    expectedMonthlyContribution: expectedMonthlyContribution ?? null,
    linkedExpenseLabel: linkedExpenseLabel ?? null,
    startDate: startDate ?? null,
    targetDate: targetDate ?? null,
    debtTracking: debtTracking ?? null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };

  const ref = db.collection(`users/${userId}/goals`).doc();
  await ref.set(goalData);

  const created = await ref.get();
  return NextResponse.json({ id: ref.id, ...created.data() }, { status: 201 });
}
