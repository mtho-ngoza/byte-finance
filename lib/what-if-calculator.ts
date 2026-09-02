import type { ProjectionPoint, WhatIfResult, DebtStrategyComparison } from '@/types';

/**
 * Format a date as "YYYY-MM"
 */
function formatMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Add months to a date
 */
function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

/**
 * Calculate goal projection timeline
 */
export function calculateGoalProjection(
  currentBalance: number,
  targetAmount: number,
  monthlyAmount: number,
  oneTimeBoost: number = 0
): ProjectionPoint[] {
  if (monthlyAmount <= 0) return [];

  const timeline: ProjectionPoint[] = [];
  let balance = currentBalance + oneTimeBoost;
  let cumulative = currentBalance + oneTimeBoost;
  const startDate = new Date();

  // Initial point
  timeline.push({
    month: formatMonth(startDate),
    balance,
    cumulative,
  });

  let month = 1;
  const maxMonths = 240; // 20 years max

  while (balance < targetAmount && month <= maxMonths) {
    balance += monthlyAmount;
    cumulative += monthlyAmount;

    timeline.push({
      month: formatMonth(addMonths(startDate, month)),
      balance: Math.min(balance, targetAmount),
      cumulative,
    });

    month++;
  }

  return timeline;
}

/**
 * Calculate extra savings scenario
 */
export function calculateExtraSavings(
  currentBalance: number,
  targetAmount: number,
  currentMonthly: number,
  extraAmount: number
): WhatIfResult {
  const currentTimeline = calculateGoalProjection(currentBalance, targetAmount, currentMonthly);
  const scenarioTimeline = calculateGoalProjection(currentBalance, targetAmount, currentMonthly + extraAmount);

  const currentMonths = currentTimeline.length - 1;
  const scenarioMonths = scenarioTimeline.length - 1;
  const timeSaved = currentMonths - scenarioMonths;

  const currentCompletion = currentMonths > 0 ? addMonths(new Date(), currentMonths) : null;
  const scenarioCompletion = scenarioMonths > 0 ? addMonths(new Date(), scenarioMonths) : null;

  return {
    currentTimeline,
    scenarioTimeline,
    summary: {
      timeSaved: timeSaved > 0 ? timeSaved : 0,
      currentCompletionDate: currentCompletion?.toISOString(),
      newCompletionDate: scenarioCompletion?.toISOString(),
    },
  };
}

/**
 * Calculate one-time boost scenario
 */
export function calculateOneTimeBoost(
  currentBalance: number,
  targetAmount: number,
  monthlyAmount: number,
  boostAmount: number
): WhatIfResult {
  const currentTimeline = calculateGoalProjection(currentBalance, targetAmount, monthlyAmount);
  const scenarioTimeline = calculateGoalProjection(currentBalance, targetAmount, monthlyAmount, boostAmount);

  const currentMonths = currentTimeline.length - 1;
  const scenarioMonths = scenarioTimeline.length - 1;
  const timeSaved = currentMonths - scenarioMonths;

  const currentCompletion = currentMonths > 0 ? addMonths(new Date(), currentMonths) : null;
  const scenarioCompletion = scenarioMonths > 0 ? addMonths(new Date(), scenarioMonths) : null;

  return {
    currentTimeline,
    scenarioTimeline,
    summary: {
      timeSaved: timeSaved > 0 ? timeSaved : 0,
      currentCompletionDate: currentCompletion?.toISOString(),
      newCompletionDate: scenarioCompletion?.toISOString(),
    },
  };
}

/**
 * Calculate debt payoff with interest
 */
export function calculateDebtPayoff(
  currentBalance: number,
  interestRate: number, // Annual rate as decimal (0.105 = 10.5%)
  minimumPayment: number,
  extraPayment: number = 0
): { timeline: ProjectionPoint[]; totalInterest: number; months: number } {
  const monthlyRate = interestRate / 12;
  const payment = minimumPayment + extraPayment;

  if (payment <= 0) {
    return { timeline: [], totalInterest: 0, months: 0 };
  }

  const timeline: ProjectionPoint[] = [];
  let balance = currentBalance;
  let totalInterest = 0;
  let cumulative = 0;
  const startDate = new Date();
  const maxMonths = 360; // 30 years max

  // Initial point
  timeline.push({
    month: formatMonth(startDate),
    balance,
    interest: 0,
    cumulative: 0,
  });

  let month = 1;

  while (balance > 0 && month <= maxMonths) {
    const interest = Math.round(balance * monthlyRate);
    totalInterest += interest;

    const principalPayment = Math.min(balance + interest, payment) - interest;
    balance = Math.max(0, balance - principalPayment);
    cumulative += principalPayment + interest;

    timeline.push({
      month: formatMonth(addMonths(startDate, month)),
      balance,
      interest,
      cumulative,
    });

    month++;
  }

  return {
    timeline,
    totalInterest,
    months: month - 1,
  };
}

/**
 * Calculate extra debt payment scenario
 */
