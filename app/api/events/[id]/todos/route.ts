import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

/**
 * POST /api/events/[id]/todos
 * Add a todo to an event
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

  // Validate required fields
  if (!body.title?.trim()) {
    return NextResponse.json({ error: 'Todo title is required' }, { status: 400 });
  }

  const db = getAdminDb();
  const docRef = db.collection(`users/${userId}/events`).doc(id);
  const doc = await docRef.get();

  if (!doc.exists) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const todos = doc.data()?.todos || [];

  // Generate todo ID
  const todoId = `todo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const newTodo = {
    id: todoId,
    title: body.title.trim(),
    completed: false,
    sortOrder: todos.length,
    createdAt: Timestamp.now(),
  };

  await docRef.update({
    todos: FieldValue.arrayUnion(newTodo),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json(newTodo, { status: 201 });
}
