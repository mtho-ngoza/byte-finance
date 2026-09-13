import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { normalizeVendor } from '@/lib/category-engine';
import { CATEGORIES } from '@/lib/constants';
import type { Category } from '@/types';

/**
 * POST /api/vendor-rules/learn
 * Learn from a user's category assignment
 * Creates a new rule or increments matchCount on existing rule
 * Body: { vendor, category, subCategory? }
 */
export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await request.json();
  const { vendor, category, subCategory } = body;

  // Validate required fields
  if (!vendor || !category) {
    return NextResponse.json(
      { error: 'vendor and category are required' },
      { status: 400 }
    );
  }

  // Validate category
  if (!CATEGORIES.includes(category as Category)) {
    return NextResponse.json(
      { error: 'Invalid category' },
      { status: 400 }
    );
  }

  const normalizedVendor = normalizeVendor(vendor);
  if (!normalizedVendor) {
    return NextResponse.json(
      { error: 'Invalid vendor name' },
      { status: 400 }
    );
  }

  const db = getAdminDb();
  const now = FieldValue.serverTimestamp();
  const rulesCollection = db.collection(`users/${userId}/vendorRules`);

  // Check if rule already exists for this vendor
  const existing = await rulesCollection
    .where('vendor', '==', normalizedVendor)
    .limit(1)
    .get();

  if (!existing.empty) {
    const docRef = existing.docs[0].ref;
    const existingData = existing.docs[0].data();

    // If the category matches, just increment matchCount
    if (existingData.category === category) {
      await docRef.update({
        matchCount: FieldValue.increment(1),
        updatedAt: now,
      });
    } else {
      // Category changed - update and reset confidence to 'learned'
      await docRef.update({
        category,
        subCategory: subCategory ?? null,
        confidence: 'learned',
        matchCount: FieldValue.increment(1),
        updatedAt: now,
      });
    }

    const updated = await docRef.get();
    return NextResponse.json({ id: docRef.id, ...updated.data(), created: false });
  }

  // Create new learned rule
  const ruleData = {
    vendor: normalizedVendor,
    category,
    subCategory: subCategory ?? null,
    confidence: 'learned',
    matchCount: 1,
    createdAt: now,
    updatedAt: now,
  };

  const ref = rulesCollection.doc();
  await ref.set(ruleData);

  return NextResponse.json({ id: ref.id, ...ruleData, created: true }, { status: 201 });
}