export function calculateExtraDebtPayment(
  currentBalance: number,
  interestRate: number,
  minimumPayment: number,
  extraPayment: number
): WhatIfResult {
  const current = calculateDebtPayoff(currentBalance, interestRate, minimumPayment, 0);
  const scenario = calculateDebtPayoff(currentBalance, interestRate, minimumPayment, extraPayment);

  const interestSaved = current.totalInterest - scenario.totalInterest;
  const timeSaved = current.months - scenario.months;

  const currentCompletion = current.months > 0 ? addMonths(new Date(), current.months) : null;
  const scenarioCompletion = scenario.months > 0 ? addMonths(new Date(), scenario.months) : null;

  return {
    currentTimeline: current.timeline,
    scenarioTimeline: scenario.timeline,
    summary: {
      timeSaved: timeSaved > 0 ? timeSaved : 0,
      interestSaved: interestSaved > 0 ? interestSaved : 0,
      currentCompletionDate: currentCompletion?.toISOString(),
      newCompletionDate: scenarioCompletion?.toISOString(),
    },
  };
}

interface DebtInfo {
  id: string;
  name: string;
  balance: number;      // cents
  interestRate: number; // annual decimal
  minimumPayment: number; // cents
}

/**
 * Compare snowball vs avalanche debt payoff strategies
 */
export function compareDebtStrategies(
  debts: DebtInfo[],
  extraBudget: number // Extra amount beyond minimums
): DebtStrategyComparison {
  if (debts.length === 0) {
    const emptyResult = {
      totalInterest: 0,
      payoffMonths: 0,
      payoffDate: new Date().toISOString(),
      timeline: [],
    };
    return {
      snowball: emptyResult,
      avalanche: emptyResult,
      interestDifference: 0,
      timeDifference: 0,
    };
  }

  // Snowball: smallest balance first
  const snowballDebts = [...debts].sort((a, b) => a.balance - b.balance);
  const snowballResult = simulateDebtPayoff(snowballDebts, extraBudget);

  // Avalanche: highest interest first
  const avalancheDebts = [...debts].sort((a, b) => b.interestRate - a.interestRate);
  const avalancheResult = simulateDebtPayoff(avalancheDebts, extraBudget);

  return {
    snowball: snowballResult,
    avalanche: avalancheResult,
    interestDifference: snowballResult.totalInterest - avalancheResult.totalInterest,
    timeDifference: snowballResult.payoffMonths - avalancheResult.payoffMonths,
  };
}

/**
 * Simulate debt payoff with a prioritized list
 */
function simulateDebtPayoff(
  debts: DebtInfo[],
  extraBudget: number
): { totalInterest: number; payoffMonths: number; payoffDate: string; timeline: ProjectionPoint[] } {
  const balances = debts.map(d => d.balance);
  const rates = debts.map(d => d.interestRate / 12);
  const minimums = debts.map(d => d.minimumPayment);

  let totalInterest = 0;
  let month = 0;
  const maxMonths = 360;
  const startDate = new Date();
  const timeline: ProjectionPoint[] = [];

  // Initial point
  timeline.push({
    month: formatMonth(startDate),
    balance: balances.reduce((a, b) => a + b, 0),
    interest: 0,
    cumulative: 0,
  });

  let cumulativePaid = 0;

  while (balances.some(b => b > 0) && month < maxMonths) {
    month++;
    let monthInterest = 0;
    let extraAvailable = extraBudget;

    // Apply interest and minimum payments
    for (let i = 0; i < balances.length; i++) {
      if (balances[i] <= 0) continue;

      const interest = Math.round(balances[i] * rates[i]);
      monthInterest += interest;
      totalInterest += interest;
      balances[i] += interest;

      const payment = Math.min(balances[i], minimums[i]);
      balances[i] -= payment;
      cumulativePaid += payment;
    }

    // Apply extra payment to first non-zero balance (priority order)
    for (let i = 0; i < balances.length && extraAvailable > 0; i++) {
      if (balances[i] <= 0) continue;

      const payment = Math.min(balances[i], extraAvailable);
      balances[i] -= payment;
      extraAvailable -= payment;
      cumulativePaid += payment;
    }

    timeline.push({
      month: formatMonth(addMonths(startDate, month)),
      balance: balances.reduce((a, b) => a + b, 0),
      interest: monthInterest,
      cumulative: cumulativePaid,
    });
  }

  return {
    totalInterest,
    payoffMonths: month,
    payoffDate: addMonths(startDate, month).toISOString(),
    timeline,
  };
}

/**
 * Calculate emergency buffer scenario
 */
export function calculateEmergencyBuffer(
  monthlyExpenses: number,
  currentBalance: number,
  targetMonths: number,
  monthlySavings: number
): WhatIfResult {
  const targetAmount = monthlyExpenses * targetMonths;

  // Current timeline to reach target
  const currentTimeline = calculateGoalProjection(currentBalance, targetAmount, monthlySavings);

  const currentMonths = currentTimeline.length - 1;
  const currentCompletion = currentMonths > 0 ? addMonths(new Date(), currentMonths) : null;

  // Calculate required monthly to reach in a reasonable time (e.g., 12 months)
  const remaining = targetAmount - currentBalance;
  const monthlyRequired = remaining > 0 ? Math.ceil(remaining / 12) : 0;

  return {
    currentTimeline,
    scenarioTimeline: calculateGoalProjection(currentBalance, targetAmount, monthlyRequired),
    summary: {
      monthlyRequired,
      currentCompletionDate: currentCompletion?.toISOString(),
      newCompletionDate: remaining > 0 ? addMonths(new Date(), 12).toISOString() : new Date().toISOString(),
    },
  };
}
