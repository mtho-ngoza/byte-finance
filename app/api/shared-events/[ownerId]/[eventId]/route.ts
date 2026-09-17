import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';

/**
 * GET /api/shared-events/[ownerId]/[eventId]
 * Get a shared event that the current user is a member of
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ownerId: string; eventId: string }> }
) {
  const { ownerId, eventId } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const userId = session.user.id;
  const db = getAdminDb();

  // Get the event
  const eventRef = db
    .collection('users')
    .doc(ownerId)
    .collection('events')
    .doc(eventId);

  const eventDoc = await eventRef.get();
  if (!eventDoc.exists) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const eventData = eventDoc.data()!;

  // Check if user is owner or member
  const isOwner = ownerId === userId;
  const isMember = (eventData.members || []).some(
    (m: { userId: string }) => m.userId === userId
  );

  if (!isOwner && !isMember) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  // Get user's role
  const member = (eventData.members || []).find(
    (m: { userId: string }) => m.userId === userId
  );
  const role = isOwner ? 'owner' : member?.role || 'viewer';

  // Compute totals
  const items = eventData.items || [];
  let totalQuoted = 0;
  let totalPaid = 0;
  let paidCount = 0;

  for (const item of items) {
    const subtotal = (item.unitPrice || 0) * (item.quantity || 1);
    totalQuoted += subtotal;

    const itemPaid = (item.payments || []).reduce(
      (sum: number, p: { amount: number }) => sum + (p.amount || 0),
      0
    );
    totalPaid += itemPaid;

    if (item.status === 'paid') {
      paidCount++;
    }
  }

  return NextResponse.json({
    id: eventId,
    ownerId,
    name: eventData.name,
    description: eventData.description,
    eventDate: eventData.eventDate,
    status: eventData.status,
    categories: eventData.categories || [],
    items: eventData.items || [],
    members: eventData.members || [],
    // Computed values
    totalQuoted,
    totalPaid,
    remaining: totalQuoted - totalPaid,
    itemCount: items.length,
    paidCount,
    // User's access
    role,
    isOwner,
  });
}
