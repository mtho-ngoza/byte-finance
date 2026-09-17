import { NextRequest, NextResponse } from 'next/server';
import { findEventByShareToken } from '@/lib/share-auth';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

/**
 * POST /api/share/events/[token]/todos
 * Add a todo to a shared event
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = await request.json();

  // Validate required fields
  if (!body.title?.trim()) {
    return NextResponse.json({ error: 'Todo title is required' }, { status: 400 });
  }

  const result = await findEventByShareToken(token);

  if (!result) {
    return NextResponse.json({ error: 'Event not found or share link expired' }, { status: 404 });
  }

  const { eventRef, eventData } = result;
  const todos = eventData.todos || [];

  // Generate todo ID
  const todoId = `todo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const newTodo = {
    id: todoId,
    title: body.title.trim(),
    completed: false,
    sortOrder: todos.length,
    createdAt: Timestamp.now(),
  };

  await eventRef.update({
    todos: FieldValue.arrayUnion(newTodo),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json(newTodo, { status: 201 });
}
