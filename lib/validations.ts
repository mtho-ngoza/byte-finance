import { z } from 'zod';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Firestore Timestamp-like object (seconds + nanoseconds). */
const TimestampSchema = z.object({
  seconds: z.number().int(),
  nanoseconds: z.number().int().min(0).max(999_999_999),
});

/** All monetary amounts are stored as positive integers in ZAR cents. */
const CentsSchema = z.number().int().positive();

/** Optional monetary amount (still must be a positive integer when present). */
const OptionalCentsSchema = z.number().int().positive().optional();

// ---------------------------------------------------------------------------
// ExpenseCategory
// ---------------------------------------------------------------------------

export const ExpenseCategorySchema = z.enum([
  'housing',
  'transport',
  'family',
  'business',
  'living',
  'health',
  'education',
  'savings',
  'entertainment',
  'subscriptions',
  'other',
]);

export type ExpenseCategory = z.infer<typeof ExpenseCategorySchema>;

// ---------------------------------------------------------------------------
// UserProfile
// ---------------------------------------------------------------------------

export const UserPreferencesSchema = z.object({
  payDayType: z.enum(['fixed', 'last_working_day']),
  /** Only required when payDayType is 'fixed'. Must be 1–28. */
  payDayFixed: z.number().int().min(1).max(28).optional(),
  currency: z.literal('ZAR'),
  theme: z.enum(['dark', 'light']),
  notificationsEnabled: z.boolean(),
});

export const UserProfileSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  displayName: z.string().min(1),
  preferences: UserPreferencesSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export type UserProfile = z.infer<typeof UserProfileSchema>;

// ---------------------------------------------------------------------------
// Folder
// ---------------------------------------------------------------------------

export const FolderPeriodSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000),
});

export const FolderIncomeSchema = z.object({
  amount: CentsSchema,
  source: z.string().optional(),
  receivedDate: TimestampSchema.optional(),
  verified: z.boolean(),
});

export const FolderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['monthly', 'project', 'savings', 'goals']),
  icon: z.string().optional(),
  color: z.string().optional(),
  period: FolderPeriodSchema.optional(),
  income: FolderIncomeSchema.optional(),
  sortOrder: z.number().int().min(0),
  isArchived: z.boolean(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export type Folder = z.infer<typeof FolderSchema>;

// ---------------------------------------------------------------------------
// LinkedTo (shared by Expense and BaseExpense)
// ---------------------------------------------------------------------------

export const LinkedToSchema = z.object({
  type: z.enum(['goal', 'investment', 'savings_pot']),
  id: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Expense
// ---------------------------------------------------------------------------

export const ExpenseSchema = z.object({
  id: z.string().min(1),
  folderId: z.string().min(1),
  label: z.string().min(1),
  amount: CentsSchema,
  status: z.enum(['pending', 'paid']),
  category: ExpenseCategorySchema,
  accountType: z.enum(['personal', 'business']),
  linkedTo: LinkedToSchema.optional(),
  dueDate: TimestampSchema.optional(),
  paidDate: TimestampSchema.optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  sortOrder: z.number().int().min(0),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export type Expense = z.infer<typeof ExpenseSchema>;

// ---------------------------------------------------------------------------
// BaseExpense
// ---------------------------------------------------------------------------

export const BaseExpenseSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  amount: CentsSchema,
  category: ExpenseCategorySchema,
  accountType: z.enum(['personal', 'business']),
  linkedTo: LinkedToSchema.optional(),
  sortOrder: z.number().int().min(0),
  isActive: z.boolean(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export type BaseExpense = z.infer<typeof BaseExpenseSchema>;

// ---------------------------------------------------------------------------
// Goal
// ---------------------------------------------------------------------------

export const GoalContributionSchema = z.object({
  date: TimestampSchema,
  amount: CentsSchema,
  expenseId: z.string().min(1),
  folderId: z.string().min(1),
});

export const DebtTrackingSchema = z.object({
  originalBalance: CentsSchema,
  currentBalance: CentsSchema,
  interestRate: z.number().min(0).optional(),
  minimumPayment: OptionalCentsSchema,
  lender: z.string().optional(),
  accountNumber: z.string().optional(),
  projectedPayoffDate: TimestampSchema.optional(),
});

export const GoalSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  type: z.enum(['savings', 'purchase', 'debt_payoff', 'milestone']),
  targetAmount: OptionalCentsSchema,
  currentAmount: z.number().int().min(0),
  debtTracking: DebtTrackingSchema.optional(),
  expectedMonthlyContribution: OptionalCentsSchema,
  linkedExpenseLabel: z.string().optional(),
  contributions: z.array(GoalContributionSchema),
  startDate: TimestampSchema.optional(),
  targetDate: TimestampSchema.optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']),
  isOnTrack: z.boolean(),
  monthsBehind: z.number().int().min(0),
  year: z.number().int().min(2000),
  priority: z.enum(['high', 'medium', 'low']),
  notes: z.string().optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  completedAt: TimestampSchema.optional(),
});

export type Goal = z.infer<typeof GoalSchema>;

// ---------------------------------------------------------------------------
// Investment
// ---------------------------------------------------------------------------

export const InvestmentContributionSchema = z.object({
  date: TimestampSchema,
  amount: CentsSchema,
  note: z.string().optional(),
});

export const InvestmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['fixed_term', 'recurring', 'stocks', 'other']),
  targetAmount: CentsSchema,
  monthlyContribution: CentsSchema,
  termMonths: z.number().int().positive(),
  startDate: TimestampSchema,
  maturityDate: TimestampSchema,
  totalContributed: z.number().int().min(0),
  contributions: z.array(InvestmentContributionSchema),
  status: z.enum(['active', 'matured', 'withdrawn', 'paused']),
  institution: z.string().optional(),
  accountNumber: z.string().optional(),
  notes: z.string().optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export type Investment = z.infer<typeof InvestmentSchema>;

// ---------------------------------------------------------------------------
// SavingsPot
// ---------------------------------------------------------------------------

export const SavingsPotTransactionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['contribution', 'withdrawal']),
  amount: CentsSchema,
  date: TimestampSchema,
  description: z.string().optional(),
  linkedExpenseId: z.string().optional(),
  linkedFolderId: z.string().optional(),
});

