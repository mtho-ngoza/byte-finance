import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { normalizeVendor } from '@/lib/category-engine';
import { CATEGORIES } from '@/lib/constants';
import type { Category } from '@/types';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/vendor-rules/[id]
 * Get a single vendor rule
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;
  const { id } = await context.params;

  const db = getAdminDb();
  const docRef = db.doc(`users/${userId}/vendorRules/${id}`);
  const snap = await docRef.get();

  if (!snap.exists) {
    return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
  }

  return NextResponse.json({ id: snap.id, ...snap.data() });
}

/**
 * PATCH /api/vendor-rules/[id]
 * Update a vendor rule
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;
  const { id } = await context.params;

  const body = await request.json();
  const { vendor, category, subCategory } = body;

  const db = getAdminDb();
  const docRef = db.doc(`users/${userId}/vendorRules/${id}`);
  const snap = await docRef.get();

  if (!snap.exists) {
    return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
  }

  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (vendor !== undefined) {
    const normalizedVendor = normalizeVendor(vendor);
    if (!normalizedVendor) {
      return NextResponse.json({ error: 'Invalid vendor name' }, { status: 400 });
    }
    updates.vendor = normalizedVendor;
  }

  if (category !== undefined) {
    if (!CATEGORIES.includes(category as Category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }
    updates.category = category;
  }

  if (subCategory !== undefined) {
    updates.subCategory = subCategory ?? null;
  }

  await docRef.update(updates);
  const updated = await docRef.get();

  return NextResponse.json({ id: updated.id, ...updated.data() });
}

/**
 * DELETE /api/vendor-rules/[id]
 * Delete a vendor rule
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;
  const { id } = await context.params;

  const db = getAdminDb();
  const docRef = db.doc(`users/${userId}/vendorRules/${id}`);
  const snap = await docRef.get();

  if (!snap.exists) {
    return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
  }

  await docRef.delete();
  return NextResponse.json({ success: true });
}
