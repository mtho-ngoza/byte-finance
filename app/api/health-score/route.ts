import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getCycleDateRange } from '@/lib/payday-utils';
import type { HealthScore, HealthScoreTip } from '@/types';

// Helper types for health score calculation
interface CycleItemData {
  status?: string;
  dueDate?: { toDate?: () => Date } | string;
  paidDate?: { toDate?: () => Date } | string;
  isVariable?: boolean;
  amount?: number;
  actualAmount?: number;
  totalPaidAmount?: number;
}

interface GoalData {
  id: string;
  name?: string;
  type?: string;
  priority?: string;
  isOnTrack?: boolean;
  currentAmount?: number;
  contributions?: Array<{
    amount?: number;
    date?: { toDate?: () => Date } | string | Date;
  }>;
}

interface CycleData {
  startDate?: { toDate?: () => Date } | string;
  endDate?: { toDate?: () => Date } | string;
  income?: {
    amount?: number;
    vatAmount?: number;
  };
}

// Tip templates for each pillar
const TIPS: Record<string, HealthScoreTip[]> = {
  budgetDiscipline: [
    { pillar: 'budgetDiscipline', title: 'Pay bills on time', message: 'Set up reminders or auto-pay for recurring bills to stay on track.', priority: 'high' },
    { pillar: 'budgetDiscipline', title: 'Track due dates', message: 'Add due dates to your cycle items to better monitor payment timing.', priority: 'medium' },
  ],
  savingsRate: [
    { pillar: 'savingsRate', title: 'Boost your savings', message: 'Aim to save at least 20% of your income each month for financial security.', priority: 'high' },
    { pillar: 'savingsRate', title: 'Automate contributions', message: 'Link commitments to goals for automatic savings when you pay.', priority: 'medium' },
  ],
  goalMomentum: [
    { pillar: 'goalMomentum', title: 'Contribute regularly', message: 'Make at least 3 contributions per month to keep momentum.', priority: 'high' },
    { pillar: 'goalMomentum', title: 'Review stalled goals', message: 'Check on goals that haven\'t received contributions recently.', priority: 'medium' },
  ],
  stabilityBuffer: [
    { pillar: 'stabilityBuffer', title: 'Build emergency fund', message: 'Target 6 months of expenses in your emergency fund for security.', priority: 'high' },
    { pillar: 'stabilityBuffer', title: 'Start small', message: 'Even R500/month towards emergencies adds up over time.', priority: 'medium' },
  ],
};

export async function GET(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(request.url);
  const cycleId = searchParams.get('cycleId');

  if (!cycleId) {
    return NextResponse.json({ error: 'cycleId is required' }, { status: 400 });
  }

  const db = getAdminDb();
  const docRef = db.collection(`users/${userId}/healthScores`).doc(cycleId);
  const doc = await docRef.get();

  if (!doc.exists) {
    return NextResponse.json({ healthScore: null });
  }

  return NextResponse.json({ healthScore: { id: doc.id, ...doc.data() } });
}

export async function POST(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await request.json();
  const { cycleId } = body;

  if (!cycleId) {
    return NextResponse.json({ error: 'cycleId is required' }, { status: 400 });
  }

  const db = getAdminDb();

  // Get user's payday settings
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  const payDayType = userData?.preferences?.payDayType ?? 'last_working_day';
  const payDayFixed = userData?.preferences?.payDayFixed;

  // Fetch all required data in parallel
  const [cycleSnap, itemsSnap, goalsSnap, previousScoreSnap] = await Promise.all([
    db.collection(`users/${userId}/cycles`).doc(cycleId).get(),
    db.collection(`users/${userId}/cycleItems`).where('cycleId', '==', cycleId).get(),
    db.collection(`users/${userId}/goals`).where('status', '==', 'active').get(),
    // Get previous month's score for trend
    getPreviousCycleId(cycleId)
      ? db.collection(`users/${userId}/healthScores`).doc(getPreviousCycleId(cycleId)!).get()
      : Promise.resolve(null),
  ]);

  const cycle = cycleSnap.exists ? cycleSnap.data() as CycleData : undefined;
  const items = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() } as CycleItemData));
  const goals = goalsSnap.docs.map(d => ({ id: d.id, ...d.data() } as GoalData));
  const previousScore = previousScoreSnap?.exists ? (previousScoreSnap.data() as HealthScore).totalScore : null;

  // Get date range from stored cycle document (same as useCycleItems)
  const [yearStr, monthStr] = cycleId.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  // Helper to parse date
  const parseCycleDate = (d: { toDate?: () => Date } | string | undefined): Date | null => {
    if (!d) return null;
    if (typeof d === 'string') return new Date(d);
    return d.toDate?.() ?? null;
  };

  let startDate: Date;
  let endDate: Date;

  const parsedStart = parseCycleDate(cycle?.startDate);
  if (parsedStart) {
    startDate = parsedStart;
  } else {
    const { startDate: calcStart } = getCycleDateRange(year, month, payDayType, payDayFixed);
    startDate = calcStart;
  }

  const parsedEnd = parseCycleDate(cycle?.endDate);
  if (parsedEnd) {
    endDate = parsedEnd;
  } else {
    const { endDate: calcEnd } = getCycleDateRange(year, month, payDayType, payDayFixed);
    endDate = calcEnd;
  }

  // Normalize to full days
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);

  // Calculate Budget Discipline (25 pts)
  const budgetDiscipline = calculateBudgetDiscipline(items);

  // Calculate Savings Rate (25 pts) - use date range for contribution filtering
  const savingsRate = calculateSavingsRate(cycle, goals, startDate, endDate);

  // Calculate Goal Momentum (25 pts) - use date range for contribution filtering
  const goalMomentum = calculateGoalMomentum(goals, startDate, endDate);

  // Calculate Stability Buffer (25 pts)
  const stabilityBuffer = await calculateStabilityBuffer(db, userId, goals, items);

  // Total score
  const totalScore = Math.round(
    budgetDiscipline.score +
    savingsRate.score +
    goalMomentum.score +
    stabilityBuffer.score
  );

  // Determine trend
  const trend: HealthScore['trend'] = previousScore === null
    ? 'stable'
    : totalScore > previousScore
      ? 'up'
      : totalScore < previousScore
        ? 'down'
        : 'stable';

  // Generate tips for weakest pillar
  const tips = generateTips({ budgetDiscipline, savingsRate, goalMomentum, stabilityBuffer });

  const now = FieldValue.serverTimestamp();
  const healthScore = {
    cycleId,
    totalScore,
    pillars: {
      budgetDiscipline,
      savingsRate,
      goalMomentum,
      stabilityBuffer,
    },
    previousScore,
    trend,
    tips,
    createdAt: now,
    updatedAt: now,
  };

  const docRef = db.collection(`users/${userId}/healthScores`).doc(cycleId);
  await docRef.set(healthScore, { merge: true });

  return NextResponse.json({ healthScore: { id: cycleId, ...healthScore } }, { status: 201 });
}

