import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

// PATCH /api/events/[id]/contributions/[contributionId] - Update contribution
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contributionId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, contributionId } = await params;
    const body = await request.json();
    const { type, amount, itemDescription, contributorName, date, note } = body;

    const eventRef = getAdminDb().collection(`users/${session.user.id}/events`).doc(id);
    const eventSnap = await eventRef.get();

    if (!eventSnap.exists) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const event = eventSnap.data();
    const contributions = event?.contributions || [];
    const index = contributions.findIndex((c: any) => c.id === contributionId);

    if (index === -1) {
      return NextResponse.json({ error: 'Contribution not found' }, { status: 404 });
    }

    // Update contribution
    const updated = {
      ...contributions[index],
      type: type ?? contributions[index].type,
      amount: type === 'cash' ? amount : undefined,
      itemDescription: type === 'item' ? itemDescription?.trim() : undefined,
      contributorName: contributorName?.trim() || undefined,
      date: date ? new Date(date) : contributions[index].date,
      note: note?.trim() || undefined,
    };

    contributions[index] = updated;

    await eventRef.update({
      contributions,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to update contribution:', error);
    return NextResponse.json({ error: 'Failed to update contribution' }, { status: 500 });
  }
}

// DELETE /api/events/[id]/contributions/[contributionId] - Delete contribution
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contributionId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, contributionId } = await params;

    const eventRef = getAdminDb().collection(`users/${session.user.id}/events`).doc(id);
    const eventSnap = await eventRef.get();

    if (!eventSnap.exists) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const event = eventSnap.data();
    const contributions = event?.contributions || [];
    const contribution = contributions.find((c: any) => c.id === contributionId);

    if (!contribution) {
      return NextResponse.json({ error: 'Contribution not found' }, { status: 404 });
    }

    await eventRef.update({
      contributions: FieldValue.arrayRemove(contribution),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete contribution:', error);
    return NextResponse.json({ error: 'Failed to delete contribution' }, { status: 500 });
  }
}
