import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { CreateProject } from '@/types';

/**
 * GET /api/projects
 * List all projects for the authenticated user
 */
export async function GET(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const db = getAdminDb();
  const snapshot = await db.collection(`users/${userId}/projects`).orderBy('createdAt', 'desc').get();

  const projects = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  return NextResponse.json({ projects });
}

/**
 * POST /api/projects
 * Create a new project
 */
export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body: CreateProject = await request.json();

  // Validate required fields
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
  }

  if (!['construction', 'family', 'event', 'other'].includes(body.type)) {
    return NextResponse.json({ error: 'Invalid project type' }, { status: 400 });
  }

  const db = getAdminDb();
  const now = FieldValue.serverTimestamp();

  const projectData = {
    name: body.name.trim(),
    description: body.description?.trim() || null,
    type: body.type,
    currentAmount: 0, // Start with empty pool
    targetAmount: body.targetAmount || null,
    transactions: [], // Empty transaction history
    status: body.status || 'active',
    priority: body.priority || 'medium',
    notes: body.notes?.trim() || null,
    createdAt: now,
    updatedAt: now,
  };

  const docRef = await db.collection(`users/${userId}/projects`).add(projectData);

  return NextResponse.json({ id: docRef.id, ...projectData }, { status: 201 });
}
