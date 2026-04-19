import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id } = await params;
  const body = await request.json();

  const allowed = [
    'title', 'type', 'targetAmount', 'currentAmount', 'status', 'priority',
    'notes', 'year', 'expectedMonthlyContribution', 'linkedExpenseLabel',
    'startDate', 'targetDate', 'debtTracking', 'contributions', 'completedAt',
    'isOnTrack', 'monthsBehind',
  ];

  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  const db = getAdminDb();
  const ref = db.doc(`users/${userId}/goals/${id}`);
  const snap = await ref.get();

  if (!snap.exists) {
    return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
  }

  await ref.update(updates);
  const updated = await ref.get();
  return NextResponse.json({ id, ...updated.data() });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id } = await params;
  const db = getAdminDb();
  const ref = db.doc(`users/${userId}/goals/${id}`);
  const snap = await ref.get();

  if (!snap.exists) {
    return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
  }

  await ref.delete();
  return NextResponse.json({ success: true });
}
