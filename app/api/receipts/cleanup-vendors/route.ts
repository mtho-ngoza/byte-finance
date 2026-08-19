import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/receipts/cleanup-vendors
 * Cleanup migration: Remove incorrect vendor values that were auto-populated
 * from cycle item labels (e.g., "Entertainment", "Grocery") instead of real
 * vendor names (e.g., "KFC", "Checkers")
 */
export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const db = getAdminDb();
  const receiptsRef = db.collection(`users/${userId}/receipts`);

  // Common commitment labels and categories that are NOT real vendor names
  const invalidVendorPatterns = [
    // Categories
    'housing',
    'transport',
    'family',
    'utilities',
    'health',
    'education',
    'savings',
    'lifestyle',
    'business',
    'other',
    'entertainment',
    'grocery',
    'groceries',
    'petrol',
    'fuel',
    'insurance',
    'medical',
    'school fees',
    'subscriptions',
    'electricity',
    'water',
    'rates',
    'levies',
    'bond',
    'rent',
    // Add any specific commitment labels you know are wrong
  ];

  // Find all receipts with vendors
  const receiptsSnap = await receiptsRef
    .where('vendor', '!=', null)
    .get();

  const receiptsToClean: string[] = [];

  receiptsSnap.forEach((doc) => {
    const receipt = doc.data();
    const vendor = receipt.vendor?.toLowerCase().trim();

    if (vendor && invalidVendorPatterns.includes(vendor)) {
      receiptsToClean.push(doc.id);
    }
  });

  if (receiptsToClean.length === 0) {
    return NextResponse.json({
      message: 'No receipts need vendor cleanup',
      cleaned: 0,
    });
  }

  // Clear vendor field and set needsAttention for these receipts
  let cleaned = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const receiptId of receiptsToClean) {
    try {
      const receiptRef = receiptsRef.doc(receiptId);
      await receiptRef.update({
        vendor: FieldValue.delete(),
        needsAttention: true,
        updatedAt: FieldValue.serverTimestamp(),
      });
      cleaned++;
    } catch (error) {
      errors.push(`Receipt ${receiptId}: ${error instanceof Error ? error.message : String(error)}`);
      failed++;
    }
  }

  return NextResponse.json({
    message: 'Vendor cleanup complete',
    found: receiptsToClean.length,
    cleaned,
    failed,
    errors: errors.length > 0 ? errors : undefined,
  });
}
