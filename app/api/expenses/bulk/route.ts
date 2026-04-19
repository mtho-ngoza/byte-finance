import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { Expense } from '@/types';

interface BulkOperation {
  type: 'update' | 'delete';
  id: string;
  data?: Partial<Expense>;
}

export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await request.json();
  const operations: BulkOperation[] = body.operations;

  if (!Array.isArray(operations) || operations.length === 0) {
    return NextResponse.json({ error: 'operations array is required' }, { status: 400 });
  }

  const db = getAdminDb();
  const batch = db.batch();
  const now = FieldValue.serverTimestamp();

  for (const op of operations) {
    const ref = db.doc(`users/${userId}/expenses/${op.id}`);
    if (op.type === 'delete') {
      batch.delete(ref);
    } else if (op.type === 'update' && op.data) {
      batch.update(ref, { ...op.data, updatedAt: now });
    }
  }

  await batch.commit();

  // Return updated docs for update operations
  const results: Record<string, unknown>[] = [];
  for (const op of operations) {
    if (op.type === 'update') {
      const snap = await db.doc(`users/${userId}/expenses/${op.id}`).get();
      if (snap.exists) results.push({ id: op.id, ...snap.data() });
    }
  }

  return NextResponse.json({ results });
}
