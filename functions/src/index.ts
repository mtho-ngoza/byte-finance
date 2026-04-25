/**
 * ByteFinance Cloud Functions
 *
 * Entry point that exports all scheduled functions:
 * - trendAnalyzer: Nightly aggregation and trend insights
 * - smartAdvisor: Weekly AI-powered recommendations
 * - notificationService: Daily alerts and reminders
 */

import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK
admin.initializeApp();

// Export scheduled functions
// These are placeholders - implementation comes in Phase 2

export { trendAnalyzer } from './trend-analyzer';
export { smartAdvisor } from './smart-advisor';
export { notificationService } from './notification-service';
