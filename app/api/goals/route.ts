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
  const {
    name,
    type,
    targetAmount,
    monthlyTarget,
    linkedCommitmentLabel,
    debtTracking,
    investmentTracking,
    allowWithdrawals,
    priority,
    notes,
  } = body;

  if (!name || !type || targetAmount === undefined || !priority) {
    return NextResponse.json(
      { error: 'name, type, targetAmount, and priority are required' },
      { status: 400 }
    );
  }

  const db = getAdminDb();
  const now = FieldValue.serverTimestamp();

  const goalData = {
    name,
    type,
    targetAmount,
    currentAmount: 0,
    monthlyTarget: monthlyTarget ?? null,
    linkedCommitmentLabel: linkedCommitmentLabel ?? null,
    debtTracking: debtTracking ?? null,
    investmentTracking: investmentTracking ?? null,
    contributions: [],
    allowWithdrawals: allowWithdrawals ?? false,
    withdrawals: [],
    status: 'active',
    isOnTrack: true,
    priority,
    notes: notes ?? null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };

  const ref = db.collection(`users/${userId}/goals`).doc();
  await ref.set(goalData);

  const created = await ref.get();
  return NextResponse.json({ id: ref.id, ...created.data() }, { status: 201 });
}
