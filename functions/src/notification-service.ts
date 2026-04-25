/**
 * Notification Service Cloud Function
 *
 * Runs daily to:
 * - Check pay day proximity (3-day warning)
 * - Check unpaid items 48hr post-payday
 * - Check goal milestones (25%, 50%, 75%, 100%)
 * - Generate in-app alert Insights
 * - Send FCM push notifications where enabled
 *
 * Implementation: Phase 2
 */

import { onSchedule, ScheduledEvent } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

export const notificationService = onSchedule('every 24 hours', async (event: ScheduledEvent) => {
  logger.info('Notification Service started', { scheduleTime: event.scheduleTime });

  try {
    // Get all users
    const usersSnapshot = await db.collection('users').get();

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      const notificationsEnabled = userData.preferences?.notificationsEnabled ?? false;

      logger.info(`Processing user: ${userId}, notifications: ${notificationsEnabled}`);

      // TODO: Implement in Phase 2
      // 1. Calculate pay day for user
      // 2. Check if within 3-day warning window
      // 3. Check for unpaid items 48hr post-payday
      // 4. Check goal milestones
      // 5. Generate alert Insights
      // 6. Send FCM push if enabled
      // 7. Enforce 7-day dedup per notification type
    }

    logger.info('Notification Service completed successfully');
  } catch (error) {
    logger.error('Notification Service failed', error);
    throw error;
  }
});