// Helper to get previous cycle ID
function getPreviousCycleId(cycleId: string): string | null {
  const [year, month] = cycleId.split('-').map(Number);
  if (month === 1) {
    return `${year - 1}-12`;
  }
  return `${year}-${String(month - 1).padStart(2, '0')}`;
}

// Calculate Budget Discipline score
function calculateBudgetDiscipline(items: CycleItemData[]): HealthScore['pillars']['budgetDiscipline'] {
  // Filter out skipped items
  const activeItems = items.filter(i => i.status !== 'skipped');
  const totalItems = activeItems.length;

  if (totalItems === 0) {
    return { score: 25, paidOnTimePercent: 100, totalItems: 0, paidOnTimeItems: 0 };
  }

  // Separate fixed items (with due dates) from variable items
  const fixedItems = activeItems.filter(i => i.dueDate && !i.isVariable);
  const variableItems = activeItems.filter(i => !i.dueDate || i.isVariable);

  // Helper to parse date from Firestore
  const parseDate = (d: { toDate?: () => Date } | string | undefined): Date | null => {
    if (!d) return null;
    if (typeof d === 'string') return new Date(d);
    return d.toDate?.() ?? null;
  };

  // Fixed items: Check if paid on or before due date
  const fixedOnTime = fixedItems.filter(item => {
    if (item.status !== 'paid' && item.status !== 'partial') return false;
    if (!item.paidDate) return true; // Marked paid without date = assume on time

    const dueDate = parseDate(item.dueDate);
    const paidDate = parseDate(item.paidDate);
    if (!dueDate || !paidDate) return true;
    return paidDate <= dueDate;
  }).length;

  // Variable items: Just check if paid/partial (they're about budget control, not timing)
  const variablePaid = variableItems.filter(item =>
    item.status === 'paid' || item.status === 'partial'
  ).length;

  const paidOnTimeItems = fixedOnTime + variablePaid;
  const paidOnTimePercent = Math.round((paidOnTimeItems / totalItems) * 100);
  const score = Math.round((paidOnTimeItems / totalItems) * 25);

  return { score, paidOnTimePercent, totalItems, paidOnTimeItems };
}

// Calculate Savings Rate score
function calculateSavingsRate(cycle: CycleData | undefined, goals: GoalData[], startDate: Date, endDate: Date): HealthScore['pillars']['savingsRate'] {
  const income = cycle?.income?.amount ?? 0;
  const vatAmount = cycle?.income?.vatAmount ?? 0;
  const netIncome = income - vatAmount;

  if (netIncome <= 0) {
    return { score: 0, rate: 0, incomeAmount: 0, savingsAmount: 0 };
  }

  // Helper to parse date
  const parseDate = (d: { toDate?: () => Date } | string | Date | undefined): Date | null => {
    if (!d) return null;
    if (d instanceof Date) return d;
    if (typeof d === 'string') return new Date(d);
    return d.toDate?.() ?? null;
  };

  // Sum contributions to goals made within this cycle's date range
  let savingsAmount = 0;
  for (const goal of goals) {
    const contributions = goal.contributions ?? [];
    for (const c of contributions) {
      const contributionDate = parseDate(c.date);
      if (contributionDate && contributionDate >= startDate && contributionDate <= endDate) {
        savingsAmount += c.amount ?? 0;
      }
    }
  }

  const rate = Math.round((savingsAmount / netIncome) * 100);
  // Full points at 20% savings rate
  const score = Math.round(Math.min(1, rate / 20) * 25);

  return { score, rate, incomeAmount: netIncome, savingsAmount };
}

