import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { ParsedItem } from '@/app/api/import/parse/route';

// ---------------------------------------------------------------------------
// POST /api/import/confirm
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  let body: { items?: ParsedItem[]; cycleId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { items, cycleId } = body;

  if (!cycleId || typeof cycleId !== 'string') {
    return NextResponse.json({ error: 'cycleId is required' }, { status: 400 });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items must be a non-empty array' }, { status: 400 });
  }

  // Validate each item
  for (const item of items) {
    if (!item.label || typeof item.label !== 'string') {
      return NextResponse.json({ error: 'Each item must have a label' }, { status: 400 });
    }
    if (typeof item.amountInCents !== 'number' || item.amountInCents < 0) {
      return NextResponse.json(
        { error: `Invalid amountInCents for item "${item.label}"` },
        { status: 400 }
      );
    }
  }

  const db = getAdminDb();
  const now = FieldValue.serverTimestamp();

  // Verify the cycle exists
  const cycleRef = db.collection(`users/${userId}/cycles`).doc(cycleId);
  const cycleSnap = await cycleRef.get();
  if (!cycleSnap.exists) {
    return NextResponse.json({ error: `Cycle "${cycleId}" not found` }, { status: 404 });
  }

  // Bulk-insert cycle items using a batch write
  const batch = db.batch();

  let totalAmountAdded = 0;
  let paidAmountAdded = 0;
  let paidCountAdded = 0;

  items.forEach((item, index) => {
    const isPaid = item.status === 'paid';
    const itemRef = db.collection(`users/${userId}/cycleItems`).doc();

    batch.set(itemRef, {
      cycleId,
      commitmentId: null, // Imported items are one-offs
      label: item.label.trim(),
      amount: item.amountInCents,
      category: item.category ?? 'other',
      accountType: item.accountType ?? 'personal',
      status: isPaid ? 'paid' : 'upcoming',
      linkedGoalId: null,
      dueDate: null,
      paidDate: isPaid ? now : null,
      notes: null,
      tags: [],
      sortOrder: index,
      createdAt: now,
      updatedAt: now,
    });

    totalAmountAdded += item.amountInCents;
    if (isPaid) {
      paidAmountAdded += item.amountInCents;
      paidCountAdded += 1;
    }
  });

  // Update cycle totals atomically
  const cycleUpdate: Record<string, unknown> = {
    totalCommitted: FieldValue.increment(totalAmountAdded),
    itemCount: FieldValue.increment(items.length),
    updatedAt: now,
  };

  if (paidAmountAdded > 0) {
    cycleUpdate.totalPaid = FieldValue.increment(paidAmountAdded);
    cycleUpdate.paidCount = FieldValue.increment(paidCountAdded);
  }

  batch.update(cycleRef, cycleUpdate);

  await batch.commit();

  return NextResponse.json({ created: items.length }, { status: 201 });
}
