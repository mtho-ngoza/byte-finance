import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  buildContributionPayload,
  computeAmountAfterContribution,
  computeAmountAfterReversal,
} from '@/lib/smart-link';

/**
 * POST /api/smart-link/contribute
 * Body: { expenseId, action: 'record' | 'reverse' }
 *
 * Atomically records or reverses a contribution on the linked target.
 */
export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await request.json();
  const { expenseId, action } = body as { expenseId: string; action: 'record' | 'reverse' };

  if (!expenseId || !action) {
    return NextResponse.json({ error: 'expenseId and action are required' }, { status: 400 });
  }

  const db = getAdminDb();
  const expenseRef = db.doc(`users/${userId}/expenses/${expenseId}`);
  const expenseSnap = await expenseRef.get();

  if (!expenseSnap.exists) {
    return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
  }

  const expense = expenseSnap.data() as {
    id: string;
    folderId: string;
    amount: number;
    label: string;
    linkedTo?: { type: 'goal' | 'investment' | 'savings_pot'; id: string };
  };
  expense.id = expenseId;

  if (!expense.linkedTo) {
    return NextResponse.json({ error: 'Expense has no linked target' }, { status: 400 });
  }

  const { type: targetType, id: targetId } = expense.linkedTo;

  // Resolve target collection
  const collectionMap: Record<string, string> = {
    goal: 'goals',
    investment: 'investments',
    savings_pot: 'savings-pots',
  };
  const targetCollection = collectionMap[targetType];
  if (!targetCollection) {
    return NextResponse.json({ error: 'Unknown target type' }, { status: 400 });
  }

  const targetRef = db.doc(`users/${userId}/${targetCollection}/${targetId}`);

  try {
    await db.runTransaction(async (tx) => {
      const targetSnap = await tx.get(targetRef);
      if (!targetSnap.exists) throw new Error('Target not found');

      const target = targetSnap.data() as Record<string, unknown>;
      const currentAmount = (target.currentAmount as number) ?? 0;
      const currentBalance = (target.currentBalance as number) ??
        (target.debtTracking as Record<string, number> | undefined)?.currentBalance;
      const isDebtPayoff =
        targetType === 'goal' && (target.type as string) === 'debt_payoff';

      if (action === 'record') {
        const contribution = buildContributionPayload(expense);

        const { newCurrentAmount, newCurrentBalance } = computeAmountAfterContribution(
          currentAmount,
          expense.amount,
          targetType,
          isDebtPayoff,
          currentBalance,
        );

        const updates: Record<string, unknown> = {
          contributions: FieldValue.arrayUnion({
            expenseId: expense.id,
            folderId: expense.folderId,
            amount: expense.amount,
            date: contribution.date,
          }),
          updatedAt: FieldValue.serverTimestamp(),
        };

        if (targetType === 'savings_pot') {
          updates.currentBalance = newCurrentBalance;
          updates.totalContributed = FieldValue.increment(expense.amount);
          // Also add to transactions array
          updates.transactions = FieldValue.arrayUnion({
            id: `exp_${expense.id}`,
            type: 'contribution',
            amount: expense.amount,
            date: contribution.date,
            description: expense.label,
            linkedExpenseId: expense.id,
            linkedFolderId: expense.folderId,
          });
        } else if (isDebtPayoff) {
          updates.currentAmount = newCurrentAmount;
          updates['debtTracking.currentBalance'] = newCurrentBalance;
        } else {
          updates.currentAmount = newCurrentAmount;
        }

        // Check if goal is now completed
        if (targetType === 'goal' && !isDebtPayoff) {
          const targetAmount = target.targetAmount as number | undefined;
          if (targetAmount && newCurrentAmount >= targetAmount) {
            updates.status = 'completed';
            updates.completedAt = FieldValue.serverTimestamp();
          }
        }

        tx.update(targetRef, updates);
      } else {
        // Reverse: remove matching contribution
        const contributions = (target.contributions as Array<{ expenseId: string; amount: number }>) ?? [];
        const match = contributions.find((c) => c.expenseId === expense.id);
        if (!match) return; // Nothing to reverse

        const { newCurrentAmount, newCurrentBalance } = computeAmountAfterReversal(
          currentAmount,
          match.amount,
          targetType,
          isDebtPayoff,
          currentBalance,
        );

        const updates: Record<string, unknown> = {
          contributions: FieldValue.arrayRemove(match),
          updatedAt: FieldValue.serverTimestamp(),
        };

        if (targetType === 'savings_pot') {
          updates.currentBalance = newCurrentBalance;
          updates.totalContributed = FieldValue.increment(-match.amount);
          // Remove from transactions array
          const transactions = (target.transactions as Array<{ id: string }>) ?? [];
          const txRecord = transactions.find((t) => t.id === `exp_${expense.id}`);
          if (txRecord) {
            updates.transactions = FieldValue.arrayRemove(txRecord);
          }
        } else if (isDebtPayoff) {
          updates.currentAmount = newCurrentAmount;
          updates['debtTracking.currentBalance'] = newCurrentBalance;
        } else {
          updates.currentAmount = newCurrentAmount;
          // Revert completed status if needed
          if ((target.status as string) === 'completed') {
            updates.status = 'in_progress';
            updates.completedAt = FieldValue.delete();
          }
        }

        tx.update(targetRef, updates);
      }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Transaction failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
