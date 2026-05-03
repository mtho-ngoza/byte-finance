/**
 * Smart Advisor Cloud Function
 *
 * Runs weekly to:
 * - Analyze spending patterns and goal progress
 * - Generate AI-powered recommendations via Gemini API
 * - Create suggestion Insights for savings opportunities
 * - Check goal achievability based on contribution pace
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';

const db = admin.firestore();

// Define the Gemini API key as a secret
const geminiApiKey = defineSecret('GEMINI_API_KEY');

// Types
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

interface MonthlySnapshot {
  id: string;
  year: number;
  month: number;
  totalCommitted: number;
  totalPaid: number;
  categoryBreakdown: Record<Category, number>;
  goalsProgress: number;
}

interface Goal {
  id: string;
  name: string;
  type: 'savings' | 'debt_payoff' | 'investment';
  targetAmount: number;
  currentAmount: number;
  monthlyTarget?: number;
  targetDate?: admin.firestore.Timestamp;
  status: string;
  isOnTrack: boolean;
}

interface Commitment {
  id: string;
  label: string;
  amount: number;
  category: Category;
  isActive: boolean;
}

interface FinancialContext {
  recentSnapshots: MonthlySnapshot[];
  activeGoals: Goal[];
  commitments: Commitment[];
  totalMonthlyCommitments: number;
  averageMonthlySpending: number;
  topCategories: Array<{ category: string; amount: number; percent: number }>;
}

interface AISuggestion {
  title: string;
  message: string;
  priority: 'high' | 'medium' | 'low';
  category?: string;
  actionType?: string;
}

export const smartAdvisor = onSchedule(
  {
    schedule: 'every sunday 08:00',
    timeZone: 'Africa/Johannesburg',
    secrets: [geminiApiKey],
  },
  async () => {
    logger.info('Smart Advisor started');

    const apiKey = geminiApiKey.value();
    if (!apiKey) {
      logger.error('GEMINI_API_KEY secret not configured');
      return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    try {
      const usersSnapshot = await db.collection('users').get();

      for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;

        try {
          await processUser(userId, model);
        } catch (userError) {
          logger.error(`Failed to process user ${userId}`, userError);
        }
      }

      logger.info('Smart Advisor completed successfully');
    } catch (error) {
      logger.error('Smart Advisor failed', error);
      throw error;
    }
  }
);

async function processUser(
  userId: string,
  model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>
): Promise<void> {
  // 1. Gather financial context
  const context = await gatherFinancialContext(userId);

  if (context.recentSnapshots.length === 0 && context.activeGoals.length === 0) {
    logger.info(`No financial data for user ${userId}, skipping`);
    return;
  }

  // 2. Build prompt for Gemini
  const prompt = buildAnalysisPrompt(context);

  // 3. Call Gemini API
  let suggestions: AISuggestion[];
  try {
    const result = await model.generateContent(prompt);
    const response = result.response.text();
    suggestions = parseAIResponse(response);
  } catch (aiError) {
    logger.error(`Gemini API error for user ${userId}`, aiError);
    // Fall back to rule-based suggestions
    suggestions = generateFallbackSuggestions(context);
  }

  // 4. Save suggestions as insights with 7-day expiration
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const batch = db.batch();
  const insightsRef = db.collection(`users/${userId}/insights`);

  for (const suggestion of suggestions) {
    // Check for recent duplicates
    const existingQuery = await insightsRef
      .where('type', '==', 'suggestion')
      .where('title', '==', suggestion.title)
      .where('createdAt', '>', admin.firestore.Timestamp.fromDate(
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      ))
      .limit(1)
      .get();

    if (existingQuery.empty) {
      const docRef = insightsRef.doc();
      batch.set(docRef, {
        type: 'suggestion',
        title: suggestion.title,
        message: suggestion.message,
        data: {
          priority: suggestion.priority,
          category: suggestion.category,
          actionType: suggestion.actionType,
          generatedBy: 'smart-advisor',
        },
        isRead: false,
        isDismissed: false,
        expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }

  await batch.commit();
  logger.info(`Generated ${suggestions.length} suggestions for user ${userId}`);
}

async function gatherFinancialContext(userId: string): Promise<FinancialContext> {
  // Get recent snapshots (last 6 months)
  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);

  const snapshotsQuery = await db
    .collection(`users/${userId}/snapshots`)
    .where('year', '>=', sixMonthsAgo.getFullYear())
    .orderBy('year', 'desc')
    .orderBy('month', 'desc')
    .limit(6)
    .get();

  const recentSnapshots = snapshotsQuery.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as MonthlySnapshot[];

  // Get active goals
  const goalsQuery = await db
    .collection(`users/${userId}/goals`)
    .where('status', '==', 'active')
    .get();

  const activeGoals = goalsQuery.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as Goal[];

  // Get active commitments
  const commitmentsQuery = await db
    .collection(`users/${userId}/commitments`)
    .where('isActive', '==', true)
    .get();

  const commitments = commitmentsQuery.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as Commitment[];

  // Calculate aggregates
  const totalMonthlyCommitments = commitments.reduce((sum, c) => sum + c.amount, 0);

  const averageMonthlySpending = recentSnapshots.length > 0
    ? recentSnapshots.reduce((sum, s) => sum + s.totalPaid, 0) / recentSnapshots.length
    : 0;

  // Top spending categories
  const categoryTotals = new Map<string, number>();
  for (const snapshot of recentSnapshots) {
    for (const [cat, amount] of Object.entries(snapshot.categoryBreakdown || {})) {
      categoryTotals.set(cat, (categoryTotals.get(cat) || 0) + amount);
    }
  }

  const totalSpending = Array.from(categoryTotals.values()).reduce((a, b) => a + b, 0);
  const topCategories = Array.from(categoryTotals.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      percent: totalSpending > 0 ? Math.round((amount / totalSpending) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  return {
    recentSnapshots,
    activeGoals,
    commitments,
    totalMonthlyCommitments,
    averageMonthlySpending,
    topCategories,
  };
}

function buildAnalysisPrompt(context: FinancialContext): string {
  const formatAmount = (cents: number) => `R${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;

  let prompt = `You are a personal finance advisor for a South African user. Analyze their financial data and provide 2-4 actionable suggestions.

## Financial Summary

**Monthly Commitments:** ${formatAmount(context.totalMonthlyCommitments)}
**Average Monthly Spending (6 months):** ${formatAmount(context.averageMonthlySpending)}

### Top Spending Categories
${context.topCategories.map((c) => `- ${c.category}: ${formatAmount(c.amount)} (${c.percent}%)`).join('\n')}

### Active Goals (${context.activeGoals.length})
${context.activeGoals.length > 0
    ? context.activeGoals.map((g) => {
        const progress = g.targetAmount > 0 ? Math.round((g.currentAmount / g.targetAmount) * 100) : 0;
        return `- ${g.name} (${g.type}): ${formatAmount(g.currentAmount)} / ${formatAmount(g.targetAmount)} (${progress}%) - ${g.isOnTrack ? 'On track' : 'Behind'}`;
      }).join('\n')
    : 'No active goals'
  }

### Recent Monthly Spending Trend
${context.recentSnapshots.slice(0, 3).map((s) => {
    const monthName = new Date(s.year, s.month - 1).toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' });
    return `- ${monthName}: ${formatAmount(s.totalPaid)}`;
  }).join('\n')}

## Instructions

Provide 2-4 specific, actionable financial suggestions based on this data. Consider:
1. Spending patterns and potential savings
2. Goal progress and pace
3. Category-specific opportunities
4. South African context (ZAR currency, local considerations)

Format your response as JSON array:
[
  {
    "title": "Short title (max 50 chars)",
    "message": "Detailed suggestion (1-2 sentences)",
    "priority": "high|medium|low",
    "category": "optional category name",
    "actionType": "reduce_spending|increase_savings|adjust_goal|review_commitment"
  }
]

Only output valid JSON, no additional text.`;

  return prompt;
}

function parseAIResponse(response: string): AISuggestion[] {
  try {
    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = response.trim();
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.slice(7);
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith('```')) {
      jsonStr = jsonStr.slice(0, -3);
    }
    jsonStr = jsonStr.trim();

    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed)) {
      logger.warn('AI response is not an array');
      return [];
    }

    return parsed
      .filter((item): item is AISuggestion => {
        return (
          typeof item === 'object' &&
          typeof item.title === 'string' &&
          typeof item.message === 'string' &&
          ['high', 'medium', 'low'].includes(item.priority)
        );
      })
      .slice(0, 4); // Max 4 suggestions
  } catch (error) {
    logger.error('Failed to parse AI response', { response, error });
    return [];
  }
}

function generateFallbackSuggestions(context: FinancialContext): AISuggestion[] {
  const suggestions: AISuggestion[] = [];

  // Check goals behind schedule
  const behindGoals = context.activeGoals.filter((g) => !g.isOnTrack);
  if (behindGoals.length > 0) {
    const goal = behindGoals[0];
    suggestions.push({
      title: `${goal.name} Needs Attention`,
      message: `Your ${goal.name} goal is behind schedule. Consider increasing your monthly contribution or adjusting your target date.`,
      priority: 'high',
      actionType: 'adjust_goal',
    });
  }

  // High lifestyle spending
  const lifestyleCategory = context.topCategories.find((c) => c.category === 'lifestyle');
  if (lifestyleCategory && lifestyleCategory.percent > 20) {
    suggestions.push({
      title: 'Review Lifestyle Spending',
      message: `Lifestyle expenses make up ${lifestyleCategory.percent}% of your spending. Consider setting a monthly budget for discretionary spending.`,
      priority: 'medium',
      category: 'lifestyle',
      actionType: 'reduce_spending',
    });
  }

  // No savings goals
  const savingsGoals = context.activeGoals.filter((g) => g.type === 'savings');
  if (savingsGoals.length === 0 && context.averageMonthlySpending > 0) {
    suggestions.push({
      title: 'Start an Emergency Fund',
      message: 'Consider creating a savings goal for emergencies. Financial experts recommend 3-6 months of expenses.',
      priority: 'medium',
      actionType: 'increase_savings',
    });
  }

  // Spending increased
  if (context.recentSnapshots.length >= 2) {
    const [current, previous] = context.recentSnapshots;
    if (current.totalPaid > previous.totalPaid * 1.1) {
      suggestions.push({
        title: 'Spending Trend Alert',
        message: 'Your spending has increased compared to last month. Review your recent transactions to identify areas to cut back.',
        priority: 'low',
        actionType: 'review_commitment',
      });
    }
  }

  return suggestions.slice(0, 4);
}
