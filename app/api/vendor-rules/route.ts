import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { normalizeVendor } from '@/lib/category-engine';
import { CATEGORIES } from '@/lib/constants';
import type { Category } from '@/types';

/**
 * GET /api/vendor-rules
 * List all vendor rules for the authenticated user
 */
export async function GET(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const db = getAdminDb();
  const snap = await db
    .collection(`users/${userId}/vendorRules`)
    .orderBy('matchCount', 'desc')
    .get();

  const rules = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  return NextResponse.json({ rules });
}

/**
 * POST /api/vendor-rules
 * Create or update a vendor rule
 * Body: { vendor, category, subCategory?, confidence? }
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
    // Update existing rule
    const docRef = existing.docs[0].ref;
    await docRef.update({
      category,
      subCategory: subCategory ?? null,
      confidence: 'user_set',
      updatedAt: now,
    });

    const updated = await docRef.get();
    return NextResponse.json({ id: docRef.id, ...updated.data() });
  }

  // Create new rule
  const ruleData = {
    vendor: normalizedVendor,
    category,
    subCategory: subCategory ?? null,
    confidence: 'user_set',
    matchCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  const ref = rulesCollection.doc();
  await ref.set(ruleData);

  return NextResponse.json({ id: ref.id, ...ruleData }, { status: 201 });
}
