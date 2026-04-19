import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { findBackfillCandidates, buildBackfillContributions } from '@/lib/smart-link';
import type { Expense } from '@/types';

/**
 * GET /api/smart-link/backfill?label=...&targetId=...&targetType=...
 * Returns backfill candidates (past paid expenses with matching label, no linkedTo).
 */
export async function GET(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(request.url);
  const label = searchParams.get('label');

  if (!label) {
    return NextResponse.json({ error: 'label is required' }, { status: 400 });
  }

  const db = getAdminDb();
  // Query all paid expenses with no linkedTo for this user
  const snap = await db
    .collection(`users/${userId}/expenses`)
    .where('status', '==', 'paid')
    .get();

  const expenses = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Expense));
  const candidates = findBackfillCandidates(label, expenses);

  return NextResponse.json({ candidates });
}

/**
 * POST /api/smart-link/backfill
 * Body: { candidates: BackfillCandidate[], targetId: string, targetType: string }
 *
 * Applies backfill: creates contribution records for each candidate expense
 * and updates the target's currentAmount/currentBalance atomically.
 */
export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await request.json();
  const { candidates, targetId, targetType } = body as {
    candidates: Array<{ expenseId: string; folderId: string; amount: number; label: string; paidDate: string }>;
    targetId: string;
    targetType: 'goal' | 'investment' | 'savings_pot';
  };

  if (!candidates?.length || !targetId || !targetType) {
    return NextResponse.json(
      { error: 'candidates, targetId, and targetType are required' },
      { status: 400 },
    );
  }

  const collectionMap: Record<string, string> = {
    goal: 'goals',
    investment: 'investments',
    savings_pot: 'savings-pots',
  };
  const targetCollection = collectionMap[targetType];
  if (!targetCollection) {
    return NextResponse.json({ error: 'Unknown target type' }, { status: 400 });
  }

  const db = getAdminDb();
  const targetRef = db.doc(`users/${userId}/${targetCollection}/${targetId}`);
  const contributions = buildBackfillContributions(candidates);
  const totalAmount = contributions.reduce((sum, c) => sum + c.amount, 0);

  try {
    await db.runTransaction(async (tx) => {
      const targetSnap = await tx.get(targetRef);
      if (!targetSnap.exists) throw new Error('Target not found');

      const target = targetSnap.data() as Record<string, unknown>;
      const isDebtPayoff =
        targetType === 'goal' && (target.type as string) === 'debt_payoff';

      const updates: Record<string, unknown> = {
        updatedAt: FieldValue.serverTimestamp(),
      };

      // Add all contribution records
      for (const c of contributions) {
        updates.contributions = FieldValue.arrayUnion({
          expenseId: c.expenseId,
          folderId: c.folderId,
          amount: c.amount,
          date: c.date,
        });
      }

      if (targetType === 'savings_pot') {
        updates.currentBalance = FieldValue.increment(totalAmount);
        updates.totalContributed = FieldValue.increment(totalAmount);
        for (const c of contributions) {
          updates.transactions = FieldValue.arrayUnion({
            id: `exp_${c.expenseId}`,
            type: 'contribution',
            amount: c.amount,
            date: c.date,
            linkedExpenseId: c.expenseId,
            linkedFolderId: c.folderId,
          });
        }
      } else if (isDebtPayoff) {
        updates.currentAmount = FieldValue.increment(totalAmount);
        updates['debtTracking.currentBalance'] = FieldValue.increment(-totalAmount);
      } else {
        updates.currentAmount = FieldValue.increment(totalAmount);
      }

      // Also mark each expense as linkedTo this target
      for (const c of contributions) {
        const expRef = db.doc(`users/${userId}/expenses/${c.expenseId}`);
        tx.update(expRef, {
          linkedTo: { type: targetType, id: targetId },
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      tx.update(targetRef, updates);
    });

    return NextResponse.json({ success: true, count: candidates.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Backfill transaction failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
