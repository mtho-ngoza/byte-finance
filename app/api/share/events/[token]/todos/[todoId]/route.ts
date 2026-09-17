import { NextRequest, NextResponse } from 'next/server';
import { findEventByShareToken } from '@/lib/share-auth';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

/**
 * PATCH /api/share/events/[token]/todos/[todoId]
 * Update a todo in a shared event
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; todoId: string }> }
) {
  const { token, todoId } = await params;
  const body = await request.json();

  const result = await findEventByShareToken(token);

  if (!result) {
    return NextResponse.json({ error: 'Event not found or share link expired' }, { status: 404 });
  }

  const { eventRef, eventData } = result;
  const todos = eventData.todos || [];
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
      todo.completedBy = body.completedBy || 'Shared User';
    } else {
      delete todo.completedAt;
      delete todo.completedBy;
    }
  }

  await eventRef.update({
    todos,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json(todo);
}

/**
 * DELETE /api/share/events/[token]/todos/[todoId]
 * Remove a todo from a shared event
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; todoId: string }> }
) {
  const { token, todoId } = await params;

  const result = await findEventByShareToken(token);

  if (!result) {
    return NextResponse.json({ error: 'Event not found or share link expired' }, { status: 404 });
  }

  const { eventRef, eventData } = result;
  const todos = eventData.todos || [];
  const updatedTodos = todos.filter((t: any) => t.id !== todoId);

  if (todos.length === updatedTodos.length) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  await eventRef.update({
    todos: updatedTodos,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ success: true });
}
