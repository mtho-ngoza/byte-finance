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
  const categories = eventData.categories || [];
  const todos = eventData.todos || [];

  // Compute totals
  let totalQuoted = 0;
  let totalPaid = 0;
  let paidCount = 0;
  let partialCount = 0;
  let quotedCount = 0;
  let confirmedCount = 0;
  let cancelledCount = 0;

  // Category breakdown
  const categoryBreakdown: Record<string, { name: string; quoted: number; paid: number; itemCount: number }> = {};
  for (const cat of categories) {
    categoryBreakdown[cat.id] = { name: cat.name, quoted: 0, paid: 0, itemCount: 0 };
  }

  for (const item of items) {
    const subtotal = (item.unitPrice || 0) * (item.quantity || 1);
    totalQuoted += subtotal;

    const itemPaid = (item.payments || []).reduce(
      (sum: number, p: { amount: number }) => sum + (p.amount || 0),
      0
    );
    totalPaid += itemPaid;

    // Status counts
    switch (item.status) {
      case 'paid': paidCount++; break;
      case 'partial': partialCount++; break;
      case 'quoted': quotedCount++; break;
      case 'confirmed': confirmedCount++; break;
      case 'cancelled': cancelledCount++; break;
    }

    // Category breakdown
    if (categoryBreakdown[item.categoryId]) {
      categoryBreakdown[item.categoryId].quoted += subtotal;
      categoryBreakdown[item.categoryId].paid += itemPaid;
      categoryBreakdown[item.categoryId].itemCount++;
    }
  }

  // Todo stats
  const todoTotal = todos.length;
  const todoCompleted = todos.filter((t: any) => t.completed).length;

  // Summary object
  const summary = {
    totals: {
      quoted: totalQuoted,
      paid: totalPaid,
      remaining: totalQuoted - totalPaid,
      progressPercent: totalQuoted > 0 ? Math.round((totalPaid / totalQuoted) * 100) : 0,
    },
    items: {
      total: items.length,
      paid: paidCount,
      partial: partialCount,
      quoted: quotedCount,
      confirmed: confirmedCount,
      cancelled: cancelledCount,
    },
    categories: Object.values(categoryBreakdown),
    todos: {
      total: todoTotal,
      completed: todoCompleted,
      pending: todoTotal - todoCompleted,
      progressPercent: todoTotal > 0 ? Math.round((todoCompleted / todoTotal) * 100) : 0,
    },
  };

  // Return event without sensitive fields (with no-cache headers)
  return NextResponse.json(
    {
      id: eventId,
      ownerId: userId, // Event owner's user ID (for join/membership)
      name: eventData.name,
      description: eventData.description,
      eventDate: eventData.eventDate,
      status: eventData.status,
      categories,
      items,
      todos,
      // Computed values (legacy)
      totalQuoted,
      totalPaid,
      remaining: totalQuoted - totalPaid,
      itemCount: items.length,
      paidCount,
      // New summary object
      summary,
      // Flag to indicate this is a shared view
      isSharedView: true,
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    }
  );
}
