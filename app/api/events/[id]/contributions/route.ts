import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

// GET /api/events/[id]/contributions - List contributions
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await withAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const { id } = await params;
    const eventRef = getAdminDb().collection(`users/${userId}/events`).doc(id);
    const eventSnap = await eventRef.get();

    if (!eventSnap.exists) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const event = eventSnap.data();
    const contributions = event?.contributions || [];

    return NextResponse.json({ contributions });
  } catch (error) {
    console.error('Failed to fetch contributions:', error);
    return NextResponse.json({ error: 'Failed to fetch contributions' }, { status: 500 });
  }
}

// POST /api/events/[id]/contributions - Add contribution
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await withAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const { id } = await params;
    const body = await request.json();
    const { type, amount, itemDescription, contributorName, date, note } = body;

    if (!type || (type !== 'cash' && type !== 'item')) {
      return NextResponse.json({ error: 'Type must be "cash" or "item"' }, { status: 400 });
    }

    if (type === 'cash' && (!amount || amount <= 0)) {
      return NextResponse.json({ error: 'Cash contribution requires a positive amount' }, { status: 400 });
    }

    if (type === 'item' && !itemDescription?.trim()) {
      return NextResponse.json({ error: 'Item contribution requires a description' }, { status: 400 });
    }

    const eventRef = getAdminDb().collection(`users/${userId}/events`).doc(id);
    const eventSnap = await eventRef.get();

    if (!eventSnap.exists) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const contribution = {
      id: `contrib-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      type,
      amount: type === 'cash' ? amount : null,
      itemDescription: type === 'item' ? itemDescription.trim() : null,
      contributorName: contributorName?.trim() || null,
      date: date ? new Date(date) : new Date(),
      note: note?.trim() || null,
    };

    await eventRef.update({
      contributions: FieldValue.arrayUnion(contribution),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json(contribution, { status: 201 });
  } catch (error) {
    console.error('Failed to add contribution:', error);
    return NextResponse.json({ error: 'Failed to add contribution' }, { status: 500 });
  }
}
