import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * DELETE /api/memberships/[id]
 * Leave a shared event (remove membership)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: membershipId } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const userId = session.user.id;
  const db = getAdminDb();

  // Get the membership to find the event details
  const membershipRef = db
    .collection('users')
    .doc(userId)
    .collection('memberships')
    .doc(membershipId);

  const membershipDoc = await membershipRef.get();
  if (!membershipDoc.exists) {
    return NextResponse.json({ error: 'Membership not found' }, { status: 404 });
  }

  const membership = membershipDoc.data()!;
  const { ownerId, eventId } = membership;

  // Get the event to remove the member
  const eventRef = db
    .collection('users')
    .doc(ownerId)
    .collection('events')
    .doc(eventId);

  const eventDoc = await eventRef.get();
  if (!eventDoc.exists) {
    // Event was deleted, just remove the membership
    await membershipRef.delete();
    return NextResponse.json({ message: 'Left event (event no longer exists)' });
  }

  const eventData = eventDoc.data()!;
  const members = eventData.members || [];

  // Find and remove the member
  const updatedMembers = members.filter((m: { userId: string }) => m.userId !== userId);

  // Use batch write for atomicity
  const batch = db.batch();

  // Update event members
  batch.update(eventRef, {
    members: updatedMembers,
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Delete membership
  batch.delete(membershipRef);

  await batch.commit();

  return NextResponse.json({ message: 'Left event successfully' });
}
