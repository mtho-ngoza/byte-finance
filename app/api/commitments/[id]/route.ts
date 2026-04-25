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
  const ref = db.collection(`users/${userId}/commitments`).doc(id);

  const doc = await ref.get();
  if (!doc.exists) {
    return NextResponse.json({ error: 'Commitment not found' }, { status: 404 });
  }

  const updateData = {
    ...body,
    updatedAt: FieldValue.serverTimestamp(),
  };

  await ref.update(updateData);

  // If linkedGoalId changed, propagate to unpaid cycle items
  if ('linkedGoalId' in body) {
    const cycleItemsRef = db.collection(`users/${userId}/cycleItems`);
    const snapshot = await cycleItemsRef
      .where('commitmentId', '==', id)
      .where('status', 'in', ['upcoming', 'due'])
      .get();

    const batch = db.batch();
    for (const itemDoc of snapshot.docs) {
      batch.update(itemDoc.ref, {
        linkedGoalId: body.linkedGoalId || null,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    if (!snapshot.empty) {
      await batch.commit();
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
  const ref = db.collection(`users/${userId}/commitments`).doc(id);

  const doc = await ref.get();
  if (!doc.exists) {
    return NextResponse.json({ error: 'Commitment not found' }, { status: 404 });
  }

  await ref.delete();
  return NextResponse.json({ success: true });
}
