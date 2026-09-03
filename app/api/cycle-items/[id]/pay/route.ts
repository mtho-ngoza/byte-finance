import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/cycle-items/[id]/pay
 * Body: { amount: number, note?: string }
 *
 * Adds a partial payment to a cycle item.
 * - Updates item payments array and totalPaidAmount
 * - Sets status to 'partial' or 'paid' depending on total
 * - Updates cycle totalPaid
 * - Records goal contribution if linked
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id } = await params;
  const body = await request.json();
  const { amount, note, receiptId, date } = body;
  const paymentDate = date ? new Date(date) : new Date();

  if (!amount || typeof amount !== 'number' || amount <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
  }

  const db = getAdminDb();
  const ref = db.collection(`users/${userId}/cycleItems`).doc(id);
  const doc = await ref.get();

  if (!doc.exists) {
    return NextResponse.json({ error: 'CycleItem not found' }, { status: 404 });
  }

  const item = doc.data()!;
  const now = FieldValue.serverTimestamp();
  const paymentId = `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const newTotalPaid = (item.totalPaidAmount ?? 0) + amount;
  // Auto-complete for non-variable items when paid in full.
  // Variable items stay partial to allow overspend tracking.
  const isVariable = item.isVariable ?? false;
  const paidInFull = newTotalPaid >= item.amount;
  const newStatus = (!isVariable && paidInFull) ? 'paid' : 'partial';

  const payment = {
    id: paymentId,
    amount,
    date: paymentDate,
    note: note ?? null,
    ...(receiptId ? { receiptId } : {}),
  };

  const wasNotPaid = item.status !== 'paid';
  const nowPaid = newStatus === 'paid';

  // paidDate should be set on FIRST payment (not just when fully paid)
  // This allows proper date-based filtering for partial items
  const isFirstPayment = !item.payments || item.payments.length === 0;

  await ref.update({
    payments: FieldValue.arrayUnion(payment),
    totalPaidAmount: FieldValue.increment(amount),
    status: newStatus,
    // Set paidDate on first payment, or use existing, or update if now fully paid
    paidDate: isFirstPayment ? paymentDate : (item.paidDate ?? paymentDate),
    updatedAt: now,
  });

  // Link the receipt to this cycle item if provided
  if (receiptId) {
    try {
      const receiptRef = db.collection(`users/${userId}/receipts`).doc(receiptId);

      // Use set with merge to handle race condition where receipt may not be fully created yet
      const receiptUpdate: Record<string, unknown> = {
        cycleItemId: id,
        cycleId: item.cycleId,
        updatedAt: now,
      };

      // Try to get existing receipt data
      const receiptSnap = await receiptRef.get();
      if (receiptSnap.exists) {
        const receipt = receiptSnap.data()!;

        // Check if receipt is already linked to a different cycle item
        if (receipt.cycleItemId && receipt.cycleItemId !== id) {
          console.warn(`Receipt ${receiptId} already linked to ${receipt.cycleItemId}`);
        } else {
          // Auto-populate amount from payment if not already set
          if (!receipt.amountInCents) {
            receiptUpdate.amountInCents = amount;
          }

          // If vendor is missing, try to extract it via Gemini Vision
          if (!receipt.vendor) {
            try {
              const extractRes = await fetch(
                `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/receipts/extract`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    // Forward auth header
                    ...(request.headers.get('authorization')
                      ? { 'Authorization': request.headers.get('authorization')! }
                      : {}),
                    ...(request.headers.get('cookie')
                      ? { 'Cookie': request.headers.get('cookie')! }
                      : {}),
                  },
                  body: JSON.stringify({ receiptId }),
                }
              );

              if (extractRes.ok) {
                const extracted = await extractRes.json();
                if (extracted.vendor) {
                  receiptUpdate.vendor = extracted.vendor;
                  console.log(`Auto-extracted vendor for receipt ${receiptId}: ${extracted.vendor}`);
                }
                // Also use extracted amount if we don't have one yet
                if (!receipt.amountInCents && !receiptUpdate.amountInCents && extracted.amountInCents) {
                  receiptUpdate.amountInCents = extracted.amountInCents;
                }
              }
            } catch (extractError) {
              console.warn('Failed to auto-extract receipt data:', extractError);
              // Continue without extraction - user can manually enter
            }
          }

          // Update needsAttention flag
          const willHaveAmount = receipt.amountInCents || receiptUpdate.amountInCents;
          const willHaveVendor = receipt.vendor || receiptUpdate.vendor;
          receiptUpdate.needsAttention = !(willHaveAmount && willHaveVendor);

          await receiptRef.set(receiptUpdate, { merge: true });
        }
      } else {
        // Receipt doesn't exist yet - set what we have
        receiptUpdate.amountInCents = amount;
        receiptUpdate.needsAttention = true;
        await receiptRef.set(receiptUpdate, { merge: true });
      }
    } catch (receiptError) {
      console.error('Failed to link receipt:', receiptError);
    }
  }

  // Update cycle totalPaid (always increment — partial counts toward paid total)
  // Also increment paidCount if this payment completed the item
  const cycleRef = db.collection(`users/${userId}/cycles`).doc(item.cycleId);
  await cycleRef.update({
    totalPaid: FieldValue.increment(amount),
    ...(wasNotPaid && nowPaid ? { paidCount: FieldValue.increment(1) } : {}),
    updatedAt: now,
  });

  // Smart linking: contribute to goal
  if (item.linkedGoalId) {
    const goalRef = db.collection(`users/${userId}/goals`).doc(item.linkedGoalId);
    await goalRef.update({
      currentAmount: FieldValue.increment(amount),
      contributions: FieldValue.arrayUnion({
        id: `${id}-${paymentId}`,
        date: paymentDate,
        amount,
        cycleId: item.cycleId,
        cycleItemId: id,
        note: note ?? null,
      }),
      updatedAt: now,
    });
  }

  const updated = await ref.get();
  return NextResponse.json({ id, ...updated.data() }, { status: 200 });
}
