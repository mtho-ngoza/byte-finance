import { NextRequest, NextResponse } from 'next/server';
import { findEventByShareToken } from '@/lib/share-auth';

/**
 * GET /api/share/events/[token]
 * Get a shared event by token (public, no auth required)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const result = await findEventByShareToken(token);

  if (!result) {
    return NextResponse.json({ error: 'Event not found or share link expired' }, { status: 404 });
  }

  const { userId, eventId, eventData } = result;
  const items = eventData.items || [];

  // Compute totals
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

  // Return event without sensitive fields
  return NextResponse.json({
    id: eventId,
    ownerId: userId, // Event owner's user ID (for join/membership)
    name: eventData.name,
    description: eventData.description,
    eventDate: eventData.eventDate,
    status: eventData.status,
    categories: eventData.categories || [],
    items: eventData.items || [],
    // Computed values
    totalQuoted,
    totalPaid,
    remaining: totalQuoted - totalPaid,
    itemCount: items.length,
    paidCount,
    // Flag to indicate this is a shared view
    isSharedView: true,
  });
}
