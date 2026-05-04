/**
 * Notification Service Cloud Function
 *
 * Runs daily at 08:00 SAST to:
 * - Check pay day proximity (3-day warning)
 * - Check unpaid items 48hr post-payday
 * - Check goal milestones (25%, 50%, 75%, 100%)
 * - Check investment maturity within 90 days
 * - Generate in-app alert/achievement Insights
 * - Send FCM push notifications where notificationsEnabled = true
 * - Enforce 7-day dedup per notification type per target
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();
const messaging = admin.messaging();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserProfile {
  preferences?: {
    payDayType?: 'fixed' | 'last_working_day';
    payDayFixed?: number;
    notificationsEnabled?: boolean;
  };
  fcmToken?: string;
}

interface Goal {
  id: string;
  name: string;
  type: string;
  targetAmount: number;
  currentAmount: number;
  status: string;
  investmentTracking?: {
    maturityDate: admin.firestore.Timestamp;
  };
}

interface CycleItem {
  id: string;
  label: string;
  amount: number;
  status: string;
  category: string;
}

// ---------------------------------------------------------------------------
// SA Public Holidays (fixed dates MM-DD)
// ---------------------------------------------------------------------------

const SA_FIXED_HOLIDAYS = [
  '01-01', '03-21', '04-27', '05-01', '06-16',
  '08-09', '09-24', '12-16', '12-25', '12-26',
];

function computeEaster(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function isPublicHoliday(date: Date): boolean {
  const mmdd = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  if (SA_FIXED_HOLIDAYS.includes(mmdd)) return true;
  const easter = computeEaster(date.getFullYear());
  const gf = new Date(easter); gf.setDate(easter.getDate() - 2);
  const em = new Date(easter); em.setDate(easter.getDate() + 1);
  return isSameDay(date, gf) || isSameDay(date, em);
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getPayDay(year: number, month: number, prefs: UserProfile['preferences']): Date {
  if (prefs?.payDayType === 'fixed' && prefs.payDayFixed) {
    return new Date(year, month - 1, prefs.payDayFixed);
  }
  // Last working day
  const candidate = new Date(year, month, 0);
  while (candidate.getDay() === 0 || candidate.getDay() === 6 || isPublicHoliday(candidate)) {
    candidate.setDate(candidate.getDate() - 1);
  }
  return candidate;
}

// ---------------------------------------------------------------------------
// Dedup helper — check if notification was sent within 7 days
// ---------------------------------------------------------------------------

async function wasRecentlySent(userId: string, notifType: string, targetId: string): Promise<boolean> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const snap = await db
    .collection(`users/${userId}/insights`)
    .where('data.notifType', '==', notifType)
    .where('data.targetId', '==', targetId)
    .where('createdAt', '>', admin.firestore.Timestamp.fromDate(sevenDaysAgo))
    .limit(1)
    .get();
  return !snap.empty;
}

// ---------------------------------------------------------------------------
// FCM push helper
// ---------------------------------------------------------------------------

async function sendPush(token: string, title: string, body: string): Promise<void> {
  try {
    await messaging.send({ token, notification: { title, body }, android: { priority: 'high' }, apns: { payload: { aps: { sound: 'default' } } } });
  } catch (err) {
    logger.warn('FCM send failed', err);
  }
}

// ---------------------------------------------------------------------------
// Create in-app insight
// ---------------------------------------------------------------------------

async function createInsight(
  userId: string,
  type: 'alert' | 'achievement',
  title: string,
  message: string,
  data: Record<string, unknown>
): Promise<void> {
  await db.collection(`users/${userId}/insights`).add({
    type,
    title,
    message,
    data,
    isRead: false,
    isDismissed: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// ---------------------------------------------------------------------------
// Main scheduled function
// ---------------------------------------------------------------------------

export const notificationService = onSchedule(
  { schedule: 'every 24 hours', timeZone: 'Africa/Johannesburg' },
  async () => {
    logger.info('Notification Service started');

    try {
      const usersSnapshot = await db.collection('users').get();

      for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;
        const userData = userDoc.data() as UserProfile;
        const notificationsEnabled = userData.preferences?.notificationsEnabled ?? false;
        const fcmToken = userData.fcmToken;

        try {
          await processUser(userId, userData, notificationsEnabled, fcmToken);
        } catch (err) {
          logger.error(`Failed to process user ${userId}`, err);
        }
      }

      logger.info('Notification Service completed');
    } catch (error) {
      logger.error('Notification Service failed', error);
      throw error;
    }
  }
);

async function processUser(
  userId: string,
  profile: UserProfile,
  notificationsEnabled: boolean,
  fcmToken?: string
): Promise<void> {
  const now = new Date();
  const prefs = profile.preferences;

  // ── 1. Pay day proximity (3-day warning) ──────────────────────────────────
  const payDay = getPayDay(now.getFullYear(), now.getMonth() + 1, prefs);
  const daysUntilPayDay = Math.ceil((payDay.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysUntilPayDay >= 1 && daysUntilPayDay <= 3) {
    const notifType = 'payday_warning';
    const targetId = `${now.getFullYear()}-${now.getMonth() + 1}`;

    if (!(await wasRecentlySent(userId, notifType, targetId))) {
      // Count pending items in current cycle
      const currentCycleId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const pendingSnap = await db
        .collection(`users/${userId}/cycleItems`)
        .where('cycleId', '==', currentCycleId)
        .where('status', '==', 'upcoming')
        .get();

      const pendingCount = pendingSnap.size;
      const title = `Pay day in ${daysUntilPayDay} day${daysUntilPayDay !== 1 ? 's' : ''}`;
      const message = pendingCount > 0
        ? `You have ${pendingCount} unpaid item${pendingCount !== 1 ? 's' : ''} this cycle.`
        : 'All items are paid — great work!';

      await createInsight(userId, 'alert', title, message, { notifType, targetId });

      if (notificationsEnabled && fcmToken) {
        await sendPush(fcmToken, title, message);
      }
    }
  }

  // ── 2. Unpaid items 48hr post-payday ──────────────────────────────────────
  const hoursSincePayDay = (now.getTime() - payDay.getTime()) / (1000 * 60 * 60);

  if (hoursSincePayDay >= 48 && hoursSincePayDay < 72) {
    const notifType = 'post_payday_unpaid';
    const targetId = `${now.getFullYear()}-${now.getMonth() + 1}`;

    if (!(await wasRecentlySent(userId, notifType, targetId))) {
      const currentCycleId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const unpaidSnap = await db
        .collection(`users/${userId}/cycleItems`)
        .where('cycleId', '==', currentCycleId)
        .where('status', 'in', ['upcoming', 'due'])
        .get();

      if (!unpaidSnap.empty) {
        const labels = unpaidSnap.docs.slice(0, 3).map((d) => (d.data() as CycleItem).label).join(', ');
        const count = unpaidSnap.size;
        const title = `${count} item${count !== 1 ? 's' : ''} still unpaid`;
        const message = `${labels}${count > 3 ? ` and ${count - 3} more` : ''} haven't been marked paid yet.`;

        await createInsight(userId, 'alert', title, message, { notifType, targetId });

        if (notificationsEnabled && fcmToken) {
          await sendPush(fcmToken, title, message);
        }
      }
    }
  }

  // ── 3. Goal milestones (25%, 50%, 75%, 100%) ─────────────────────────────
  const goalsSnap = await db
    .collection(`users/${userId}/goals`)
    .where('status', '==', 'active')
    .get();

  for (const goalDoc of goalsSnap.docs) {
    const goal = { id: goalDoc.id, ...goalDoc.data() } as Goal;
    if (!goal.targetAmount || goal.targetAmount === 0) continue;

    const progress = goal.currentAmount / goal.targetAmount;
    const milestones = [0.25, 0.5, 0.75, 1.0];

    for (const milestone of milestones) {
      if (progress >= milestone) {
        const notifType = `goal_milestone_${Math.round(milestone * 100)}`;
        if (!(await wasRecentlySent(userId, notifType, goal.id))) {
          const pct = Math.round(milestone * 100);
          const isComplete = milestone === 1.0;
          const title = isComplete ? `🎉 ${goal.name} Complete!` : `${goal.name} — ${pct}% reached`;
          const message = isComplete
            ? `You've reached your goal of R${(goal.targetAmount / 100).toLocaleString('en-ZA')}!`
            : `You're ${pct}% of the way to your R${(goal.targetAmount / 100).toLocaleString('en-ZA')} goal.`;

          await createInsight(userId, 'achievement', title, message, { notifType, targetId: goal.id, goalName: goal.name, milestone: pct });

          if (notificationsEnabled && fcmToken) {
            await sendPush(fcmToken, title, message);
          }
        }
      }
    }

    // ── 4. Investment maturity within 90 days ─────────────────────────────
    if (goal.type === 'investment' && goal.investmentTracking?.maturityDate) {
      const maturityDate = goal.investmentTracking.maturityDate.toDate();
      const daysToMaturity = Math.ceil((maturityDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysToMaturity > 0 && daysToMaturity <= 90) {
        const notifType = 'investment_maturity';
        if (!(await wasRecentlySent(userId, notifType, goal.id))) {
          const title = `${goal.name} matures in ${daysToMaturity} days`;
          const message = `Your investment matures on ${maturityDate.toLocaleDateString('en-ZA')}. Plan what to do with the funds.`;

          await createInsight(userId, 'alert', title, message, { notifType, targetId: goal.id, daysToMaturity });

          if (notificationsEnabled && fcmToken) {
            await sendPush(fcmToken, title, message);
          }
        }
      }
    }
  }

  logger.info(`Processed notifications for user ${userId}`);
}
