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

/**
 * DELETE /api/cycle-items/fix-misaligned-payments
 * Merge duplicate cycle items (same cycle + same commitment/label)
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await withAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const url = new URL(request.url);
    const dryRun = url.searchParams.get('dryRun') !== 'false';

    const db = getAdminDb();

    // Get all cycle items
    const itemsSnap = await db
      .collection(`users/${userId}/cycleItems`)
      .get();

    // Group items by cycle + commitment/label
    const groups = new Map<string, Array<{ doc: FirebaseFirestore.QueryDocumentSnapshot; data: FirebaseFirestore.DocumentData }>>();

    for (const doc of itemsSnap.docs) {
      const data = doc.data();
      const key = `${data.cycleId}:${data.commitmentId || ''}:${data.label}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push({ doc, data });
    }

    // Find duplicates (groups with more than 1 item)
    const duplicateGroups: Array<{
      key: string;
      cycleId: string;
      label: string;
      items: Array<{ id: string; paymentsCount: number; totalPaid: number }>;
    }> = [];

    for (const [key, items] of groups) {
      if (items.length > 1) {
        const [cycleId, , label] = key.split(':');
        duplicateGroups.push({
          key,
          cycleId,
          label: label || items[0].data.label,
          items: items.map(i => ({
            id: i.doc.id,
            paymentsCount: (i.data.payments ?? []).length,
            totalPaid: i.data.totalPaidAmount ?? 0,
          })),
        });
      }
    }

    if (duplicateGroups.length === 0) {
      return NextResponse.json({
        dryRun,
        message: 'No duplicate items found.',
        mergedCount: 0,
        deletedCount: 0,
      });
    }

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        message: `Found ${duplicateGroups.length} groups of duplicate items. Add ?dryRun=false to merge them.`,
        duplicateGroups,
      });
    }

    // Merge duplicates
    const batch = db.batch();
    let mergedCount = 0;
    let deletedCount = 0;

    for (const [key, items] of groups) {
      if (items.length <= 1) continue;

      // Keep the first item, merge others into it
      const [primary, ...duplicates] = items;
      const primaryPayments: Payment[] = primary.data.payments ?? [];

      // Collect all payments from duplicates
      for (const dup of duplicates) {
        const dupPayments: Payment[] = dup.data.payments ?? [];
        primaryPayments.push(...dupPayments);

        // Delete the duplicate
        batch.delete(dup.doc.ref);
        deletedCount++;
      }

      // Update the primary item with merged payments
      const totalPaid = primaryPayments.reduce((sum, p) => sum + p.amount, 0);
      batch.update(primary.doc.ref, {
        payments: primaryPayments,
        totalPaidAmount: totalPaid,
        status: totalPaid >= primary.data.amount ? 'paid' : (totalPaid > 0 ? 'partial' : 'upcoming'),
        updatedAt: FieldValue.serverTimestamp(),
      });
      mergedCount++;

      // Update cycle totals (reduce item count for deleted items)
      const cycleRef = db.collection(`users/${userId}/cycles`).doc(primary.data.cycleId);
      batch.update(cycleRef, {
        itemCount: FieldValue.increment(-duplicates.length),
        totalCommitted: FieldValue.increment(-duplicates.length * primary.data.amount),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();

    return NextResponse.json({
      dryRun: false,
      message: `Merged ${mergedCount} groups, deleted ${deletedCount} duplicate items.`,
      mergedCount,
      deletedCount,
    });
  } catch (error) {
    console.error('Error merging duplicate items:', error);
    return NextResponse.json(
      { error: 'Failed to merge duplicate items' },
      { status: 500 }
    );
  }
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
 * 1. Group all misaligned payments by target cycle and commitment
 * 2. For each group, find or create ONE target cycle item
 * 3. Add all payments from that group to the target item
 * 4. Update totals on source items and cycles
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

    // Build a map of existing items by cycle+commitment for quick lookup
    const existingItemsMap = new Map<string, { docId: string; data: FirebaseFirestore.DocumentData }>();
    for (const doc of itemsSnap.docs) {
      const data = doc.data();
      const key = `${data.cycleId}:${data.commitmentId || data.label}`;
      existingItemsMap.set(key, { docId: doc.id, data });
    }

    const fixes: Array<{
      action: string;
      cycleItemId: string;
      label: string;
      paymentId: string;
      fromCycle: string;
      toCycle: string;
      amount: number;
    }> = [];

    // Group payments to move by: sourceItemId -> targetCycleId -> payments[]
    const moveGroups = new Map<string, {
      sourceDoc: FirebaseFirestore.QueryDocumentSnapshot;
      sourceData: FirebaseFirestore.DocumentData;
      paymentsToKeep: Payment[];
      targetGroups: Map<string, Payment[]>;
    }>();

    for (const doc of itemsSnap.docs) {
      const data = doc.data();
      const payments: Payment[] = data.payments ?? [];
      const currentCycleId = data.cycleId;

      const currentCycle = cycles.find(c => c.id === currentCycleId);
      if (!currentCycle) continue;

      const paymentsToKeep: Payment[] = [];
      const targetGroups = new Map<string, Payment[]>();

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
            // Group by target cycle
            if (!targetGroups.has(correctCycle.id)) {
              targetGroups.set(correctCycle.id, []);
            }
            targetGroups.get(correctCycle.id)!.push(payment);

            fixes.push({
              action: 'move_payment',
              cycleItemId: doc.id,
              label: data.label,
              paymentId: payment.id,
              fromCycle: currentCycleId,
              toCycle: correctCycle.id,
              amount: payment.amount,
            });
          }
        }
      }

      if (targetGroups.size > 0) {
        moveGroups.set(doc.id, {
          sourceDoc: doc,
          sourceData: data,
          paymentsToKeep,
          targetGroups,
        });
      }
    }

    if (!dryRun && moveGroups.size > 0) {
      const batch = db.batch();
      let batchCount = 0;

      // Track items we're creating/updating in this batch to avoid duplicates
      const pendingItems = new Map<string, { ref: FirebaseFirestore.DocumentReference; payments: Payment[]; amount: number }>();

      for (const [sourceDocId, group] of moveGroups) {
        const { sourceDoc, sourceData, paymentsToKeep, targetGroups } = group;
        const commitmentId = sourceData.commitmentId;
        const label = sourceData.label;
        const currentCycleId = sourceData.cycleId;

        // Update source item - remove moved payments
        const newTotalPaid = paymentsToKeep.reduce((sum, p) => sum + p.amount, 0);
        batch.update(sourceDoc.ref, {
          payments: paymentsToKeep,
          totalPaidAmount: newTotalPaid,
          status: newTotalPaid >= sourceData.amount ? 'paid' : (newTotalPaid > 0 ? 'partial' : 'upcoming'),
          updatedAt: FieldValue.serverTimestamp(),
        });
        batchCount++;

        // Process each target cycle group
        for (const [targetCycleId, paymentsToAdd] of targetGroups) {
          const lookupKey = `${targetCycleId}:${commitmentId || label}`;
          const totalToAdd = paymentsToAdd.reduce((sum, p) => sum + p.amount, 0);

          // Check if we already have a pending item for this target
          if (pendingItems.has(lookupKey)) {
            // Add to pending item
            const pending = pendingItems.get(lookupKey)!;
            pending.payments.push(...paymentsToAdd);
          } else {
            // Check if item exists in DB
            const existing = existingItemsMap.get(lookupKey);

            if (existing && existing.docId !== sourceDocId) {
              // Add to existing item in DB
              const existingPayments: Payment[] = existing.data.payments ?? [];
              existingPayments.push(...paymentsToAdd);
              const existingTotalPaid = existingPayments.reduce((sum, p) => sum + p.amount, 0);

              const targetRef = db.collection(`users/${userId}/cycleItems`).doc(existing.docId);
              batch.update(targetRef, {
                payments: existingPayments,
                totalPaidAmount: existingTotalPaid,
                status: existingTotalPaid >= existing.data.amount ? 'paid' : 'partial',
                updatedAt: FieldValue.serverTimestamp(),
              });
              batchCount++;

              // Track for subsequent payments going to same target
              pendingItems.set(lookupKey, { ref: targetRef, payments: existingPayments, amount: existing.data.amount });
            } else {
              // Create new item
              const newItemRef = db.collection(`users/${userId}/cycleItems`).doc();
              batch.set(newItemRef, {
                cycleId: targetCycleId,
                commitmentId: commitmentId || null,
                label,
                amount: sourceData.amount,
                category: sourceData.category,
                subCategory: sourceData.subCategory || null,
                accountType: sourceData.accountType,
                status: 'partial',
                isVariable: sourceData.isVariable ?? false,
                linkedGoalId: sourceData.linkedGoalId || null,
                payments: paymentsToAdd,
                totalPaidAmount: totalToAdd,
                sortOrder: sourceData.sortOrder || 999,
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
              });
              batchCount++;

              // Track for subsequent payments
              pendingItems.set(lookupKey, { ref: newItemRef, payments: paymentsToAdd, amount: sourceData.amount });

              // Update target cycle totals
              const targetCycleRef = db.collection(`users/${userId}/cycles`).doc(targetCycleId);
              batch.update(targetCycleRef, {
                totalCommitted: FieldValue.increment(sourceData.amount),
                totalPaid: FieldValue.increment(totalToAdd),
                itemCount: FieldValue.increment(1),
                updatedAt: FieldValue.serverTimestamp(),
              });
              batchCount++;
            }
          }

          // Update source cycle totals
          const sourceCycleRef = db.collection(`users/${userId}/cycles`).doc(currentCycleId);
          batch.update(sourceCycleRef, {
            totalPaid: FieldValue.increment(-totalToAdd),
            updatedAt: FieldValue.serverTimestamp(),
          });
          batchCount++;
        }
      }

      // Update any pending items that accumulated multiple payment groups
      for (const [key, pending] of pendingItems) {
        const totalPaid = pending.payments.reduce((sum, p) => sum + p.amount, 0);
        batch.update(pending.ref, {
          payments: pending.payments,
          totalPaidAmount: totalPaid,
          status: totalPaid >= pending.amount ? 'paid' : 'partial',
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

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
