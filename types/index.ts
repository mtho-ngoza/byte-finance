import type { Timestamp } from 'firebase/firestore';

export type ExpenseCategory =
  | 'housing'
  | 'transport'
  | 'family'
  | 'business'
  | 'living'
  | 'health'
  | 'education'
  | 'savings'
  | 'entertainment'
  | 'subscriptions'
  | 'other';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  preferences: {
    payDayType: 'fixed' | 'last_working_day';
    payDayFixed?: number; // 1–28
    currency: 'ZAR';
    theme: 'dark' | 'light';
    notificationsEnabled: boolean;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Folder {
  id: string;
  name: string;
  type: 'monthly' | 'project' | 'savings' | 'goals';
  icon?: string;
  color?: string;
  period?: { month: number; year: number };
  income?: {
    amount: number;
    source?: string;
    receivedDate?: Timestamp;
    verified: boolean;
  };
  sortOrder: number;
  isArchived: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Expense {
  id: string;
  folderId: string;
  label: string;
  amount: number; // cents
  status: 'pending' | 'paid';
  category: ExpenseCategory;
  accountType: 'personal' | 'business';
  linkedTo?: { type: 'goal' | 'investment' | 'savings_pot'; id: string };
  dueDate?: Timestamp;
  paidDate?: Timestamp;
  notes?: string;
  tags?: string[];
  sortOrder: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface BaseExpense {
  id: string;
  label: string;
  amount: number; // cents
  category: ExpenseCategory;
  accountType: 'personal' | 'business';
  linkedTo?: { type: 'goal' | 'investment' | 'savings_pot'; id: string };
  sortOrder: number;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Goal {
  id: string;
  title: string;
  type: 'savings' | 'purchase' | 'debt_payoff' | 'milestone';
  targetAmount?: number; // cents
  currentAmount: number; // cents
  debtTracking?: {
    originalBalance: number; // cents
    currentBalance: number; // cents
    interestRate?: number;
    minimumPayment?: number; // cents
    lender?: string;
    accountNumber?: string;
    projectedPayoffDate?: Timestamp;
  };
  expectedMonthlyContribution?: number; // cents
  linkedExpenseLabel?: string;
  contributions: Array<{
    date: Timestamp;
    amount: number; // cents
    expenseId: string;
    folderId: string;
  }>;
  startDate?: Timestamp;
  targetDate?: Timestamp;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  isOnTrack: boolean;
  monthsBehind: number;
  year: number;
  priority: 'high' | 'medium' | 'low';
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt?: Timestamp;
}

export interface Investment {
  id: string;
  name: string;
  type: 'fixed_term' | 'recurring' | 'stocks' | 'other';
  targetAmount: number; // cents
  monthlyContribution: number; // cents
  termMonths: number;
  startDate: Timestamp;
  maturityDate: Timestamp;
  totalContributed: number; // cents
  contributions: Array<{ date: Timestamp; amount: number; note?: string }>;
  status: 'active' | 'matured' | 'withdrawn' | 'paused';
  institution?: string;
  accountNumber?: string;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface SavingsPot {
  id: string;
  name: string;
  description?: string;
  targetBalance?: number; // cents
  currentBalance: number; // cents
  totalContributed: number; // cents
  totalWithdrawn: number; // cents
  linkedExpenseLabel?: string;
  expectedMonthlyContribution?: number; // cents
  transactions: Array<{
    id: string;
    type: 'contribution' | 'withdrawal';
    amount: number; // cents
    date: Timestamp;
    description?: string;
    linkedExpenseId?: string;
    linkedFolderId?: string;
  }>;
  isOnTrack: boolean;
  monthsBehind: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Insight {
  id: string;
  type: 'trend' | 'alert' | 'suggestion' | 'achievement';
  title: string;
  message: string;
  data?: Record<string, unknown>;
  isRead: boolean;
  isDismissed: boolean;
  snoozedUntil?: Timestamp;
  expiresAt?: Timestamp;
  createdAt: Timestamp;
}

export interface MonthlySnapshot {
  id: string; // "2026-03"
  year: number;
  month: number;
  totalBudgeted: number; // cents
  totalPaid: number; // cents
  categoryBreakdown: Record<ExpenseCategory, number>;
  topExpenses: Array<{ label: string; amount: number }>;
  goalsProgress: number; // 0–100 percentage
  createdAt: Timestamp;
}
