import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id } = await params;
  const body = await request.json();

  const db = getAdminDb();
  const ref = db.collection(`users/${userId}/cycleItems`).doc(id);

  const doc = await ref.get();
  if (!doc.exists) {
    return NextResponse.json({ error: 'CycleItem not found' }, { status: 404 });
  }

  const currentData = doc.data()!;
  const previousStatus = currentData.status;
  const newStatus = body.status;
  const now = FieldValue.serverTimestamp();

  // Build update data
  const updateData: Record<string, unknown> = {
    ...body,
    updatedAt: now,
  };

  // Set paidDate when marking as paid
  if (newStatus === 'paid' && previousStatus !== 'paid') {
    updateData.paidDate = now;
  } else if (previousStatus === 'paid' && newStatus !== 'paid') {
    updateData.paidDate = null;
  }

  await ref.update(updateData);

  // Update cycle totals when status changes to/from paid
  const cycleRef = db.collection(`users/${userId}/cycles`).doc(currentData.cycleId);

  if (newStatus === 'paid' && previousStatus !== 'paid') {
    await cycleRef.update({
      totalPaid: FieldValue.increment(currentData.amount),
      paidCount: FieldValue.increment(1),
      updatedAt: now,
    });

    // Smart linking: contribute to goal
    if (currentData.linkedGoalId) {
      const goalRef = db.collection(`users/${userId}/goals`).doc(currentData.linkedGoalId);
      await goalRef.update({
        currentAmount: FieldValue.increment(currentData.amount),
        contributions: FieldValue.arrayUnion({
          id: `${id}-${Date.now()}`,
          date: new Date(),
          amount: currentData.amount,
          cycleId: currentData.cycleId,
          cycleItemId: id,
        }),
        updatedAt: now,
      });
    }
  } else if (previousStatus === 'paid' && newStatus !== 'paid') {
    await cycleRef.update({
      totalPaid: FieldValue.increment(-currentData.amount),
      paidCount: FieldValue.increment(-1),
      updatedAt: now,
    });

    // Reverse goal contribution
    if (currentData.linkedGoalId) {
      const goalRef = db.collection(`users/${userId}/goals`).doc(currentData.linkedGoalId);
      await goalRef.update({
        currentAmount: FieldValue.increment(-currentData.amount),
        updatedAt: now,
      });
    }
  }

  const updated = await ref.get();
  return NextResponse.json({ id, ...updated.data() });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id } = await params;

  const db = getAdminDb();
  const ref = db.collection(`users/${userId}/cycleItems`).doc(id);

  const doc = await ref.get();
  if (!doc.exists) {
    return NextResponse.json({ error: 'CycleItem not found' }, { status: 404 });
  }

  const data = doc.data()!;
  const now = FieldValue.serverTimestamp();

  // Update cycle totals
  const cycleRef = db.collection(`users/${userId}/cycles`).doc(data.cycleId);
  const updates: Record<string, unknown> = {
    totalCommitted: FieldValue.increment(-data.amount),
    itemCount: FieldValue.increment(-1),
    updatedAt: now,
  };

  if (data.status === 'paid') {
    updates.totalPaid = FieldValue.increment(-data.amount);
    updates.paidCount = FieldValue.increment(-1);
  }

  await cycleRef.update(updates);
  await ref.delete();

  return NextResponse.json({ success: true });
}