export const SavingsPotSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  targetBalance: OptionalCentsSchema,
  currentBalance: z.number().int().min(0),
  totalContributed: z.number().int().min(0),
  totalWithdrawn: z.number().int().min(0),
  linkedExpenseLabel: z.string().optional(),
  expectedMonthlyContribution: OptionalCentsSchema,
  transactions: z.array(SavingsPotTransactionSchema),
  isOnTrack: z.boolean(),
  monthsBehind: z.number().int().min(0),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export type SavingsPot = z.infer<typeof SavingsPotSchema>;

// ---------------------------------------------------------------------------
// Insight
// ---------------------------------------------------------------------------

export const InsightSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['trend', 'alert', 'suggestion', 'achievement']),
  title: z.string().min(1),
  message: z.string().min(1),
  data: z.record(z.string(), z.unknown()).optional(),
  isRead: z.boolean(),
  isDismissed: z.boolean(),
  snoozedUntil: TimestampSchema.optional(),
  expiresAt: TimestampSchema.optional(),
  createdAt: TimestampSchema,
});

export type Insight = z.infer<typeof InsightSchema>;

// ---------------------------------------------------------------------------
// MonthlySnapshot
// ---------------------------------------------------------------------------

export const MonthlySnapshotSchema = z.object({
  id: z.string().regex(/^\d{4}-\d{2}$/, 'id must be in YYYY-MM format'),
  year: z.number().int().min(2000),
  month: z.number().int().min(1).max(12),
  totalBudgeted: z.number().int().min(0),
  totalPaid: z.number().int().min(0),
  categoryBreakdown: z.record(z.string(), z.number().int().min(0)),
  topExpenses: z.array(
    z.object({
      label: z.string().min(1),
      amount: CentsSchema,
    })
  ),
  goalsProgress: z.number().min(0).max(100),
  createdAt: TimestampSchema,
});

export type MonthlySnapshot = z.infer<typeof MonthlySnapshotSchema>;
