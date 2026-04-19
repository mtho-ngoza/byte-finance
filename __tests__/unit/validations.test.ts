import { describe, it, expect } from 'vitest';
import {
  UserProfileSchema,
  FolderSchema,
  ExpenseSchema,
  BaseExpenseSchema,
  GoalSchema,
  InvestmentSchema,
  SavingsPotSchema,
  InsightSchema,
  MonthlySnapshotSchema,
  ExpenseCategorySchema,
} from '../../lib/validations';

// Minimal valid Timestamp for test fixtures
const ts = { seconds: 1_700_000_000, nanoseconds: 0 };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUserProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'test@example.com',
    displayName: 'Test User',
    preferences: {
      payDayType: 'fixed',
      payDayFixed: 25,
      currency: 'ZAR',
      theme: 'dark',
      notificationsEnabled: false,
    },
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  };
}

function makeExpense(overrides: Record<string, unknown> = {}) {
  return {
    id: 'exp-1',
    folderId: 'folder-1',
    label: 'Rent',
    amount: 900_000,
    status: 'pending',
    category: 'housing',
    accountType: 'personal',
    sortOrder: 0,
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// ExpenseCategory
// ---------------------------------------------------------------------------

describe('ExpenseCategorySchema', () => {
  const valid = [
    'housing', 'transport', 'family', 'business', 'living',
    'health', 'education', 'savings', 'entertainment', 'subscriptions', 'other',
  ];

  it.each(valid)('accepts "%s"', (cat) => {
    expect(ExpenseCategorySchema.safeParse(cat).success).toBe(true);
  });

  it('rejects unknown category', () => {
    expect(ExpenseCategorySchema.safeParse('food').success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// UserProfile — payDayFixed boundary values (Req 2.1, 2.2)
// ---------------------------------------------------------------------------

describe('UserProfileSchema — payDayFixed constraints', () => {
  it('accepts payDayFixed = 1 (lower boundary)', () => {
    const result = UserProfileSchema.safeParse(
      makeUserProfile({ preferences: { payDayType: 'fixed', payDayFixed: 1, currency: 'ZAR', theme: 'dark', notificationsEnabled: false } })
    );
    expect(result.success).toBe(true);
  });

  it('accepts payDayFixed = 28 (upper boundary)', () => {
    const result = UserProfileSchema.safeParse(
      makeUserProfile({ preferences: { payDayType: 'fixed', payDayFixed: 28, currency: 'ZAR', theme: 'dark', notificationsEnabled: false } })
    );
    expect(result.success).toBe(true);
  });

  it('rejects payDayFixed = 0 (below lower boundary)', () => {
    const result = UserProfileSchema.safeParse(
      makeUserProfile({ preferences: { payDayType: 'fixed', payDayFixed: 0, currency: 'ZAR', theme: 'dark', notificationsEnabled: false } })
    );
    expect(result.success).toBe(false);
  });

  it('rejects payDayFixed = 29 (above upper boundary)', () => {
    const result = UserProfileSchema.safeParse(
      makeUserProfile({ preferences: { payDayType: 'fixed', payDayFixed: 29, currency: 'ZAR', theme: 'dark', notificationsEnabled: false } })
    );
    expect(result.success).toBe(false);
  });

  it('accepts last_working_day without payDayFixed', () => {
    const result = UserProfileSchema.safeParse(
      makeUserProfile({ preferences: { payDayType: 'last_working_day', currency: 'ZAR', theme: 'dark', notificationsEnabled: false } })
    );
    expect(result.success).toBe(true);
  });

  it('rejects invalid payDayType', () => {
    const result = UserProfileSchema.safeParse(
      makeUserProfile({ preferences: { payDayType: 'weekly', currency: 'ZAR', theme: 'dark', notificationsEnabled: false } })
    );
    expect(result.success).toBe(false);
  });

  it('rejects currency other than ZAR', () => {
    const result = UserProfileSchema.safeParse(
      makeUserProfile({ preferences: { payDayType: 'fixed', payDayFixed: 25, currency: 'USD', theme: 'dark', notificationsEnabled: false } })
    );
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Expense — amount must be positive integer cents (Req 5.1)
// ---------------------------------------------------------------------------

describe('ExpenseSchema — amount constraints', () => {
  it('accepts a valid expense', () => {
    expect(ExpenseSchema.safeParse(makeExpense()).success).toBe(true);
  });

  it('rejects amount = 0', () => {
    expect(ExpenseSchema.safeParse(makeExpense({ amount: 0 })).success).toBe(false);
  });

  it('rejects negative amount', () => {
    expect(ExpenseSchema.safeParse(makeExpense({ amount: -100 })).success).toBe(false);
  });

  it('rejects non-integer amount', () => {
    expect(ExpenseSchema.safeParse(makeExpense({ amount: 9.99 })).success).toBe(false);
  });

  it('accepts valid status values', () => {
    expect(ExpenseSchema.safeParse(makeExpense({ status: 'pending' })).success).toBe(true);
    expect(ExpenseSchema.safeParse(makeExpense({ status: 'paid' })).success).toBe(true);
  });

  it('rejects invalid status', () => {
    expect(ExpenseSchema.safeParse(makeExpense({ status: 'overdue' })).success).toBe(false);
  });

  it('accepts optional linkedTo', () => {
    const result = ExpenseSchema.safeParse(
      makeExpense({ linkedTo: { type: 'goal', id: 'goal-1' } })
    );
    expect(result.success).toBe(true);
  });

  it('rejects invalid linkedTo type', () => {
    const result = ExpenseSchema.safeParse(
      makeExpense({ linkedTo: { type: 'bank', id: 'x' } })
    );
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// BaseExpense (Req 6.1)
// ---------------------------------------------------------------------------

describe('BaseExpenseSchema', () => {
  const base = {
    id: 'base-1',
    label: 'Netflix',
    amount: 19900,
    category: 'subscriptions',
    accountType: 'personal',
    sortOrder: 0,
    isActive: true,
    createdAt: ts,
    updatedAt: ts,
  };

  it('accepts a valid base expense', () => {
    expect(BaseExpenseSchema.safeParse(base).success).toBe(true);
  });

  it('rejects zero amount', () => {
    expect(BaseExpenseSchema.safeParse({ ...base, amount: 0 }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Folder
// ---------------------------------------------------------------------------

describe('FolderSchema', () => {
  const folder = {
    id: 'folder-1',
    name: 'March 2026',
    type: 'monthly',
    sortOrder: 0,
    isArchived: false,
    createdAt: ts,
    updatedAt: ts,
  };

  it('accepts a valid folder', () => {
    expect(FolderSchema.safeParse(folder).success).toBe(true);
  });

  it('rejects invalid folder type', () => {
    expect(FolderSchema.safeParse({ ...folder, type: 'personal' }).success).toBe(false);
  });

  it('accepts income with positive amount', () => {
    const result = FolderSchema.safeParse({
      ...folder,
      income: { amount: 5_000_000, verified: false },
    });
    expect(result.success).toBe(true);
  });

  it('rejects income with zero amount', () => {
    const result = FolderSchema.safeParse({
      ...folder,
      income: { amount: 0, verified: false },
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Goal (Req 9.1)
// ---------------------------------------------------------------------------

describe('GoalSchema', () => {
  const goal = {
    id: 'goal-1',
    title: 'Emergency Fund',
    type: 'savings',
    currentAmount: 0,
    contributions: [],
    status: 'pending',
    isOnTrack: true,
    monthsBehind: 0,
    year: 2026,
    priority: 'high',
    createdAt: ts,
    updatedAt: ts,
  };

  it('accepts a valid goal', () => {
    expect(GoalSchema.safeParse(goal).success).toBe(true);
  });

  it('accepts all goal types', () => {
    for (const type of ['savings', 'purchase', 'debt_payoff', 'milestone']) {
      expect(GoalSchema.safeParse({ ...goal, type }).success).toBe(true);
    }
  });

  it('rejects invalid goal type', () => {
    expect(GoalSchema.safeParse({ ...goal, type: 'loan' }).success).toBe(false);
  });

  it('rejects negative currentAmount', () => {
    expect(GoalSchema.safeParse({ ...goal, currentAmount: -1 }).success).toBe(false);
  });

  it('rejects negative targetAmount', () => {
    expect(GoalSchema.safeParse({ ...goal, targetAmount: -100 }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Investment (Req 11.1)
// ---------------------------------------------------------------------------

describe('InvestmentSchema', () => {
  const investment = {
    id: 'inv-1',
    name: 'Tax-Free Savings',
    type: 'fixed_term',
    targetAmount: 5_000_000,
    monthlyContribution: 250_000,
    termMonths: 24,
    startDate: ts,
    maturityDate: ts,
    totalContributed: 0,
    contributions: [],
    status: 'active',
    createdAt: ts,
    updatedAt: ts,
  };

  it('accepts a valid investment', () => {
    expect(InvestmentSchema.safeParse(investment).success).toBe(true);
  });

  it('rejects zero targetAmount', () => {
    expect(InvestmentSchema.safeParse({ ...investment, targetAmount: 0 }).success).toBe(false);
  });

  it('rejects zero termMonths', () => {
    expect(InvestmentSchema.safeParse({ ...investment, termMonths: 0 }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SavingsPot (Req 12.1)
// ---------------------------------------------------------------------------

describe('SavingsPotSchema', () => {
  const pot = {
    id: 'pot-1',
    name: 'Medical Aid',
    currentBalance: 0,
    totalContributed: 0,
    totalWithdrawn: 0,
    transactions: [],
    isOnTrack: true,
    monthsBehind: 0,
    createdAt: ts,
    updatedAt: ts,
  };

  it('accepts a valid savings pot', () => {
    expect(SavingsPotSchema.safeParse(pot).success).toBe(true);
  });

  it('rejects negative targetBalance', () => {
    expect(SavingsPotSchema.safeParse({ ...pot, targetBalance: -1 }).success).toBe(false);
  });

  it('accepts a transaction', () => {
    const result = SavingsPotSchema.safeParse({
      ...pot,
      transactions: [{ id: 'tx-1', type: 'contribution', amount: 50000, date: ts }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects transaction with zero amount', () => {
    const result = SavingsPotSchema.safeParse({
      ...pot,
      transactions: [{ id: 'tx-1', type: 'contribution', amount: 0, date: ts }],
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Insight
// ---------------------------------------------------------------------------

describe('InsightSchema', () => {
  const insight = {
    id: 'ins-1',
    type: 'trend',
    title: 'Housing up 15%',
    message: 'Your housing costs increased 15% year-over-year.',
    isRead: false,
    isDismissed: false,
    createdAt: ts,
  };

  it('accepts a valid insight', () => {
    expect(InsightSchema.safeParse(insight).success).toBe(true);
  });

  it('rejects invalid insight type', () => {
    expect(InsightSchema.safeParse({ ...insight, type: 'warning' }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// MonthlySnapshot
// ---------------------------------------------------------------------------

describe('MonthlySnapshotSchema', () => {
  const snapshot = {
    id: '2026-03',
    year: 2026,
    month: 3,
    totalBudgeted: 10_000_000,
    totalPaid: 8_000_000,
    categoryBreakdown: { housing: 5_000_000, transport: 1_000_000 },
    topExpenses: [{ label: 'Rent', amount: 5_000_000 }],
    goalsProgress: 75,
    createdAt: ts,
  };

  it('accepts a valid snapshot', () => {
    expect(MonthlySnapshotSchema.safeParse(snapshot).success).toBe(true);
  });

  it('rejects id not in YYYY-MM format', () => {
    expect(MonthlySnapshotSchema.safeParse({ ...snapshot, id: '2026/03' }).success).toBe(false);
  });

  it('rejects month out of range', () => {
    expect(MonthlySnapshotSchema.safeParse({ ...snapshot, month: 13 }).success).toBe(false);
  });

  it('rejects goalsProgress > 100', () => {
    expect(MonthlySnapshotSchema.safeParse({ ...snapshot, goalsProgress: 101 }).success).toBe(false);
  });
});
