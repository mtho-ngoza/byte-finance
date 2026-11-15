import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { EventContribution } from '@/types';

// PATCH /api/events/[id]/contributions/[contributionId] - Update contribution
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contributionId: string }> }
) {
  try {
    const auth = await withAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const { id, contributionId } = await params;
    const body = await request.json();
    const { type, amount, itemDescription, contributorName, date, note } = body;

    const eventRef = getAdminDb().collection(`users/${userId}/events`).doc(id);
    const eventSnap = await eventRef.get();

    if (!eventSnap.exists) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const event = eventSnap.data();
    const contributions = event?.contributions || [];
    const index = contributions.findIndex((c: EventContribution) => c.id === contributionId);

    if (index === -1) {
      return NextResponse.json({ error: 'Contribution not found' }, { status: 404 });
    }

    // Update contribution
    const updated = {
      ...contributions[index],
      type: type ?? contributions[index].type,
      amount: type === 'cash' ? amount : null,
      itemDescription: type === 'item' ? itemDescription?.trim() : null,
      contributorName: contributorName?.trim() || null,
      date: date ? new Date(date) : contributions[index].date,
      note: note?.trim() || null,
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
    const auth = await withAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const { id, contributionId } = await params;

    const eventRef = getAdminDb().collection(`users/${userId}/events`).doc(id);
    const eventSnap = await eventRef.get();

    if (!eventSnap.exists) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const event = eventSnap.data();
    const contributions = event?.contributions || [];
    const contribution = contributions.find((c: EventContribution) => c.id === contributionId);

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
