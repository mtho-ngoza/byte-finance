/**
 * Smart Link logic — pure TypeScript module for testability.
 * Server-side operations are performed via API calls; this module
 * contains the core logic that can be unit/property tested in isolation.
 */

import type { Expense, Goal, Investment, SavingsPot } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SmartLinkTarget =
  | { type: 'goal'; doc: Goal }
  | { type: 'investment'; doc: Investment }
  | { type: 'savings_pot'; doc: SavingsPot };

export interface ContributionRecord {
  expenseId: string;
  folderId: string;
  amount: number; // cents
  date: string;   // ISO string
}

export interface BackfillCandidate {
  expenseId: string;
  folderId: string;
  amount: number;
  label: string;
  paidDate: string;
}

// ─── Pure logic helpers (testable without Firestore) ─────────────────────────

/**
 * Compute the new currentAmount after adding a contribution to a goal/investment.
 * For debt_payoff goals, also returns the new currentBalance.
 */
export function computeAmountAfterContribution(
  currentAmount: number,
  contributionAmount: number,
  targetType: 'goal' | 'investment' | 'savings_pot',
  isDebtPayoff: boolean,
  currentBalance?: number,
): { newCurrentAmount: number; newCurrentBalance?: number } {
  if (targetType === 'savings_pot') {
    // SavingsPot uses currentBalance, not currentAmount
    return {
      newCurrentAmount: currentAmount + contributionAmount,
      newCurrentBalance: (currentBalance ?? 0) + contributionAmount,
    };
  }
  if (isDebtPayoff) {
    return {
      newCurrentAmount: currentAmount + contributionAmount,
      newCurrentBalance: Math.max(0, (currentBalance ?? 0) - contributionAmount),
    };
  }
  return { newCurrentAmount: currentAmount + contributionAmount };
}

/**
 * Compute the new currentAmount after reversing a contribution.
 */
export function computeAmountAfterReversal(
  currentAmount: number,
  contributionAmount: number,
  targetType: 'goal' | 'investment' | 'savings_pot',
  isDebtPayoff: boolean,
  currentBalance?: number,
): { newCurrentAmount: number; newCurrentBalance?: number } {
  if (targetType === 'savings_pot') {
    return {
      newCurrentAmount: Math.max(0, currentAmount - contributionAmount),
      newCurrentBalance: Math.max(0, (currentBalance ?? 0) - contributionAmount),
    };
  }
  if (isDebtPayoff) {
    return {
      newCurrentAmount: Math.max(0, currentAmount - contributionAmount),
      newCurrentBalance: (currentBalance ?? 0) + contributionAmount,
    };
  }
  return { newCurrentAmount: Math.max(0, currentAmount - contributionAmount) };
}

/**
 * Find backfill candidates from a list of past expenses.
 * Returns paid expenses with the matching label that have no linkedTo.
 */
export function findBackfillCandidates(
  label: string,
  expenses: Array<Pick<Expense, 'id' | 'folderId' | 'label' | 'amount' | 'status' | 'linkedTo' | 'paidDate'>>,
): BackfillCandidate[] {
  const normalised = label.trim().toLowerCase();
  return expenses
    .filter(
      (e) =>
        e.label.trim().toLowerCase() === normalised &&
        e.status === 'paid' &&
        !e.linkedTo,
    )
    .map((e) => ({
      expenseId: e.id,
      folderId: e.folderId,
      amount: e.amount,
      label: e.label,
      paidDate:
        e.paidDate
          ? new Date(
              (e.paidDate as unknown as { seconds: number }).seconds * 1000,
            ).toISOString()
          : new Date().toISOString(),
    }));
}

/**
 * Build the contributions array to add during a backfill.
 * Returns one ContributionRecord per candidate.
 */
export function buildBackfillContributions(
  candidates: BackfillCandidate[],
): ContributionRecord[] {
  return candidates.map((c) => ({
    expenseId: c.expenseId,
    folderId: c.folderId,
    amount: c.amount,
    date: c.paidDate,
  }));
}

/**
 * Compute the total amount from a list of backfill candidates.
 */
export function sumBackfillAmount(candidates: BackfillCandidate[]): number {
  return candidates.reduce((sum, c) => sum + c.amount, 0);
}

// ─── API-level helpers (called from API routes / server actions) ──────────────

/**
 * Build the Firestore transaction payload for recording a contribution.
 * The actual Firestore transaction is executed in the API route.
 */
export function buildContributionPayload(
  expense: Pick<Expense, 'id' | 'folderId' | 'amount'>,
  now: Date = new Date(),
): ContributionRecord {
  return {
    expenseId: expense.id,
    folderId: expense.folderId,
    amount: expense.amount,
    date: now.toISOString(),
  };
}
