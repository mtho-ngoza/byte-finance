import type { Timestamp } from 'firebase/firestore';

/**
 * Category classification for commitments and cycle items
 */
export type Category =
  | 'housing'      // Bond, Levies, Rates, Electricity
  | 'transport'    // Car Insurance, Petrol, Car tracker
  | 'family'       // Support payments, school fees
  | 'utilities'    // Fibre, DSTV, subscriptions
  | 'health'       // Medical aid, pharmacy
  | 'education'    // UNISA, courses
  | 'savings'      // Emergency fund, investments
  | 'lifestyle'    // Entertainment, dining, shopping
  | 'business'     // PAYE, accounting, business expenses
  | 'other';

/**
 * Status flow for cycle items: upcoming → due → paid (or skipped)
 */
export type CycleItemStatus = 'upcoming' | 'due' | 'paid' | 'skipped';

/**
 * User profile with preferences
 */
export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  preferences: {
    payDayType: 'fixed' | 'last_working_day';
    payDayFixed?: number; // 1-28, used if type is 'fixed'
    currency: 'ZAR';
    theme: 'dark' | 'light';
    notificationsEnabled: boolean;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Commitment - A recurring monthly financial obligation
 * Templates that spawn CycleItems each pay cycle
 */
export interface Commitment {
  id: string;
  label: string;                    // "Bond", "Medical Aid", "Grocery"
  amount: number;                   // Default amount in cents
  category: Category;
  accountType: 'personal' | 'business';

  // Smart linking - auto-contribute to goal when paid
  linkedGoalId?: string;

  // Scheduling
  dueDay?: number;                  // Day of month when typically due (1-31)
  isVariable: boolean;              // True for expenses that vary (grocery, petrol)

  // Organization
  sortOrder: number;
  isActive: boolean;                // Can disable without deleting
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Goal - A financial target (savings, debt payoff, or investment)
 */
export interface Goal {
  id: string;
  name: string;                     // "Medical Fund", "Pay off car", "Byte Fusion"
  type: 'savings' | 'debt_payoff' | 'investment';

  // Target tracking
  targetAmount: number;             // Target in cents
  currentAmount: number;            // Current progress (auto-calculated)

  // For debt_payoff type
  debtTracking?: {
    originalBalance: number;        // Starting debt amount in cents
    interestRate?: number;          // Annual rate (0.105 = 10.5%)
    minimumPayment?: number;        // Minimum monthly payment in cents
    lender?: string;
    accountNumber?: string;
  };

  // For investment type
  investmentTracking?: {
    termMonths: number;
    startDate: Timestamp;
    maturityDate: Timestamp;
    institution?: string;
  };

  // Contribution expectations
  monthlyTarget?: number;           // Manual monthly target (if not using linked commitments)
  linkedCommitmentLabel?: string;   // For auto-linking suggestions

  // Deadline tracking
  targetDate?: Timestamp;           // When goal should be achieved
  calculationMode?: 'monthly_fixed' | 'deadline_fixed';  // How goal was set up

  // Contribution history
  contributions: Array<{
    id: string;
    date: Timestamp;
    amount: number;                 // cents
    cycleId: string;
    cycleItemId?: string;
    note?: string;
  }>;

  // For savings type with withdrawals (e.g., Medical Fund)
  allowWithdrawals: boolean;
  withdrawals?: Array<{
    id: string;
    date: Timestamp;
    amount: number;                 // cents
    description: string;
  }>;

  // Status
  status: 'active' | 'completed' | 'paused';
  isOnTrack: boolean;               // Calculated: meeting expected pace?

  // Metadata
  priority: 'high' | 'medium' | 'low';
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt?: Timestamp;
}

/**
 * Cycle - An auto-generated pay period
 */
export interface Cycle {
  id: string;                       // Format: "2026-04"

  // Period boundaries
  startDate: Timestamp;             // Pay day of this cycle
  endDate: Timestamp;               // Day before next pay day

  // Income for this cycle
  income?: {
    amount: number;                 // cents (gross amount including VAT)
    vatAmount?: number;             // cents (VAT portion - not your money, belongs to SARS)
    source?: string;
    receivedDate?: Timestamp;
    verified: boolean;
  };

  // Calculated totals (denormalized for fast reads)
  totalCommitted: number;           // Sum of all item amounts in cents
  totalPaid: number;                // Sum of paid item amounts in cents
  itemCount: number;
  paidCount: number;

  // Status
  status: 'active' | 'closed';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * CycleItem - An individual item within a cycle
 * Spawned from Commitments or added as one-offs
 */
export interface CycleItem {
  id: string;
  cycleId: string;

  // Source tracking
  commitmentId?: string;            // Null for one-off items

  // Item details
  label: string;
  amount: number;                   // cents
  category: Category;
  accountType: 'personal' | 'business';

  // Status flow
  status: CycleItemStatus;

  // Timing
  dueDate?: Timestamp;
  paidDate?: Timestamp;

  // Smart linking
  linkedGoalId?: string;

  // Metadata
  notes?: string;
  tags?: string[];
  sortOrder: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Insight - AI-generated observations and alerts
 */
export interface Insight {
  id: string;
  type: 'trend' | 'alert' | 'suggestion' | 'achievement';
  title: string;
  message: string;
  data?: Record<string, unknown>;
  isRead: boolean;
  isDismissed: boolean;
  expiresAt?: Timestamp;
  createdAt: Timestamp;
}

/**
 * MonthlySnapshot - Aggregated data for trend analysis
 */
export interface MonthlySnapshot {
  id: string;                       // Format: "2026-04"
  year: number;
  month: number;
  totalCommitted: number;           // cents
  totalPaid: number;                // cents
  categoryBreakdown: Record<Category, number>;
  topItems: Array<{ label: string; amount: number }>;
  goalsProgress: number;            // Overall goal progress percentage (0-100)
  createdAt: Timestamp;
}

/**
 * Helper type for creating new documents (without id and timestamps)
 */
export type CreateCommitment = Omit<Commitment, 'id' | 'createdAt' | 'updatedAt'>;
export type CreateGoal = Omit<Goal, 'id' | 'createdAt' | 'updatedAt' | 'completedAt' | 'contributions' | 'withdrawals' | 'currentAmount' | 'isOnTrack'>;
export type CreateCycle = Omit<Cycle, 'id' | 'createdAt' | 'updatedAt'>;
export type CreateCycleItem = Omit<CycleItem, 'id' | 'createdAt' | 'updatedAt'>;
