import { describe, it, expect } from 'vitest';
import {
  computeAmountAfterContribution,
  computeAmountAfterReversal,
  findBackfillCandidates,
  buildBackfillContributions,
  sumBackfillAmount,
  buildContributionPayload,
} from '@/lib/smart-link';
import type { Expense } from '@/types';

// ─── computeAmountAfterContribution ──────────────────────────────────────────

describe('computeAmountAfterContribution', () => {
  it('increments currentAmount for a regular goal', () => {
    const result = computeAmountAfterContribution(50000, 10000, 'goal', false);
    expect(result.newCurrentAmount).toBe(60000);
    expect(result.newCurrentBalance).toBeUndefined();
  });

  it('increments currentAmount and decrements currentBalance for debt_payoff', () => {
    const result = computeAmountAfterContribution(10000, 5000, 'goal', true, 100000);
    expect(result.newCurrentAmount).toBe(15000);
    expect(result.newCurrentBalance).toBe(95000);
  });

  it('debt_payoff balance does not go below zero', () => {
    const result = computeAmountAfterContribution(90000, 20000, 'goal', true, 10000);
    expect(result.newCurrentBalance).toBe(0);
  });

  it('increments currentBalance for savings_pot', () => {
    const result = computeAmountAfterContribution(0, 5000, 'savings_pot', false, 20000);
    expect(result.newCurrentBalance).toBe(25000);
    expect(result.newCurrentAmount).toBe(5000);
  });
});

// ─── computeAmountAfterReversal ───────────────────────────────────────────────

describe('computeAmountAfterReversal', () => {
  it('decrements currentAmount for a regular goal', () => {
    const result = computeAmountAfterReversal(60000, 10000, 'goal', false);
    expect(result.newCurrentAmount).toBe(50000);
  });

  it('does not go below zero on reversal', () => {
    const result = computeAmountAfterReversal(5000, 10000, 'goal', false);
    expect(result.newCurrentAmount).toBe(0);
  });

  it('decrements currentAmount and increments currentBalance for debt_payoff', () => {
    const result = computeAmountAfterReversal(15000, 5000, 'goal', true, 95000);
    expect(result.newCurrentAmount).toBe(10000);
    expect(result.newCurrentBalance).toBe(100000);
  });

  it('decrements currentBalance for savings_pot', () => {
    const result = computeAmountAfterReversal(5000, 5000, 'savings_pot', false, 25000);
    expect(result.newCurrentBalance).toBe(20000);
    expect(result.newCurrentAmount).toBe(0);
  });
});

// ─── findBackfillCandidates ───────────────────────────────────────────────────

function makeExpense(overrides: Partial<Expense> & { id: string }): Expense {
  return {
    folderId: 'folder-1',
    label: 'Test',
    amount: 10000,
    status: 'pending',
    category: 'other',
    accountType: 'personal',
    sortOrder: 0,
    createdAt: { seconds: 0, nanoseconds: 0 } as unknown as Expense['createdAt'],
    updatedAt: { seconds: 0, nanoseconds: 0 } as unknown as Expense['updatedAt'],
    ...overrides,
  };
}

describe('findBackfillCandidates', () => {
  it('returns paid expenses with matching label and no linkedTo', () => {
    const expenses = [
      makeExpense({ id: 'e1', label: 'Netflix', status: 'paid' }),
      makeExpense({ id: 'e2', label: 'Netflix', status: 'pending' }),
      makeExpense({ id: 'e3', label: 'Netflix', status: 'paid', linkedTo: { type: 'goal', id: 'g1' } }),
      makeExpense({ id: 'e4', label: 'Spotify', status: 'paid' }),
    ];
    const candidates = findBackfillCandidates('Netflix', expenses);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].expenseId).toBe('e1');
  });

  it('is case-insensitive', () => {
    const expenses = [
      makeExpense({ id: 'e1', label: 'NETFLIX', status: 'paid' }),
    ];
    const candidates = findBackfillCandidates('netflix', expenses);
    expect(candidates).toHaveLength(1);
  });

  it('trims whitespace from label', () => {
    const expenses = [
      makeExpense({ id: 'e1', label: '  Netflix  ', status: 'paid' }),
    ];
    const candidates = findBackfillCandidates('Netflix', expenses);
    expect(candidates).toHaveLength(1);
  });

  it('returns empty array when no matches', () => {
    const expenses = [makeExpense({ id: 'e1', label: 'Spotify', status: 'paid' })];
    expect(findBackfillCandidates('Netflix', expenses)).toHaveLength(0);
  });
});

// ─── buildBackfillContributions ───────────────────────────────────────────────

describe('buildBackfillContributions', () => {
  it('creates one contribution per candidate', () => {
    const candidates = [
      { expenseId: 'e1', folderId: 'f1', amount: 10000, label: 'Netflix', paidDate: '2026-01-01T00:00:00.000Z' },
      { expenseId: 'e2', folderId: 'f1', amount: 10000, label: 'Netflix', paidDate: '2026-02-01T00:00:00.000Z' },
    ];
    const contributions = buildBackfillContributions(candidates);
    expect(contributions).toHaveLength(2);
    expect(contributions[0].expenseId).toBe('e1');
    expect(contributions[1].expenseId).toBe('e2');
  });

  it('preserves amount from candidate', () => {
    const candidates = [
      { expenseId: 'e1', folderId: 'f1', amount: 99900, label: 'Test', paidDate: '2026-01-01T00:00:00.000Z' },
    ];
    const contributions = buildBackfillContributions(candidates);
    expect(contributions[0].amount).toBe(99900);
  });
});

// ─── sumBackfillAmount ────────────────────────────────────────────────────────

describe('sumBackfillAmount', () => {
  it('sums all candidate amounts', () => {
    const candidates = [
      { expenseId: 'e1', folderId: 'f1', amount: 10000, label: 'A', paidDate: '' },
      { expenseId: 'e2', folderId: 'f1', amount: 20000, label: 'A', paidDate: '' },
    ];
    expect(sumBackfillAmount(candidates)).toBe(30000);
  });

  it('returns 0 for empty array', () => {
    expect(sumBackfillAmount([])).toBe(0);
  });
});

// ─── buildContributionPayload ─────────────────────────────────────────────────

describe('buildContributionPayload', () => {
  it('builds a contribution record from an expense', () => {
    const expense = { id: 'e1', folderId: 'f1', amount: 50000 };
    const now = new Date('2026-03-15T10:00:00.000Z');
    const payload = buildContributionPayload(expense, now);
    expect(payload.expenseId).toBe('e1');
    expect(payload.folderId).toBe('f1');
    expect(payload.amount).toBe(50000);
    expect(payload.date).toBe('2026-03-15T10:00:00.000Z');
  });
});