// Calculate Goal Momentum score
function calculateGoalMomentum(goals: GoalData[], startDate: Date, endDate: Date): HealthScore['pillars']['goalMomentum'] {
  const totalGoals = goals.length;

  if (totalGoals === 0) {
    return { score: 25, onTrackPercent: 100, totalGoals: 0, onTrackGoals: 0, recentContributions: 0 };
  }

  // Count on-track goals
  const onTrackGoals = goals.filter(g => g.isOnTrack === true).length;
  const onTrackPercent = Math.round((onTrackGoals / totalGoals) * 100);

  // Helper to parse date
  const parseDate = (d: { toDate?: () => Date } | string | Date | undefined): Date | null => {
    if (!d) return null;
    if (d instanceof Date) return d;
    if (typeof d === 'string') return new Date(d);
    return d.toDate?.() ?? null;
  };

  // Count contributions made within this cycle's date range
  let recentContributions = 0;
  for (const goal of goals) {
    const contributions = goal.contributions ?? [];
    for (const c of contributions) {
      const contributionDate = parseDate(c.date);
      if (contributionDate && contributionDate >= startDate && contributionDate <= endDate) {
        recentContributions++;
      }
    }
  }

  // Score: 15 pts for on-track, 10 pts for activity (max 3 contributions)
  const onTrackScore = Math.round((onTrackGoals / totalGoals) * 15);
  const activityScore = Math.round(Math.min(1, recentContributions / 3) * 10);
  const score = onTrackScore + activityScore;

  return { score, onTrackPercent, totalGoals, onTrackGoals, recentContributions };
}

// Calculate Stability Buffer score
async function calculateStabilityBuffer(
  db: FirebaseFirestore.Firestore,
  userId: string,
  goals: GoalData[],
  items: CycleItemData[]
): Promise<HealthScore['pillars']['stabilityBuffer']> {
  // Find emergency fund goal
  // Look for: name contains "emergency" OR (type=savings AND priority=high)
  const emergencyGoal = goals.find(g =>
    g.name?.toLowerCase().includes('emergency') ||
    (g.type === 'savings' && g.priority === 'high')
  );

  // Calculate balance from contributions (more accurate than currentAmount which may be stale)
  const emergencyContributions = emergencyGoal?.contributions ?? [];
  const emergencyFundBalance = emergencyContributions.reduce(
    (sum: number, c: { amount?: number }) => sum + (c.amount ?? 0),
    0
  );

  // Calculate average monthly expenses from last 3 cycles
  const now = new Date();
  const cycleIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    cycleIds.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  let totalExpenses = 0;
  let cycleCount = 0;

  // Check current cycle items
  const currentExpenses = items.reduce((sum, item) => {
    if (item.status === 'paid' || item.status === 'partial') {
      return sum + (item.totalPaidAmount ?? item.actualAmount ?? item.amount ?? 0);
    }
    return sum;
  }, 0);

  if (currentExpenses > 0) {
    totalExpenses += currentExpenses;
    cycleCount++;
  }

  // Fetch historical cycles for average
  for (const cid of cycleIds.slice(1)) {
    const cycleDoc = await db.collection(`users/${userId}/cycles`).doc(cid).get();
    if (cycleDoc.exists) {
      const data = cycleDoc.data();
      if (data?.totalPaid && data.totalPaid > 0) {
        totalExpenses += data.totalPaid;
        cycleCount++;
      }
    }
  }

  const monthlyExpenses = cycleCount > 0 ? Math.round(totalExpenses / cycleCount) : 0;

  // Calculate months covered
  const monthsCovered = monthlyExpenses > 0
    ? Math.round((emergencyFundBalance / monthlyExpenses) * 10) / 10
    : 0;

  // Full points at 6 months coverage
  const score = Math.round(Math.min(1, monthsCovered / 6) * 25);

  return { score, monthsCovered, emergencyFundBalance, monthlyExpenses };
}

// Generate tips for weakest pillar
function generateTips(pillars: HealthScore['pillars']): HealthScoreTip[] {
  const pillarScores = [
    { name: 'budgetDiscipline', score: pillars.budgetDiscipline.score },
    { name: 'savingsRate', score: pillars.savingsRate.score },
    { name: 'goalMomentum', score: pillars.goalMomentum.score },
    { name: 'stabilityBuffer', score: pillars.stabilityBuffer.score },
  ].sort((a, b) => a.score - b.score);

  const tips: HealthScoreTip[] = [];

  // Add tips for weakest pillars (score < 20)
  for (const pillar of pillarScores) {
    if (pillar.score < 20 && TIPS[pillar.name]) {
      tips.push(...TIPS[pillar.name]);
      if (tips.length >= 3) break; // Max 3 tips
    }
  }

  return tips.slice(0, 3);
}
