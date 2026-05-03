/**
 * Trend Analyzer Cloud Function
 *
 * Runs nightly to:
 * - Aggregate current cycle data into MonthlySnapshot
 * - Compare against previous month, 3-month average, same month last year
 * - Generate trend Insights for significant changes (>10% YoY)
 * - Generate alert Insights for anomalies (>20% above 3-month avg)
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// Category type matching the app
type Category =
  | 'housing'
  | 'transport'
  | 'family'
  | 'utilities'
  | 'health'
  | 'education'
  | 'savings'
  | 'lifestyle'
  | 'business'
  | 'other';

const ALL_CATEGORIES: Category[] = [
  'housing', 'transport', 'family', 'utilities', 'health',
  'education', 'savings', 'lifestyle', 'business', 'other',
];

interface MonthlySnapshot {
  id: string;
  year: number;
  month: number;
  totalCommitted: number;
  totalPaid: number;
  categoryBreakdown: Record<Category, number>;
  topItems: Array<{ label: string; amount: number }>;
  goalsProgress: number;
}

interface CycleItem {
  cycleId: string;
  label: string;
  amount: number;
  category: Category;
  status: string;
}

export const trendAnalyzer = onSchedule('every 24 hours', async () => {
  logger.info('Trend Analyzer started');

  try {
    // Get all users
    const usersSnapshot = await db.collection('users').get();

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;

      try {
        await processUser(userId);
      } catch (userError) {
        logger.error(`Failed to process user ${userId}`, userError);
        // Continue with other users
      }
    }

    logger.info('Trend Analyzer completed successfully');
  } catch (error) {
    logger.error('Trend Analyzer failed', error);
    throw error;
  }
});

async function processUser(userId: string): Promise<void> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentCycleId = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

  // 1. Generate/update current month's snapshot
  const currentSnapshot = await generateSnapshot(userId, currentCycleId);
  if (!currentSnapshot) {
    logger.info(`No cycle data for user ${userId}, skipping`);
    return;
  }

  // 2. Fetch historical snapshots for comparison
  const previousMonth = getPreviousMonth(currentYear, currentMonth);
  const threeMonthsAgo = getMonthsAgo(currentYear, currentMonth, 3);
  const lastYear = { year: currentYear - 1, month: currentMonth };

  const [prevSnapshot, threeMonthSnapshots, lastYearSnapshot] = await Promise.all([
    getSnapshot(userId, previousMonth.year, previousMonth.month),
    getSnapshotsRange(userId, threeMonthsAgo, previousMonth),
    getSnapshot(userId, lastYear.year, lastYear.month),
  ]);

  // 3. Generate insights
  const insights: Array<{
    type: 'trend' | 'alert';
    title: string;
    message: string;
    data: Record<string, unknown>;
  }> = [];

  // Compare with previous month
  if (prevSnapshot) {
    const monthChange = calculatePercentChange(prevSnapshot.totalPaid, currentSnapshot.totalPaid);
    if (Math.abs(monthChange) > 15) {
      insights.push({
        type: 'trend',
        title: monthChange > 0 ? 'Spending Up' : 'Spending Down',
        message: `Your spending is ${Math.abs(monthChange).toFixed(0)}% ${monthChange > 0 ? 'higher' : 'lower'} than last month.`,
        data: {
          currentAmount: currentSnapshot.totalPaid,
          previousAmount: prevSnapshot.totalPaid,
          changePercent: monthChange,
          comparisonType: 'previous_month',
        },
      });
    }
  }

  // Compare with same month last year (YoY)
  if (lastYearSnapshot) {
    const yoyChange = calculatePercentChange(lastYearSnapshot.totalPaid, currentSnapshot.totalPaid);
    if (Math.abs(yoyChange) > 10) {
      insights.push({
        type: 'trend',
        title: yoyChange > 0 ? 'Year-over-Year Increase' : 'Year-over-Year Decrease',
        message: `Compared to ${getMonthName(currentMonth)} last year, your spending is ${Math.abs(yoyChange).toFixed(0)}% ${yoyChange > 0 ? 'higher' : 'lower'}.`,
        data: {
          currentAmount: currentSnapshot.totalPaid,
          lastYearAmount: lastYearSnapshot.totalPaid,
          changePercent: yoyChange,
          comparisonType: 'year_over_year',
        },
      });
    }
  }

  // Compare with 3-month average (anomaly detection)
  if (threeMonthSnapshots.length >= 2) {
    const avgPaid = threeMonthSnapshots.reduce((sum, s) => sum + s.totalPaid, 0) / threeMonthSnapshots.length;
    const anomalyChange = calculatePercentChange(avgPaid, currentSnapshot.totalPaid);

    if (anomalyChange > 20) {
      insights.push({
        type: 'alert',
        title: 'Unusual Spending',
        message: `Your spending this month is ${anomalyChange.toFixed(0)}% above your 3-month average. Consider reviewing your expenses.`,
        data: {
          currentAmount: currentSnapshot.totalPaid,
          averageAmount: avgPaid,
          changePercent: anomalyChange,
          comparisonType: 'three_month_avg',
        },
      });
    }
  }

  // Category-level analysis
  for (const category of ALL_CATEGORIES) {
    const currentCatAmount = currentSnapshot.categoryBreakdown[category] || 0;
    if (currentCatAmount === 0) continue;

    // Compare category with 3-month average
    if (threeMonthSnapshots.length >= 2) {
      const avgCatAmount = threeMonthSnapshots.reduce(
        (sum, s) => sum + (s.categoryBreakdown[category] || 0), 0
      ) / threeMonthSnapshots.length;

      if (avgCatAmount > 0) {
        const catChange = calculatePercentChange(avgCatAmount, currentCatAmount);
        if (catChange > 30) {
          insights.push({
            type: 'alert',
            title: `${capitalizeFirst(category)} Spike`,
            message: `Your ${category} spending is ${catChange.toFixed(0)}% higher than usual.`,
            data: {
              category,
              currentAmount: currentCatAmount,
              averageAmount: avgCatAmount,
              changePercent: catChange,
            },
          });
        }
      }
    }
  }

  // 4. Save insights to Firestore
  const batch = db.batch();
  const insightsRef = db.collection(`users/${userId}/insights`);

  for (const insight of insights) {
    // Check for duplicate (same type and comparison in last 24h)
    const existingQuery = await insightsRef
      .where('type', '==', insight.type)
      .where('data.comparisonType', '==', insight.data.comparisonType || null)
      .where('createdAt', '>', admin.firestore.Timestamp.fromDate(
        new Date(Date.now() - 24 * 60 * 60 * 1000)
      ))
      .limit(1)
      .get();

    if (existingQuery.empty) {
      const docRef = insightsRef.doc();
      batch.set(docRef, {
        type: insight.type,
        title: insight.title,
        message: insight.message,
        data: insight.data,
        isRead: false,
        isDismissed: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }

  await batch.commit();
  logger.info(`Generated ${insights.length} insights for user ${userId}`);
}

async function generateSnapshot(userId: string, cycleId: string): Promise<MonthlySnapshot | null> {
  // Check if cycle exists
  const cycleDoc = await db.doc(`users/${userId}/cycles/${cycleId}`).get();
  if (!cycleDoc.exists) return null;

  // Get cycle items
  const itemsSnap = await db
    .collection(`users/${userId}/cycleItems`)
    .where('cycleId', '==', cycleId)
    .get();

  const items = itemsSnap.docs.map((d) => d.data() as CycleItem);

  // Calculate totals
  const totalCommitted = items.reduce((sum, item) => sum + item.amount, 0);
  const totalPaid = items
    .filter((item) => item.status === 'paid')
    .reduce((sum, item) => sum + item.amount, 0);

  // Calculate category breakdown
  const categoryBreakdown: Record<Category, number> = {} as Record<Category, number>;
  ALL_CATEGORIES.forEach((cat) => { categoryBreakdown[cat] = 0; });

  items
    .filter((item) => item.status === 'paid')
    .forEach((item) => {
      categoryBreakdown[item.category] = (categoryBreakdown[item.category] || 0) + item.amount;
    });

  // Get top items
  const topItems = items
    .filter((item) => item.status === 'paid')
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
    .map((item) => ({ label: item.label, amount: item.amount }));

  // Get goals progress
  const goalsSnap = await db
    .collection(`users/${userId}/goals`)
    .where('status', '==', 'active')
    .get();

  let goalsProgress = 0;
  if (!goalsSnap.empty) {
    const goals = goalsSnap.docs.map((d) => d.data() as { currentAmount: number; targetAmount: number });
    const totalTarget = goals.reduce((sum, g) => sum + g.targetAmount, 0);
    const totalCurrent = goals.reduce((sum, g) => sum + g.currentAmount, 0);
    goalsProgress = totalTarget > 0 ? Math.round((totalCurrent / totalTarget) * 100) : 0;
  }

  // Parse year/month
  const [yearStr, monthStr] = cycleId.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  const snapshot: MonthlySnapshot = {
    id: cycleId,
    year,
    month,
    totalCommitted,
    totalPaid,
    categoryBreakdown,
    topItems,
    goalsProgress,
  };

  // Save snapshot
  await db.doc(`users/${userId}/snapshots/${cycleId}`).set({
    ...snapshot,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return snapshot;
}

async function getSnapshot(userId: string, year: number, month: number): Promise<MonthlySnapshot | null> {
  const cycleId = `${year}-${String(month).padStart(2, '0')}`;
  const doc = await db.doc(`users/${userId}/snapshots/${cycleId}`).get();
  return doc.exists ? { id: doc.id, ...doc.data() } as MonthlySnapshot : null;
}

async function getSnapshotsRange(
  userId: string,
  start: { year: number; month: number },
  end: { year: number; month: number }
): Promise<MonthlySnapshot[]> {
  const snapshots: MonthlySnapshot[] = [];
  let current = { ...start };

  while (
    current.year < end.year ||
    (current.year === end.year && current.month <= end.month)
  ) {
    const snapshot = await getSnapshot(userId, current.year, current.month);
    if (snapshot) snapshots.push(snapshot);

    // Move to next month
    current.month++;
    if (current.month > 12) {
      current.month = 1;
      current.year++;
    }
  }

  return snapshots;
}

function getPreviousMonth(year: number, month: number): { year: number; month: number } {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

function getMonthsAgo(year: number, month: number, months: number): { year: number; month: number } {
  let y = year;
  let m = month - months;
  while (m <= 0) {
    m += 12;
    y--;
  }
  return { year: y, month: m };
}

function calculatePercentChange(previous: number, current: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function getMonthName(month: number): string {
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return months[month - 1];
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
