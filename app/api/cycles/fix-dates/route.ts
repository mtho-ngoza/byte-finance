import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getPaydayForMonth } from '@/lib/payday-utils';

/**
 * POST /api/cycles/fix-dates
 *
 * Recalculates and fixes dates for all cycles based on:
 * 1. Actual income.receivedDate if set (priority)
 * 2. Calculated last working day as fallback
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

    // Get all cycles
    const cyclesSnap = await db
      .collection(`users/${userId}/cycles`)
      .get();

    // Build a map of cycle ID to actual payday (from income.receivedDate)
    const cyclePaydays = new Map<string, Date>();

    for (const doc of cyclesSnap.docs) {
      const data = doc.data();
      const cycleId = doc.id;

      // Parse cycle ID to get year and month
      const match = cycleId.match(/^(\d{4})-(\d{2})$/);
      if (!match) continue;

      const cycleYear = parseInt(match[1], 10);
      const cycleMonth = parseInt(match[2], 10);

      // Priority 1: Use actual income.receivedDate if set
      if (data.income?.receivedDate) {
        const receivedDate = data.income.receivedDate.toDate
          ? data.income.receivedDate.toDate()
          : new Date(data.income.receivedDate);
        cyclePaydays.set(cycleId, receivedDate);
      } else {
        // Priority 2: Calculate based on user's payday settings
        // For this cycle (e.g., September), the payday is the previous month's last working day
        // which FUNDS this cycle. So September's payday is August's last working day.
        const prevMonth = cycleMonth === 1 ? 12 : cycleMonth - 1;
        const prevYear = cycleMonth === 1 ? cycleYear - 1 : cycleYear;
        const calculatedPayday = getPaydayForMonth(prevYear, prevMonth, payDayType, payDayFixed);
        cyclePaydays.set(cycleId, calculatedPayday);
      }
    }

    // Helper to get next cycle ID
    const getNextCycleId = (cycleId: string): string => {
      const [year, month] = cycleId.split('-').map(Number);
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
    };

    // Helper to get payday for a cycle (uses actual if set, otherwise calculates)
    const getPaydayForCycle = (cycleId: string): Date => {
      if (cyclePaydays.has(cycleId)) {
        return cyclePaydays.get(cycleId)!;
      }
      // Calculate fallback
      const [year, month] = cycleId.split('-').map(Number);
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;
      return getPaydayForMonth(prevYear, prevMonth, payDayType, payDayFixed);
    };

    // Helper to get the end date for a cycle (day before next cycle's payday)
    const getEndDateForCycle = (cycleId: string): Date => {
      const nextCycleId = getNextCycleId(cycleId);
      const nextPayday = getPaydayForCycle(nextCycleId);

      // If next cycle has actual receivedDate, use that; otherwise calculate
      let nextActualPayday: Date;
      if (cyclePaydays.has(nextCycleId)) {
        nextActualPayday = cyclePaydays.get(nextCycleId)!;
      } else {
        // Calculate this month's payday (the one that ends this cycle)
        const [year, month] = cycleId.split('-').map(Number);
        nextActualPayday = getPaydayForMonth(year, month, payDayType, payDayFixed);
      }

      // End date = next payday - 1
      const endDate = new Date(nextActualPayday);
      endDate.setDate(endDate.getDate() - 1);
      endDate.setHours(23, 59, 59, 999);
      return endDate;
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

      // Parse cycle ID
      const match = cycleId.match(/^(\d{4})-(\d{2})$/);
      if (!match) continue;

      // Get start date (this cycle's payday from the map)
      const startDate = new Date(cyclePaydays.get(cycleId)!);
      startDate.setHours(0, 0, 0, 0);

      // Get end date (day before next cycle starts)
      const endDate = getEndDateForCycle(cycleId);

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
          usedActualPayday: !!data.income?.receivedDate,
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
