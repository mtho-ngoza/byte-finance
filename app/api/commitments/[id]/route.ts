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

  // Propagate changes to cycle items if relevant fields changed
  if ('linkedGoalId' in body || 'isVariable' in body) {
    const cycleItemsRef = db.collection(`users/${userId}/cycleItems`);
    // For isVariable, propagate to all non-paid items (upcoming, due, partial)
    // For linkedGoalId, only propagate to unpaid items (upcoming, due)
    const statuses = 'isVariable' in body
      ? ['upcoming', 'due', 'partial']
      : ['upcoming', 'due'];

    const snapshot = await cycleItemsRef
      .where('commitmentId', '==', id)
      .where('status', 'in', statuses)
      .get();

    const batch = db.batch();
    for (const itemDoc of snapshot.docs) {
      const updates: Record<string, unknown> = {
        updatedAt: FieldValue.serverTimestamp(),
      };
      if ('linkedGoalId' in body) {
        updates.linkedGoalId = body.linkedGoalId || null;
      }
      if ('isVariable' in body) {
        updates.isVariable = body.isVariable ?? false;
      }
      batch.update(itemDoc.ref, updates);
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
