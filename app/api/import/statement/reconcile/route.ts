import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';

/**
 * GET /api/import/statement/reconcile?cycleId=YYYY-MM
 *
 * Returns:
 * - cycleItems tagged with bank-import for the cycle
 * - receipts for the cycle (linked or unlinked)
 * - matched pairs (cycleItem ↔ receipt by amount + date proximity)
 * - unmatched cycle items (no receipt)
 * - orphan receipts (no cycleItem)
 */
export async function GET(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(request.url);
  const cycleId = searchParams.get('cycleId');
  if (!cycleId) return NextResponse.json({ error: 'cycleId required' }, { status: 400 });

  const db = getAdminDb();

  // Fetch bank-imported cycle items for this cycle
  const itemsSnap = await db
    .collection(`users/${userId}/cycleItems`)
    .where('cycleId', '==', cycleId)
    .where('tags', 'array-contains', 'bank-import')
    .get();

  const items = itemsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<{
    id: string;
    label: string;
    amount: number;
    dueDate?: { toDate: () => Date } | null;
    status: string;
    receiptId?: string;
  }>;

  // Fetch receipts for this cycle
  const receiptsSnap = await db
    .collection(`users/${userId}/receipts`)
    .where('cycleId', '==', cycleId)
    .get();

  const receipts = receiptsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<{
    id: string;
    amountInCents?: number;
    vendor?: string;
    capturedAt?: { toDate: () => Date };
    cycleItemId?: string;
  }>;

  // Also fetch unlinked receipts (no cycleId set but captured in this cycle's date range)
  const cycleDoc = await db.doc(`users/${userId}/cycles/${cycleId}`).get();
  const cycleData = cycleDoc.data();
  const startDate = cycleData?.startDate?.toDate?.() ?? new Date();
  const endDate = cycleData?.endDate?.toDate?.() ?? new Date();

  const unlinkedSnap = await db
    .collection(`users/${userId}/receipts`)
    .where('capturedAt', '>=', startDate)
    .where('capturedAt', '<=', endDate)
    .get();

  const unlinkedReceipts = unlinkedSnap.docs
    .map((d) => ({ id: d.id, ...d.data() } as { id: string; amountInCents?: number; vendor?: string; capturedAt?: { toDate: () => Date }; cycleItemId?: string; cycleId?: string }))
    .filter((r) => !r.cycleId);

  // Combine all receipts (deduplicate by id)
  const allReceiptsMap = new Map<string, typeof receipts[0]>();
  for (const r of [...receipts, ...unlinkedReceipts]) {
    allReceiptsMap.set(r.id, r);
  }
  const allReceipts = Array.from(allReceiptsMap.values());

  // Match items to receipts: same amount ± 5%, date within 48h
  const AMOUNT_TOLERANCE = 0.05; // 5%
  const DATE_TOLERANCE_MS = 48 * 60 * 60 * 1000; // 48 hours

  const matched: Array<{ itemId: string; receiptId: string; confidence: 'high' | 'medium' }> = [];
  const matchedItemIds = new Set<string>();
  const matchedReceiptIds = new Set<string>();

  for (const item of items) {
    if (item.receiptId) {
      // Already linked
      matched.push({ itemId: item.id, receiptId: item.receiptId, confidence: 'high' });
      matchedItemIds.add(item.id);
      matchedReceiptIds.add(item.receiptId);
      continue;
    }

    const itemDate = item.dueDate?.toDate?.() ?? null;

    for (const receipt of allReceipts) {
      if (matchedReceiptIds.has(receipt.id)) continue;
      if (!receipt.amountInCents) continue;

      const amountDiff = Math.abs(item.amount - receipt.amountInCents) / item.amount;
      if (amountDiff > AMOUNT_TOLERANCE) continue;

      const receiptDate = receipt.capturedAt?.toDate?.() ?? null;
      const dateDiff = itemDate && receiptDate ? Math.abs(itemDate.getTime() - receiptDate.getTime()) : Infinity;

      if (dateDiff <= DATE_TOLERANCE_MS) {
        const confidence = amountDiff < 0.01 && dateDiff < 24 * 60 * 60 * 1000 ? 'high' : 'medium';
        matched.push({ itemId: item.id, receiptId: receipt.id, confidence });
        matchedItemIds.add(item.id);
        matchedReceiptIds.add(receipt.id);
        break;
      }
    }
  }

  const unmatchedItems = items.filter((i) => !matchedItemIds.has(i.id));
  const orphanReceipts = allReceipts.filter((r) => !matchedReceiptIds.has(r.id));

  return NextResponse.json({
    matched,
    unmatchedItems: unmatchedItems.map((i) => ({
      id: i.id,
      label: i.label,
      amount: i.amount,
      date: i.dueDate?.toDate?.()?.toISOString() ?? null,
      status: i.status,
    })),
    orphanReceipts: orphanReceipts.map((r) => ({
      id: r.id,
      amountInCents: r.amountInCents,
      vendor: r.vendor,
      capturedAt: r.capturedAt?.toDate?.()?.toISOString() ?? null,
    })),
    items: items.map((i) => ({
      id: i.id,
      label: i.label,
      amount: i.amount,
      date: i.dueDate?.toDate?.()?.toISOString() ?? null,
      status: i.status,
      receiptId: i.receiptId,
    })),
    receipts: allReceipts.map((r) => ({
      id: r.id,
      amountInCents: r.amountInCents,
      vendor: r.vendor,
      capturedAt: r.capturedAt?.toDate?.()?.toISOString() ?? null,
      cycleItemId: r.cycleItemId,
    })),
  });
}

/**
 * POST /api/import/statement/reconcile
 * Body: { itemId: string, receiptId: string }
 * Links a cycle item to a receipt manually.
 */
export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { itemId, receiptId } = await request.json();
  if (!itemId || !receiptId) return NextResponse.json({ error: 'itemId and receiptId required' }, { status: 400 });

  const db = getAdminDb();
  const now = new Date();

  await db.doc(`users/${userId}/cycleItems/${itemId}`).update({ receiptId, updatedAt: now });
  await db.doc(`users/${userId}/receipts/${receiptId}`).update({ cycleItemId: itemId, updatedAt: now });

  return NextResponse.json({ ok: true });
}
