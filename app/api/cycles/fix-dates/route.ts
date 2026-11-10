import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getCycleDateRange } from '@/lib/payday-utils';

/**
 * POST /api/cycles/fix-dates
 *
 * Recalculates and fixes dates for all cycles based on user's payday settings
 */
export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const db = getAdminDb();
  const now = FieldValue.serverTimestamp();

  // Get user settings for payday
  const settingsSnap = await db.collection(`users/${userId}/settings`).doc('preferences').get();
  const settings = settingsSnap.data() || {};
  const payDayType = settings.payDayType || 'fixed';
  const payDayFixed = settings.payDayFixed || 29;

  // Get all cycles
  const cyclesSnap = await db
    .collection(`users/${userId}/cycles`)
    .get();

  const batch = db.batch();
  const fixes: Array<{
    cycleId: string;
    oldStart: string;
    oldEnd: string;
    newStart: string;
    newEnd: string;
  }> = [];

  for (const doc of cyclesSnap.docs) {
    const cycleId = doc.id;
    const data = doc.data();

    // Parse cycle ID to get year and month
    const match = cycleId.match(/^(\d{4})-(\d{2})$/);
    if (!match) continue;

    const cycleYear = parseInt(match[1], 10);
    const cycleMonth = parseInt(match[2], 10);

    // Calculate correct dates
    const { startDate, endDate } = getCycleDateRange(cycleYear, cycleMonth, payDayType, payDayFixed);

    const oldStart = data.startDate?.toDate?.()?.toISOString?.() || 'unknown';
    const oldEnd = data.endDate?.toDate?.()?.toISOString?.() || 'unknown';
    const newStart = startDate.toISOString();
    const newEnd = endDate.toISOString();

    // Only update if dates are different
    if (oldStart !== newStart || oldEnd !== newEnd) {
      batch.update(doc.ref, {
        startDate: Timestamp.fromDate(startDate),
        endDate: Timestamp.fromDate(endDate),
        updatedAt: now,
      });

      fixes.push({
        cycleId,
        oldStart,
        oldEnd,
        newStart,
        newEnd,
      });
    }
  }

  if (fixes.length > 0) {
    await batch.commit();
  }

  return NextResponse.json({
    success: true,
    fixedCount: fixes.length,
    totalCycles: cyclesSnap.size,
    payDaySettings: { payDayType, payDayFixed },
    fixes,
  });
}
