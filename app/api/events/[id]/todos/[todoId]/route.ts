import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

/**
 * PATCH /api/events/[id]/todos/[todoId]
 * Update a todo (mark complete, rename, reorder)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; todoId: string }> }
) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id, todoId } = await params;
  const body = await request.json();

  const db = getAdminDb();
  const docRef = db.collection(`users/${userId}/events`).doc(id);
  const doc = await docRef.get();

  if (!doc.exists) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const todos = doc.data()?.todos || [];
  const todoIndex = todos.findIndex((t: any) => t.id === todoId);

  if (todoIndex === -1) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  const todo = todos[todoIndex];

  // Update fields
  if (body.title !== undefined) todo.title = body.title.trim();
  if (body.sortOrder !== undefined) todo.sortOrder = body.sortOrder;

  // Handle completion toggle
  if (body.completed !== undefined) {
    todo.completed = body.completed;
    if (body.completed) {
      todo.completedAt = Timestamp.now();
      todo.completedBy = userId;
    } else {
      delete todo.completedAt;
      delete todo.completedBy;
    }
  }

  await docRef.update({
    todos,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json(todo);
}

/**
 * DELETE /api/events/[id]/todos/[todoId]
 * Remove a todo
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; todoId: string }> }
) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id, todoId } = await params;

  const db = getAdminDb();
  const docRef = db.collection(`users/${userId}/events`).doc(id);
  const doc = await docRef.get();

  if (!doc.exists) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const todos = doc.data()?.todos || [];
  const updatedTodos = todos.filter((t: any) => t.id !== todoId);

  if (todos.length === updatedTodos.length) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  await docRef.update({
    todos: updatedTodos,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ success: true });
}
