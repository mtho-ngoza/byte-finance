import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';

/**
 * GET /api/goals/[id]/unlinked-payments
 *
 * Returns all payments from cycle items that aren't already linked to this goal.
 * Used to let users retroactively link past payments to a goal.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id: goalId } = await params;

  const db = getAdminDb();

  // Get the goal to find existing contribution IDs
  const goalRef = db.collection(`users/${userId}/goals`).doc(goalId);
  const goalDoc = await goalRef.get();

  if (!goalDoc.exists) {
    return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
  }

  const goal = goalDoc.data()!;
  const existingContributions = goal.contributions ?? [];

  // Create a set of already-linked payment IDs (format: cycleItemId-paymentId)
  const linkedPaymentIds = new Set(
    existingContributions
      .filter((c: { cycleItemId?: string; id?: string }) => c.cycleItemId)
      .map((c: { cycleItemId?: string; id?: string }) => {
        // The contribution id format is: cycleItemId-paymentId
        return c.id;
      })
  );

  // Get all cycles
  const cyclesSnap = await db.collection(`users/${userId}/cycles`)
    .orderBy('startDate', 'desc')
    .limit(12) // Last 12 cycles
    .get();

  const unlinkedPayments: Array<{
    paymentId: string;
    cycleItemId: string;
    cycleId: string;
    cycleName: string;
    itemLabel: string;
    amount: number;
    date: string;
    note?: string;
  }> = [];

  for (const cycleDoc of cyclesSnap.docs) {
    const cycle = cycleDoc.data();
    const cycleId = cycleDoc.id;
    const cycleName = cycle.label || `Cycle ${cycleId.slice(0, 6)}`;

    // Get all cycle items for this cycle
    const itemsSnap = await db.collection(`users/${userId}/cycleItems`)
      .where('cycleId', '==', cycleId)
      .get();

    for (const itemDoc of itemsSnap.docs) {
      const item = itemDoc.data();
      const payments = item.payments ?? [];

      for (const payment of payments) {
        const contributionId = `${itemDoc.id}-${payment.id}`;

        // Skip if already linked to this goal
        if (linkedPaymentIds.has(contributionId)) {
          continue;
        }

        // Get payment date
        const paymentDate = payment.date?.toDate?.()
          ?? (payment.date ? new Date(payment.date) : new Date());

        unlinkedPayments.push({
          paymentId: payment.id,
          cycleItemId: itemDoc.id,
          cycleId,
          cycleName,
          itemLabel: item.label,
          amount: payment.amount,
          date: paymentDate.toISOString(),
          note: payment.note ?? undefined,
        });
      }
    }
  }

  // Sort by date descending
  unlinkedPayments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return NextResponse.json({ payments: unlinkedPayments }, { status: 200 });
}
