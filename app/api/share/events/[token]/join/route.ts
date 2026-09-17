import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { findEventByShareToken } from '@/lib/share-auth';
import { FieldValue } from 'firebase-admin/firestore';
import { createActivityEntry } from '@/lib/event-activity';

/**
 * POST /api/share/events/[token]/join
 * Join an event as a member via share link (requires authentication)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // Require authentication
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const userId = session.user.id;
  const userEmail = session.user.email;
  const userName = session.user.name || undefined;

  // Find the event by share token
  const result = await findEventByShareToken(token);
  if (!result) {
    return NextResponse.json({ error: 'Event not found or share link expired' }, { status: 404 });
  }

  const { userId: ownerId, eventId, eventData, eventRef } = result;

  // Check if user is the owner
  if (ownerId === userId) {
    return NextResponse.json({ error: 'You are the owner of this event' }, { status: 400 });
  }

  // Check if already a member
  const existingMembers = eventData.members || [];
  const alreadyMember = existingMembers.some((m: { userId: string }) => m.userId === userId);
  if (alreadyMember) {
    return NextResponse.json({
      message: 'Already a member',
      ownerId,
      eventId,
    });
  }

  const db = getAdminDb();
  const now = FieldValue.serverTimestamp();

  // Create member entry
  const newMember = {
    userId,
    email: userEmail,
    name: userName,
    role: 'editor' as const,
    joinedAt: now,
    joinedVia: 'share_link' as const,
  };

  // Create membership reference in user's collection
  const membershipRef = db.collection('users').doc(userId).collection('memberships').doc();
  const membership = {
    ownerId,
    eventId,
    eventName: eventData.name,
    role: 'editor',
    joinedAt: now,
  };

  const activity = createActivityEntry({
    type: 'member_joined',
    actorId: userId,
    actorName: userName || userEmail,
    details: { email: userEmail, role: 'editor' },
  });

  // Use batch write for atomicity
  const batch = db.batch();

  // Add member to event
  batch.update(eventRef, {
    members: FieldValue.arrayUnion(newMember),
    activities: FieldValue.arrayUnion(activity),
    // Ensure ownerId is set (for existing events without it)
    ownerId: ownerId,
    updatedAt: now,
  });

  // Add membership to user's collection
  batch.set(membershipRef, membership);

  await batch.commit();

  return NextResponse.json({
    message: 'Joined successfully',
    membershipId: membershipRef.id,
    ownerId,
    eventId,
    eventName: eventData.name,
  });
}
