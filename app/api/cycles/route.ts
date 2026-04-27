import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

export async function GET(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const db = getAdminDb();
  const snap = await db
    .collection(`users/${userId}/cycles`)
    .orderBy('startDate', 'desc')
    .limit(12)
    .get();

  const cycles = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  return NextResponse.json({ cycles });
}

export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await request.json();
  const { id, startDate, endDate, income, status, skipSpawn } = body;

  if (!id || !startDate || !endDate) {
    return NextResponse.json(
      { error: 'id, startDate, and endDate are required' },
      { status: 400 }
    );
  }

  const db = getAdminDb();
  const now = FieldValue.serverTimestamp();

  // Get active commitments to spawn items (unless skipSpawn is true)
  let commitments: Array<Record<string, unknown>> = [];
  if (!skipSpawn) {
    const commitmentsSnap = await db
      .collection(`users/${userId}/commitments`)
      .where('isActive', '==', true)
      .orderBy('sortOrder')
      .get();

    commitments = commitmentsSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));
  }

  // Calculate totals
  const totalCommitted = commitments.reduce(
    (sum, c) => sum + ((c as { amount?: number }).amount ?? 0),
    0
  );

  // Create cycle
  const cycleRef = db.collection(`users/${userId}/cycles`).doc(id);
  const cycleData = {
    startDate: Timestamp.fromDate(new Date(startDate)),
    endDate: Timestamp.fromDate(new Date(endDate)),
    income: income ?? null,
    totalCommitted,
    totalPaid: 0,
    itemCount: commitments.length,
    paidCount: 0,
    status: status ?? 'active',
    createdAt: now,
    updatedAt: now,
  };

  await cycleRef.set(cycleData);

  // Spawn cycle items from commitments (unless skipSpawn)
  if (commitments.length > 0) {
    const batch = db.batch();
    commitments.forEach((commitment, index) => {
      const c = commitment as {
        id: string;
        label: string;
        amount: number;
        category: string;
        accountType: string;
        linkedGoalId?: string;
        dueDay?: number;
      };

      const itemRef = db.collection(`users/${userId}/cycleItems`).doc();
      batch.set(itemRef, {
        cycleId: id,
        commitmentId: c.id,
        label: c.label,
        amount: c.amount,
        category: c.category,
        accountType: c.accountType,
        status: 'upcoming',
        linkedGoalId: c.linkedGoalId ?? null,
        dueDate: c.dueDay
          ? Timestamp.fromDate(
              new Date(new Date(startDate).getFullYear(), new Date(startDate).getMonth(), c.dueDay)
            )
          : null,
        sortOrder: index,
        createdAt: now,
        updatedAt: now,
      });
    });

    await batch.commit();
  }

  const created = await cycleRef.get();
  return NextResponse.json({ id, ...created.data() }, { status: 201 });
}
