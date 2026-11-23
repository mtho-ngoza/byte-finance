import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getPaydayForMonth, getCycleDateRange } from '@/lib/payday-utils';

/**
 * POST /api/cycles/fix-dates
 *
 * Recalculates and fixes dates for all cycles based on:
 * 1. Actual income.receivedDate if set (priority)
 * 2. Calculated using getCycleDateRange as fallback (tested utility)
 *
 * Logic:
 * - Cycle START = previous month's payday (actual or calculated)
 * - Cycle END = this month's payday - 1 day (actual or calculated)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await withAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const db = getAdminDb();
    const now = FieldValue.serverTimestamp();

    // Get user profile for fallback payday settings
    const userDoc = await db.doc(`users/${userId}`).get();
    const userData = userDoc.data() || {};
    const preferences = userData.preferences || {};
    const payDayType = preferences.payDayType || 'last_working_day';
    const payDayFixed = preferences.payDayFixed;

    // Get all cycles ordered by ID to process in sequence
    const cyclesSnap = await db
      .collection(`users/${userId}/cycles`)
      .orderBy('__name__')
      .get();

    // Build a map of cycle ID to actual payday (from income.receivedDate)
    // This is the payday that FUNDS/STARTS each cycle
    const actualPaydays = new Map<string, Date>();

    for (const doc of cyclesSnap.docs) {
      const data = doc.data();
      const cycleId = doc.id;

      // Only store if actual income.receivedDate is set
      if (data.income?.receivedDate) {
        const receivedDate = data.income.receivedDate.toDate
          ? data.income.receivedDate.toDate()
          : new Date(data.income.receivedDate);
        actualPaydays.set(cycleId, receivedDate);
      }
    }

    // Helper to get next cycle ID
    const getNextCycleId = (cycleId: string): string => {
      const [year, month] = cycleId.split('-').map(Number);
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
    };

    const batch = db.batch();
    const fixes: Array<{
      cycleId: string;
      oldStart: string;
      oldEnd: string;
      newStart: string;
      newEnd: string;
      usedActualPayday: boolean;
    }> = [];

    for (const doc of cyclesSnap.docs) {
      const cycleId = doc.id;
      const data = doc.data();

      // Parse cycle ID to get year and month
      const match = cycleId.match(/^(\d{4})-(\d{2})$/);
      if (!match) continue;

      const cycleYear = parseInt(match[1], 10);
      const cycleMonth = parseInt(match[2], 10);

      let startDate: Date;
      let endDate: Date;
      const usedActualPayday = actualPaydays.has(cycleId);

      if (usedActualPayday) {
        // Use actual income.receivedDate for start
        // Extract date components to avoid timezone issues
        const actualStart = actualPaydays.get(cycleId)!;
        startDate = new Date(actualStart.getFullYear(), actualStart.getMonth(), actualStart.getDate(), 0, 0, 0, 0);

        // For end date: check if next cycle has actual payday, otherwise calculate
        const nextCycleId = getNextCycleId(cycleId);
        let nextPayday: Date;
        if (actualPaydays.has(nextCycleId)) {
          // Next cycle has actual payday
          nextPayday = actualPaydays.get(nextCycleId)!;
        } else {
          // Calculate this month's payday for end date
          nextPayday = getPaydayForMonth(cycleYear, cycleMonth, payDayType, payDayFixed);
        }
        // End date = day BEFORE next payday (extract date parts to avoid timezone issues)
        endDate = new Date(nextPayday.getFullYear(), nextPayday.getMonth(), nextPayday.getDate() - 1, 23, 59, 59, 999);
      } else {
        // Use the tested getCycleDateRange utility
        const range = getCycleDateRange(cycleYear, cycleMonth, payDayType, payDayFixed);
        startDate = range.startDate;
        endDate = range.endDate;
      }

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
          usedActualPayday,
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
  } catch (error) {
    console.error('Error fixing cycle dates:', error);
    return NextResponse.json(
      { error: 'Failed to fix cycle dates' },
      { status: 500 }
    );
  }
}
