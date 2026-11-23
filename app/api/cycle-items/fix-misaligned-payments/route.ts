import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

interface Payment {
  id: string;
  amount: number;
  date: { toDate?: () => Date } | Date | string;
  note?: string;
  receiptId?: string;
}

interface MisalignedPayment {
  payment: {
    id: string;
    amount: number;
    date: string;
    note?: string;
  };
  correctCycleId: string;
  cycleItemId: string;
  cycleItemLabel: string;
  currentCycleId: string;
}

/**
 * GET /api/cycle-items/fix-misaligned-payments
 * Diagnose payments that fall outside their cycle's date range
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await withAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const db = getAdminDb();

    // Get all cycles with their date ranges
    const cyclesSnap = await db
      .collection(`users/${userId}/cycles`)
      .orderBy('startDate', 'asc')
      .get();

    const cycles = cyclesSnap.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        startDate: data.startDate?.toDate?.() ?? new Date(data.startDate),
        endDate: data.endDate?.toDate?.() ?? new Date(data.endDate),
      };
    });

    // Get all cycle items with payments
    const itemsSnap = await db
      .collection(`users/${userId}/cycleItems`)
      .get();

    const misalignedPayments: MisalignedPayment[] = [];
    const itemsChecked = itemsSnap.docs.length;
    let paymentsChecked = 0;

    for (const doc of itemsSnap.docs) {
      const data = doc.data();
      const payments: Payment[] = data.payments ?? [];
      const currentCycleId = data.cycleId;

      // Find the current cycle's date range
      const currentCycle = cycles.find(c => c.id === currentCycleId);
      if (!currentCycle) continue;

      for (const payment of payments) {
        paymentsChecked++;

        // Parse payment date
        let paymentDate: Date;
        if (payment.date instanceof Date) {
          paymentDate = payment.date;
        } else if (typeof payment.date === 'string') {
          paymentDate = new Date(payment.date);
        } else if (payment.date?.toDate) {
          paymentDate = payment.date.toDate();
        } else {
          continue; // Skip invalid dates
        }

        // Check if payment falls within current cycle's range
        const isWithinRange = paymentDate >= currentCycle.startDate &&
                              paymentDate <= currentCycle.endDate;

        if (!isWithinRange) {
          // Find the correct cycle for this payment date
          const correctCycle = cycles.find(c =>
            paymentDate >= c.startDate && paymentDate <= c.endDate
          );

          misalignedPayments.push({
            payment: {
              id: payment.id,
              amount: payment.amount,
              date: paymentDate.toISOString(),
              note: payment.note,
            },
            correctCycleId: correctCycle?.id ?? 'unknown',
            cycleItemId: doc.id,
            cycleItemLabel: data.label,
            currentCycleId,
          });
        }
      }
    }

    // Group by cycle item for readability
    const groupedByItem: Record<string, {
      cycleItemId: string;
      label: string;
      currentCycleId: string;
      payments: Array<{
        id: string;
        amount: number;
        date: string;
        correctCycleId: string;
      }>;
    }> = {};

    for (const mp of misalignedPayments) {
      if (!groupedByItem[mp.cycleItemId]) {
        groupedByItem[mp.cycleItemId] = {
          cycleItemId: mp.cycleItemId,
          label: mp.cycleItemLabel,
          currentCycleId: mp.currentCycleId,
          payments: [],
        };
      }
      groupedByItem[mp.cycleItemId].payments.push({
        id: mp.payment.id,
        amount: mp.payment.amount,
        date: mp.payment.date,
        correctCycleId: mp.correctCycleId,
      });
    }

    return NextResponse.json({
      summary: {
        itemsChecked,
        paymentsChecked,
        misalignedCount: misalignedPayments.length,
        affectedItems: Object.keys(groupedByItem).length,
      },
      misalignedItems: Object.values(groupedByItem),
      cycles: cycles.map(c => ({
        id: c.id,
        startDate: c.startDate.toISOString(),
        endDate: c.endDate.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Error diagnosing misaligned payments:', error);
    return NextResponse.json(
      { error: 'Failed to diagnose misaligned payments' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cycle-items/fix-misaligned-payments
 * Move misaligned payments to their correct cycles
 *
 * Strategy:
 * 1. For each misaligned payment, find or create the correct cycle item
 * 2. Move the payment to that item
 * 3. Update totals on both items and cycles
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await withAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const body = await request.json();
    const { dryRun = true } = body;

    const db = getAdminDb();

    // Get all cycles
    const cyclesSnap = await db
      .collection(`users/${userId}/cycles`)
      .orderBy('startDate', 'asc')
      .get();

    const cycles = cyclesSnap.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        startDate: data.startDate?.toDate?.() ?? new Date(data.startDate),
        endDate: data.endDate?.toDate?.() ?? new Date(data.endDate),
      };
    });

    // Get all cycle items
    const itemsSnap = await db
      .collection(`users/${userId}/cycleItems`)
      .get();

    const fixes: Array<{
      action: string;
      cycleItemId: string;
      label: string;
      paymentId: string;
      fromCycle: string;
      toCycle: string;
      amount: number;
    }> = [];

    const batch = db.batch();
    let batchCount = 0;

    for (const doc of itemsSnap.docs) {
      const data = doc.data();
      const payments: Payment[] = data.payments ?? [];
      const currentCycleId = data.cycleId;
      const commitmentId = data.commitmentId;
      const label = data.label;

      const currentCycle = cycles.find(c => c.id === currentCycleId);
      if (!currentCycle) continue;

      const paymentsToKeep: Payment[] = [];
      const paymentsToMove: Array<{ payment: Payment; targetCycleId: string }> = [];

      for (const payment of payments) {
        let paymentDate: Date;
        if (payment.date instanceof Date) {
          paymentDate = payment.date;
        } else if (typeof payment.date === 'string') {
          paymentDate = new Date(payment.date);
        } else if (payment.date?.toDate) {
          paymentDate = payment.date.toDate();
        } else {
          paymentsToKeep.push(payment);
          continue;
        }

        const isWithinRange = paymentDate >= currentCycle.startDate &&
                              paymentDate <= currentCycle.endDate;

        if (isWithinRange) {
          paymentsToKeep.push(payment);
        } else {
          const correctCycle = cycles.find(c =>
            paymentDate >= c.startDate && paymentDate <= c.endDate
          );
          if (correctCycle) {
            paymentsToMove.push({ payment, targetCycleId: correctCycle.id });
            fixes.push({
              action: 'move_payment',
              cycleItemId: doc.id,
              label,
              paymentId: payment.id,
              fromCycle: currentCycleId,
              toCycle: correctCycle.id,
              amount: payment.amount,
            });
          }
        }
      }

      if (paymentsToMove.length === 0) continue;

      if (!dryRun) {
        // Update the source item - remove moved payments
        const newTotalPaid = paymentsToKeep.reduce((sum, p) => sum + p.amount, 0);
        const sourceRef = db.collection(`users/${userId}/cycleItems`).doc(doc.id);

        batch.update(sourceRef, {
          payments: paymentsToKeep,
          totalPaidAmount: newTotalPaid,
          status: newTotalPaid >= data.amount ? 'paid' : (newTotalPaid > 0 ? 'partial' : 'upcoming'),
          updatedAt: FieldValue.serverTimestamp(),
        });
        batchCount++;

        // For each payment to move, find or create target item
        for (const { payment, targetCycleId } of paymentsToMove) {
          // Find existing item in target cycle with same commitmentId or label
          const existingQuery = commitmentId
            ? await db
                .collection(`users/${userId}/cycleItems`)
                .where('cycleId', '==', targetCycleId)
                .where('commitmentId', '==', commitmentId)
                .limit(1)
                .get()
            : await db
                .collection(`users/${userId}/cycleItems`)
                .where('cycleId', '==', targetCycleId)
                .where('label', '==', label)
                .limit(1)
                .get();

          if (!existingQuery.empty) {
            // Add payment to existing item
            const targetDoc = existingQuery.docs[0];
            const targetData = targetDoc.data();
            const targetPayments: Payment[] = targetData.payments ?? [];
            targetPayments.push(payment);
            const targetTotalPaid = targetPayments.reduce((sum, p) => sum + p.amount, 0);

            batch.update(targetDoc.ref, {
              payments: targetPayments,
              totalPaidAmount: targetTotalPaid,
              status: targetTotalPaid >= targetData.amount ? 'paid' : 'partial',
              updatedAt: FieldValue.serverTimestamp(),
            });
            batchCount++;
          } else {
            // Create new item in target cycle
            const newItemRef = db.collection(`users/${userId}/cycleItems`).doc();
            batch.set(newItemRef, {
              cycleId: targetCycleId,
              commitmentId: commitmentId || null,
              label,
              amount: data.amount,
              category: data.category,
              subCategory: data.subCategory || null,
              accountType: data.accountType,
              status: 'partial',
              isVariable: data.isVariable ?? false,
              linkedGoalId: data.linkedGoalId || null,
              payments: [payment],
              totalPaidAmount: payment.amount,
              sortOrder: data.sortOrder || 999,
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });
            batchCount++;

            // Update target cycle totals
            const targetCycleRef = db.collection(`users/${userId}/cycles`).doc(targetCycleId);
            batch.update(targetCycleRef, {
              totalCommitted: FieldValue.increment(data.amount),
              totalPaid: FieldValue.increment(payment.amount),
              itemCount: FieldValue.increment(1),
              updatedAt: FieldValue.serverTimestamp(),
            });
            batchCount++;
          }

          // Update source cycle totals (reduce paid amount)
          const sourceCycleRef = db.collection(`users/${userId}/cycles`).doc(currentCycleId);
          batch.update(sourceCycleRef, {
            totalPaid: FieldValue.increment(-payment.amount),
            updatedAt: FieldValue.serverTimestamp(),
          });
          batchCount++;
        }
      }
    }

    if (!dryRun && batchCount > 0) {
      await batch.commit();
    }

    return NextResponse.json({
      dryRun,
      fixCount: fixes.length,
      fixes,
      message: dryRun
        ? 'Dry run complete. Set dryRun: false to apply fixes.'
        : `Applied ${fixes.length} fixes.`,
    });
  } catch (error) {
    console.error('Error fixing misaligned payments:', error);
    return NextResponse.json(
      { error: 'Failed to fix misaligned payments' },
      { status: 500 }
    );
  }
}
