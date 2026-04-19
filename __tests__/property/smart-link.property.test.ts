/**
 * Property-based tests for Smart Link logic.
 * Feature: byte-finance-ai
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  computeAmountAfterContribution,
  computeAmountAfterReversal,
  findBackfillCandidates,
  buildBackfillContributions,
} from '@/lib/smart-link';
import type { Expense } from '@/types';

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const arbAmount = fc.integer({ min: 1, max: 100_000_000 });
const arbTargetType = fc.constantFrom('goal' as const, 'investment' as const, 'savings_pot' as const);

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

// ─── Property 10: Smart Link contribution round trip ─────────────────────────
// Feature: byte-finance-ai, Property 10: Smart Link contribution round trip
// Validates: Requirements 8.2, 8.3

describe('Property 10: Smart Link contribution round trip', () => {
  it('recording then reversing a contribution leaves currentAmount unchanged', () => {
    fc.assert(
      fc.property(
        arbAmount,
        arbAmount,
        fc.boolean(),
        (currentAmount, contributionAmount, isDebtPayoff) => {
          // For debt_payoff, ensure contribution doesn't exceed balance to avoid clamping
          const currentBalance = isDebtPayoff
            ? currentAmount * 2 + contributionAmount
            : undefined;

          const afterRecord = computeAmountAfterContribution(
            currentAmount,
            contributionAmount,
            'goal',
            isDebtPayoff,
            currentBalance,
          );

          const afterReversal = computeAmountAfterReversal(
            afterRecord.newCurrentAmount,
            contributionAmount,
            'goal',
            isDebtPayoff,
            afterRecord.newCurrentBalance,
          );

          expect(afterReversal.newCurrentAmount).toBe(currentAmount);

          if (isDebtPayoff) {
            expect(afterReversal.newCurrentBalance).toBe(currentBalance);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('savings_pot: recording then reversing leaves currentBalance unchanged', () => {
    fc.assert(
      fc.property(arbAmount, arbAmount, (currentBalance, contributionAmount) => {
        const afterRecord = computeAmountAfterContribution(
          0,
          contributionAmount,
          'savings_pot',
          false,
          currentBalance,
        );

        const afterReversal = computeAmountAfterReversal(
          afterRecord.newCurrentAmount,
          contributionAmount,
          'savings_pot',
          false,
          afterRecord.newCurrentBalance,
        );

        expect(afterReversal.newCurrentBalance).toBe(currentBalance);
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 11: Smart Link contribution amount equals expense amount ────────
// Feature: byte-finance-ai, Property 11: Smart Link contribution amount equals expense amount
// Validates: Requirements 8.2

describe('Property 11: Smart Link contribution amount equals expense amount', () => {
  it('the delta in currentAmount equals the expense amount', () => {
    fc.assert(
      fc.property(arbAmount, arbAmount, (currentAmount, expenseAmount) => {
        const result = computeAmountAfterContribution(
          currentAmount,
          expenseAmount,
          'goal',
          false,
        );
        expect(result.newCurrentAmount - currentAmount).toBe(expenseAmount);
      }),
      { numRuns: 100 },
    );
  });

  it('savings_pot: the delta in currentBalance equals the expense amount', () => {
    fc.assert(
      fc.property(arbAmount, arbAmount, (currentBalance, expenseAmount) => {
        const result = computeAmountAfterContribution(
          0,
          expenseAmount,
          'savings_pot',
          false,
          currentBalance,
        );
        expect(result.newCurrentBalance! - currentBalance).toBe(expenseAmount);
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 12: Backfill creates one contribution per matching paid expense ─
// Feature: byte-finance-ai, Property 12: Backfill creates one contribution per matching paid expense
// Validates: Requirements 8.6

describe('Property 12: Backfill creates one contribution per matching paid expense', () => {
  it('findBackfillCandidates returns exactly one entry per matching paid unlinked expense', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10 }),
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 0, max: 5 }),
        (matchingPaidCount, pendingCount, linkedCount) => {
          const label = 'Netflix';
          const expenses: Expense[] = [];

          // Matching paid, no linkedTo — should be candidates
          for (let i = 0; i < matchingPaidCount; i++) {
            expenses.push(makeExpense({ id: `paid-${i}`, label, status: 'paid' }));
          }
          // Pending — should NOT be candidates
          for (let i = 0; i < pendingCount; i++) {
            expenses.push(makeExpense({ id: `pending-${i}`, label, status: 'pending' }));
          }
          // Paid but already linked — should NOT be candidates
          for (let i = 0; i < linkedCount; i++) {
            expenses.push(
              makeExpense({
                id: `linked-${i}`,
                label,
                status: 'paid',
                linkedTo: { type: 'goal', id: 'g1' },
              }),
            );
          }

          const candidates = findBackfillCandidates(label, expenses);
          expect(candidates).toHaveLength(matchingPaidCount);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('buildBackfillContributions creates exactly one record per candidate', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            expenseId: fc.string({ minLength: 1, maxLength: 20 }),
            folderId: fc.string({ minLength: 1, maxLength: 20 }),
            amount: arbAmount,
            label: fc.string({ minLength: 1, maxLength: 50 }),
            paidDate: fc.constant('2026-01-01T00:00:00.000Z'),
          }),
          { minLength: 0, maxLength: 20 },
        ),
        (candidates) => {
          const contributions = buildBackfillContributions(candidates);
          expect(contributions).toHaveLength(candidates.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});
