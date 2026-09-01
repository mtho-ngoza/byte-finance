import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * GET /api/projects/[id]
 * Get a single project by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id } = await params;
  const db = getAdminDb();
  const doc = await db.collection(`users/${userId}/projects`).doc(id).get();

  if (!doc.exists) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  return NextResponse.json({ id: doc.id, ...doc.data() });
}

/**
 * PATCH /api/projects/[id]
 * Update a project
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id } = await params;
  const body = await request.json();

  const db = getAdminDb();
  const docRef = db.collection(`users/${userId}/projects`).doc(id);
  const doc = await docRef.get();

  if (!doc.exists) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Build update object - only update provided fields
  const updateData: any = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (body.name !== undefined) updateData.name = body.name.trim();
  if (body.description !== undefined) updateData.description = body.description?.trim() || null;
  if (body.type !== undefined) updateData.type = body.type;
  if (body.targetAmount !== undefined) updateData.targetAmount = body.targetAmount;
  if (body.status !== undefined) {
    updateData.status = body.status;
    if (body.status === 'completed') {
      updateData.completedAt = FieldValue.serverTimestamp();
    }
  }
  if (body.priority !== undefined) updateData.priority = body.priority;
  if (body.notes !== undefined) updateData.notes = body.notes?.trim() || null;

  await docRef.update(updateData);

  const updated = await docRef.get();
  return NextResponse.json({ id: updated.id, ...updated.data() });
}

/**
 * DELETE /api/projects/[id]
 * Archive a project (soft delete)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id } = await params;
  const db = getAdminDb();
  const docRef = db.collection(`users/${userId}/projects`).doc(id);
  const doc = await docRef.get();

  if (!doc.exists) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Soft delete - archive instead of hard delete
  await docRef.update({
    status: 'archived',
    archivedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ success: true });
}
