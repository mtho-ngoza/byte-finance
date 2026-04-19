# ByteFinance AI - Technical Specification

> Personal Financial Command Center for ZAR-based expense tracking, planning, and AI-powered advisory.

---

## 1. Overview

### 1.1 Problem Statement
Manual expense tracking in Samsung Notes works but provides:
- No trend visibility across 8+ years of data
- No automated insights ("Emergency savings still dololo")
- No forecasting for seasonal expenses
- Manual calculation of totals and balances

### 1.2 Solution
A mobile-first web app that mirrors the familiar checkbox workflow while adding intelligence layers for trend analysis, goal tracking, and proactive financial guidance.

### 1.3 Design Principles
1. **Modern & Usable** - Clean, intuitive UI optimized for quick updates (not a Samsung Notes clone)
2. **Gentle Intelligence** - Suggestions, not warnings; insights, not judgments
3. **Offline First** - Full functionality without internet, seamless sync when available
4. **Data Ownership** - All data exportable, no vendor lock-in

---

## 2. Technical Stack

### 2.1 Core Stack
| Layer | Technology | Rationale |
|-------|------------|-----------|
| Framework | Next.js 14+ (App Router) | SSR, API routes, excellent DX |
| Styling | Tailwind CSS | Rapid UI development, dark mode support |
| Database | Firebase Firestore | Real-time sync, offline persistence |
| Auth | Firebase Auth | Simple, secure, supports multiple providers |
| Hosting | Vercel | Edge functions, automatic deployments |
| AI | Gemini API | Cost-effective, good at structured extraction |

### 2.2 Future Considerations
| Feature | Technology | Phase |
|---------|------------|-------|
| Native App | Capacitor | Phase 3 |
| Notifications | Firebase Cloud Messaging | Phase 2 |
| Bank Import | Plaid/Stitch (SA) | Phase 4 |

---

## 3. Data Architecture

### 3.1 Firestore Collections

```typescript
// Collection: users/{userId}
interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  preferences: {
    payDayType: 'fixed' | 'last_working_day';  // Configurable pay day logic
    payDayFixed?: number;                       // 1-31, used if type is 'fixed'
    currency: 'ZAR';
    theme: 'dark' | 'light';
    notificationsEnabled: boolean;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Helper: Calculate actual pay day for a given month
// Last working day = last weekday (Mon-Fri) excluding SA public holidays
function getPayDay(year: number, month: number, prefs: UserProfile['preferences']): Date {
  if (prefs.payDayType === 'fixed') {
    return new Date(year, month, prefs.payDayFixed);
  }
  // Last working day logic
  const lastDay = new Date(year, month + 1, 0); // Last day of month
  while (isWeekend(lastDay) || isPublicHoliday(lastDay)) {
    lastDay.setDate(lastDay.getDate() - 1);
  }
  return lastDay;
}

// Collection: users/{userId}/folders/{folderId}
interface Folder {
  id: string;
  name: string;                  // "Monthly 2026", "Sbonga School", "Year Plans"
  type: 'monthly' | 'project' | 'savings' | 'goals';
  icon?: string;
  color?: string;
  period?: {                     // For monthly folders
    month: number;               // 1-12
    year: number;
  };

  // Income for this period (entered manually, verified via statement)
  income?: {
    amount: number;              // In cents
    source?: string;             // "Salary", "Business", etc.
    receivedDate?: Timestamp;
    verified: boolean;           // True once cross-checked with statement
  };

  sortOrder: number;
  isArchived: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Collection: users/{userId}/baseExpenses/{baseExpenseId}
// Template expenses that auto-populate each new month
interface BaseExpense {
  id: string;
  label: string;                 // "Bond", "Medical aid"
  amount: number;                // Default amount in cents
  category: ExpenseCategory;
  accountType: 'personal' | 'business';  // Separate tracking
  linkedTo?: {
    type: 'goal' | 'investment' | 'savings_pot';
    id: string;
  };
  sortOrder: number;
  isActive: boolean;             // Can disable without deleting
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// When creating a new monthly folder:
// 1. Copy all active BaseExpenses as new Expense documents
// 2. User can then modify amounts, add one-off expenses
// 3. BaseExpense template can be updated anytime (affects future months only)

// Collection: users/{userId}/expenses/{expenseId}
interface Expense {
  id: string;
  folderId: string;

  // Core fields (from your notes)
  label: string;                 // "Bond", "Medical aid", "Sbonga fees"
  amount: number;                // In cents to avoid float issues: 900000 = R9,000
  status: 'pending' | 'paid';

  // Categorization
  category: ExpenseCategory;
  subcategory?: string;
  accountType: 'personal' | 'business';  // Separate personal vs business expenses

  // === SMART LINKING ===
  // Link expense to a goal, investment, or savings pot
  linkedTo?: {
    type: 'goal' | 'investment' | 'savings_pot';
    id: string;                  // Reference to the goal/investment/savings_pot doc
  };
  // When this expense is marked "paid":
  // - Goal: Adds contribution to goal progress
  // - Investment: Adds contribution to investment
  // - Savings Pot: Adds contribution (you can later record withdrawals separately)

  // Timing
  dueDate?: Timestamp;           // Optional: when it should be paid
  paidDate?: Timestamp;          // When actually marked as paid

  // Recurrence (for templates)
  isRecurring: boolean;
  recurrenceRule?: {
    frequency: 'monthly' | 'yearly';
    dayOfMonth?: number;
  };

  // Metadata
  notes?: string;
  tags?: string[];               // ["priority", "debit-order", "variable"]

  // Tracking
  sortOrder: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Enum for categories (derived from your actual data)
type ExpenseCategory =
  | 'housing'        // Bond, Levies, Rates, Electricity (personal)
  | 'transport'      // Car Insurance, Petrol, Car track (personal)
  | 'family'         // Sbonga, Nhloso, Spouse support, Family support (personal)
  | 'business'       // PAYE, Accounting fees (business)
  | 'living'         // Grocery, Fibre, DSTV, Mweb (personal)
  | 'health'         // Medical aid (personal)
  | 'education'      // UNISA, School fees (personal)
  | 'savings'        // Emergency, Investments (personal)
  | 'entertainment'  // Entertainment, Travel, Shopping (personal)
  | 'subscriptions'  // Claude, streaming services (could be either)
  | 'other';

// Account type determines if expense shows in Personal or Business view
// Dashboard filter: [All] [Personal] [Business]

// Collection: users/{userId}/goals/{goalId}
interface Goal {
  id: string;
  title: string;                 // "Pay off car", "MacBook", "70k Medical aid"
  type: 'savings' | 'purchase' | 'debt_payoff' | 'milestone';

  // Financial targets (optional - some goals aren't monetary)
  targetAmount?: number;         // In cents: R70,000 = 7000000
  currentAmount: number;         // Auto-updated via Smart Linking

  // === DEBT PAYOFF TRACKING (for type: 'debt_payoff') ===
  debtTracking?: {
    originalBalance: number;     // Starting debt amount in cents
    currentBalance: number;      // Remaining balance (originalBalance - totalPaid)
    interestRate?: number;       // Annual interest rate (e.g., 0.105 for 10.5%)
    minimumPayment?: number;     // Required monthly payment
    lender?: string;             // "Absa", "MFC", "UNISA"
    accountNumber?: string;
    projectedPayoffDate?: Timestamp;  // Calculated based on payment rate
  };

  // Contribution tracking (for Smart Linking)
  expectedMonthlyContribution?: number;  // R6,000 = 600000
  linkedExpenseLabel?: string;           // "Medical aid" - for auto-linking
  contributions: Array<{                 // Auto-populated when linked expense paid
    date: Timestamp;
    amount: number;
    expenseId: string;                   // Reference to the expense that triggered this
    folderId: string;                    // Which month it came from
  }>;

  // Timeline
  startDate?: Timestamp;
  targetDate?: Timestamp;

  // Progress tracking
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  isOnTrack: boolean;            // Calculated: are contributions meeting expected pace?
  monthsBehind: number;          // 0 = on track, 2 = missed 2 months of contributions

  // Organization
  year: number;                  // For yearly grouping like your "Year Plans"
  priority: 'high' | 'medium' | 'low';
  notes?: string;

  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt?: Timestamp;
}

// Example: 70k Medical Aid Goal
// {
//   title: "70k Medical aid",
//   type: "savings",
//   targetAmount: 7000000,           // R70,000
//   currentAmount: 4200000,          // R42,000 (auto-tracked)
//   expectedMonthlyContribution: 600000,  // R6,000
//   linkedExpenseLabel: "Medical aid",
//   contributions: [
//     { date: "2025-01-25", amount: 600000, expenseId: "...", folderId: "jan-2025" },
//     { date: "2025-02-25", amount: 600000, expenseId: "...", folderId: "feb-2025" },
//     // ... 7 months of auto-tracked contributions
//   ],
//   isOnTrack: true,
//   monthsBehind: 0,
//   status: "in_progress"
// }

// Collection: users/{userId}/investments/{investmentId}
// For tracking investments like Byte Fusion (separate from expenses)
interface Investment {
  id: string;
  name: string;                  // "Byte Fusion"
  type: 'fixed_term' | 'recurring' | 'stocks' | 'other';

  // Terms
  targetAmount: number;          // In cents: R200,000 = 20000000
  monthlyContribution: number;   // In cents: R3,000 = 300000
  termMonths: number;            // 24 months
  startDate: Timestamp;
  maturityDate: Timestamp;

  // Progress
  totalContributed: number;      // Running total of contributions
  contributions: Array<{         // Individual contribution records
    date: Timestamp;
    amount: number;
    note?: string;
  }>;

  // Status
  status: 'active' | 'matured' | 'withdrawn' | 'paused';

  // Metadata
  institution?: string;          // Bank/provider name
  accountNumber?: string;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Example: Byte Fusion Investment
// {
//   name: "Byte Fusion",
//   type: "fixed_term",
//   targetAmount: 20000000,      // R200,000
//   monthlyContribution: 300000, // R3,000
//   termMonths: 24,
//   startDate: "2025-01-25",
//   maturityDate: "2027-01-25",
//   totalContributed: 450000,    // R4,500 (after 1.5 months)
//   status: "active"
// }

// Collection: users/{userId}/savingsPots/{potId}
// For funds with money flowing IN and OUT (like Medical Aid fund)
interface SavingsPot {
  id: string;
  name: string;                  // "Medical Aid Fund", "Emergency Fund", "Holiday Fund"
  description?: string;

  // Target (optional - some pots are just for tracking, no specific goal)
  targetBalance?: number;        // In cents: R70,000 = 7000000

  // Current state (calculated from transactions)
  currentBalance: number;        // Sum of contributions - sum of withdrawals
  totalContributed: number;      // Lifetime contributions
  totalWithdrawn: number;        // Lifetime withdrawals

  // Linked expense for auto-contributions
  linkedExpenseLabel?: string;   // "Medical aid" - auto-contribute when this expense is paid
  expectedMonthlyContribution?: number;  // R6,000 = 600000

  // Transactions (the key difference from Goals/Investments)
  transactions: Array<{
    id: string;
    type: 'contribution' | 'withdrawal';
    amount: number;              // Always positive, type determines direction
    date: Timestamp;
    description?: string;        // "Monthly contribution" or "Dr Naidoo visit"

    // For contributions linked to expenses
    linkedExpenseId?: string;
    linkedFolderId?: string;
  }>;

  // Tracking
  isOnTrack: boolean;            // Based on contribution pace
  monthsBehind: number;          // Missed contributions count

  // Metadata
  icon?: string;
  color?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Example: Medical Aid Fund
// {
//   name: "Medical Aid Fund",
//   targetBalance: 7000000,           // R70,000 goal
//   currentBalance: 2345000,          // R23,450 actual balance
//   totalContributed: 3600000,        // R36,000 (6 months × R6k)
//   totalWithdrawn: 1255000,          // R12,550 (medical expenses)
//   linkedExpenseLabel: "Medical aid",
//   expectedMonthlyContribution: 600000,
//   transactions: [
//     { type: "contribution", amount: 600000, date: "2026-03-25", description: "Monthly" },
//     { type: "withdrawal", amount: 120000, date: "2026-03-18", description: "Dr Naidoo" },
//     { type: "withdrawal", amount: 45000, date: "2026-03-12", description: "Clicks pharmacy" },
//     // ... more transactions
//   ],
//   isOnTrack: true,                  // Contributions on schedule
//   monthsBehind: 0
// }

// KEY DIFFERENCE BETWEEN ENTITY TYPES:
// ─────────────────────────────────────────────────────────────
// Goal:        One-time target, money only goes IN
//              Example: "Buy MacBook R35,000"
//
// Investment:  Fixed term, money only goes IN, has maturity date
//              Example: "Byte Fusion 24mo R200k"
//
// SavingsPot:  Ongoing fund, money goes IN and OUT, tracks balance
//              Example: "Medical Aid Fund" (contribute monthly, spend on medical)
// ─────────────────────────────────────────────────────────────

// Collection: users/{userId}/insights/{insightId}
// AI-generated insights stored for reference
interface Insight {
  id: string;
  type: 'trend' | 'alert' | 'suggestion' | 'achievement';
  title: string;
  message: string;
  data?: Record<string, any>;    // Supporting data for the insight
  isRead: boolean;
  isDismissed: boolean;
  expiresAt?: Timestamp;
  createdAt: Timestamp;
}

// Collection: users/{userId}/history/{historyId}
// Aggregated monthly snapshots for fast trend queries
interface MonthlySnapshot {
  id: string;                    // Format: "2026-03"
  year: number;
  month: number;
  totalBudgeted: number;
  totalPaid: number;
  categoryBreakdown: Record<ExpenseCategory, number>;
  topExpenses: Array<{ label: string; amount: number }>;
  goalsProgress: number;         // Percentage
  createdAt: Timestamp;
}
```

### 3.2 Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Helper function
    function isOwner(userId) {
      return request.auth != null && request.auth.uid == userId;
    }

    // User profile
    match /users/{userId} {
      allow read, write: if isOwner(userId);

      // All subcollections
      match /{subcollection}/{docId} {
        allow read, write: if isOwner(userId);
      }
    }
  }
}
```

### 3.3 Indexes Required

```json
{
  "indexes": [
    {
      "collectionGroup": "expenses",
      "fields": [
        { "fieldPath": "folderId", "order": "ASCENDING" },
        { "fieldPath": "sortOrder", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "expenses",
      "fields": [
        { "fieldPath": "category", "order": "ASCENDING" },
        { "fieldPath": "paidDate", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "goals",
      "fields": [
        { "fieldPath": "year", "order": "DESCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" }
      ]
    }
  ]
}
```

---

## 4. Feature Specifications

### 4.1 Phase 1: Core Tracking (MVP)

#### F1.1 Authentication
- Google Sign-In (primary)
- Email/Password (fallback)
- Persistent session
- Single user per account (no sharing in v1)

#### F1.2 Folder Management
```
Features:
- Create/edit/delete folders
- Folder types: Monthly, Project, Savings, Goals
- Auto-create monthly folder based on pay date
- Archive old folders (not delete)
- Folder progress ring (paid/total items)

UI Reference:
┌─────────────────────────────────────────┐
│  ◉ March 2026          ◉ February 2026  │
│    ████████░░ 85%        ██████████ 100%│
│    R71,500/R84,000       R83,090        │
├─────────────────────────────────────────┤
│  ◉ Sbonga School       ◉ Year Plans     │
│    ██░░░░░░░░ 20%        ██████░░░░ 60% │
│    R4,200/R21,000        12/20 goals    │
└─────────────────────────────────────────┘
```

#### F1.3 Expense Management
```
Features:
- Add/edit/delete expenses
- Quick-tick to mark as paid (primary interaction)
- Drag to reorder
- Swipe actions (edit, delete)
- Running total display
- Balance calculation (income - total)

UI Reference:
┌─────────────────────────────────────────┐
│ March 2026                    R84,000 ▼ │
│ ═══════════════════════════════════════ │
│ ☑ Bond ─────────────────────── R9,000  │
│ ☑ Medical aid ──────────────── R6,000  │
│ ☑ Car Insurance ────────────── R8,000  │
│ ☐ Grocery ──────────────────── R4,000  │
│ ☐ Emergency ────────────────── R1,000  │
│ ─────────────────────────────────────── │
│ Total: R83,990    Paid: R71,500        │
│ Balance: R12,490                        │
└─────────────────────────────────────────┘
```

#### F1.4 Pay Cycle Logic
```
Features:
- Configurable pay day with two modes:
  1. Fixed date (e.g., 25th of every month)
  2. Last working day (excludes weekends + SA public holidays)
- Monthly view resets on pay day, not 1st
- "Days until pay day" indicator
- Carry-over handling for unpaid items
- Pay day setting changeable (for job changes)

Logic for Last Working Day:
- Calculate last day of month
- Walk backwards skipping Sat/Sun
- Skip SA public holidays (Easter, Heritage Day, etc.)
- Example: March 2026 last working day = March 31 (Tuesday)

Cycle Boundaries:
- "March 2026" cycle = Feb pay day → Mar pay day - 1
- Current cycle determined dynamically based on calculated pay day
```

#### F1.5 Base Expenses (Monthly Templates)
```
Purpose: Define recurring expenses that auto-populate each new month

How It Works:
┌─────────────────────────────────────────────────────────────┐
│  BASE EXPENSES (Your Template)                              │
│  ═══════════════════════════════════════════════════════════│
│  These auto-create in every new monthly folder:             │
│                                                             │
│  Personal:                                                  │
│  ☑ Bond ────────────────────────────────────── R9,000      │
│  ☑ Medical aid ─────────────────────────────── R6,000      │
│  ☑ Car Insurance ───────────────────────────── R4,000      │
│  ☑ Grocery ─────────────────────────────────── R4,000      │
│  ...                                                        │
│                                                             │
│  Business:                                                  │
│  ☑ PAYE ────────────────────────────────────── R1,800      │
│  ☑ Accounting fees ─────────────────────────── R3,900      │
│  ...                                                        │
│                                                             │
│  [+ Add Base Expense]                    [Edit Template]    │
└─────────────────────────────────────────────────────────────┘

Creating New Month:
1. User clicks "New Month" or system auto-creates on pay day
2. All active Base Expenses copied as new Expense items
3. Amounts default to template values
4. User can adjust amounts for this specific month
5. User can add one-off expenses (e.g., "Trip to KZN R5,000")

Updating Base Expenses:
- Changes apply to FUTURE months only
- Existing months keep their values
- Can increase/decrease default amounts anytime
- Can disable items without deleting (for temporary pauses)

Personal vs Business:
- Base Expenses tagged as 'personal' or 'business'
- Dashboard can show: All | Personal Only | Business Only
- Helps separate for tax purposes
```

#### F1.6 Offline Support
```
Implementation:
- Firestore persistence enabled
- Optimistic UI updates
- Sync indicator in header
- Conflict resolution: last-write-wins

Code:
import { enableIndexedDbPersistence } from 'firebase/firestore';
enableIndexedDbPersistence(db);
```

---

### 4.2 Phase 2: Intelligence Layer

#### F2.1 Dashboard
```
Components:
1. Balance Ring - Visual income vs committed
2. Category Breakdown - Pie/donut chart
3. Month Comparison - vs last month, vs same month last year
4. Upcoming - Items due in next 7 days
5. Quick Stats - Total paid, pending, largest expense

Data Flow:
- Real-time subscription to current month expenses
- Aggregated data from MonthlySnapshot collection
```

#### F2.2 Trend Analysis
```
Insights Generated:
- "Medical aid increased 15% year-over-year"
- "Your entertainment spending peaks in December"
- "Sbonga fees have been consistent at R2,000 for 18 months"
- "Electricity varies R800-R1,800 seasonally"

Implementation:
- Nightly Cloud Function aggregates data
- Compare current month to: last month, 3-month average, same month last year
- Store insights in /insights collection
- Surface top 3 on dashboard
```

#### F2.3 Smart Linking (Core Feature)
```
Problem Solved:
- You pay "Medical aid R6,000" every month
- You have a goal "70k Medical aid savings"
- These don't connect → goal shows R0 even after paying for years

Solution:
- Link recurring expenses to goals/investments/savings
- When expense marked "paid" → target auto-updates
- Progress tracked automatically across months/years

How It Works:
┌─────────────────────────────────────────────────────────────┐
│ EXPENSE                          LINKED TARGET              │
│ ─────────────────────────────────────────────────────────── │
│ Medical aid - R6,000      →      Savings Pot: Medical Fund  │
│                                  (tracks balance with ins/outs)
│ Byte Fusion - R3,000      →      Investment: Byte Fusion    │
│                                  (fixed term, contributions only)
│ Emergency - R1,000        →      Savings Pot: Emergency Fund│
│                                  (tracks balance with ins/outs)
│ Sbonga fees - R2,000      →      Goal: Education Fund       │
│                                  (one-time target, contributions only)
└─────────────────────────────────────────────────────────────┘

Choosing the Right Target Type:
- Use SAVINGS POT when: Money goes in AND out (Medical, Emergency, Holiday)
- Use INVESTMENT when: Fixed term with maturity date (Byte Fusion, Unit Trusts)
- Use GOAL when: One-time purchase/milestone (MacBook, Pay off car)

Flow When Marking Expense as Paid:
1. User taps checkbox on "Medical aid - R6,000"
2. System checks: Is this expense linked to a target?
3. If YES → Auto-record R6,000 contribution to "70k Medical aid" goal
4. Goal progress updates: R42,000 / R70,000 (60%)
5. If goal complete → Celebration notification!

Smart Suggestions:
- "Medical aid" expense detected, no link exists
- System suggests: "Link to '70k Medical aid' goal?"
- One tap to connect

Alerts & Notifications:
- "You're 2 months behind on Emergency fund contributions"
- "Byte Fusion on track: R45,000 / R200,000 (22.5%)"
- "Medical aid goal reached! R70,000 achieved in 12 months"

Backfill Historical Data:
- When linking an expense to a target for the first time
- Option: "Apply to previous months?"
- System scans past folders for same expense label
- Auto-calculates total contributed historically
```

#### F2.4 Savings Pots (Funds with In/Out Flow)
```
Purpose: Track funds where money flows BOTH in and out
Examples: Medical Aid Fund, Emergency Fund, Holiday Savings, School Fund

Key Difference from Goals:
- Goal: "Save R70k for medical" → only track money IN
- Savings Pot: "Medical fund" → track money IN and OUT, show real balance

Features:
- Create named savings pots
- Link to monthly expense for auto-contributions
- Quick-add withdrawals (spending from the pot)
- Transaction history (all ins and outs)
- Real balance calculation
- Progress toward target balance (optional)

UI Reference:
┌─────────────────────────────────────────────────────────────┐
│  Medical Aid Fund                                           │
│  ───────────────────────────────────────────────────────────│
│  Balance: R23,450              Target: R70,000              │
│  ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 33%              │
│  ───────────────────────────────────────────────────────────│
│  This Month:                                                │
│  + R6,000   Contribution (auto from expense)                │
│  - R1,200   Dr Naidoo                        [Mar 18]       │
│  - R450     Clicks pharmacy                  [Mar 12]       │
│  ───────────────────────────────────────────────────────────│
│  Net this month: +R4,350                                    │
│  ───────────────────────────────────────────────────────────│
│  [+ Add Contribution]              [- Record Spending]      │
└─────────────────────────────────────────────────────────────┘

Withdrawal Entry:
- Quick form: Amount + Description + Date
- Optional: Categorize (doctor, pharmacy, hospital, etc.)
- Receipt photo upload (future)

Insights:
- "You typically spend R4,200/month from Medical fund"
- "At current pace, you'll reach R70k target in 18 months"
- "December has highest medical spending (avg R6,800)"
```

#### F2.5 Investment Tracking
```
Purpose: Track fixed-term investments like Byte Fusion separately from expenses

Features:
- Investment portfolio overview
- Monthly contribution tracking
- Progress toward target (R200k for Byte Fusion)
- Maturity date countdown
- Contribution history log
- Link monthly expense to investment (auto-record when "Byte Fusion" expense is paid)

UI Reference:
┌─────────────────────────────────────────┐
│ Investments                             │
│ ═══════════════════════════════════════ │
│ ┌─────────────────────────────────────┐ │
│ │ Byte Fusion            24mo term   │ │
│ │ ██████████░░░░░░░░░░░░ 45%         │ │
│ │ R90,000 / R200,000                 │ │
│ │ 11 months remaining                │ │
│ │ Next: R3,000 due end of month      │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘

Integration with Expenses:
- When "Byte Fusion - R3,000" is marked paid in monthly expenses
- Auto-prompt: "Record this as Byte Fusion contribution?"
- If yes: contribution added to investment tracker
```

#### F2.6 Goal Tracking
```
Features:
- Yearly goal lists (like your Year Plans)
- Progress tracking for monetary goals
- Completion status with dates
- Goal history across years
- Achievement celebrations

UI Reference:
┌─────────────────────────────────────────┐
│ 2025 Goals                    8/12 ✓    │
│ ═══════════════════════════════════════ │
│ ☑ Pay off UNISA ────────────── R10,000 │
│ ☑ Upgrade laptop                        │
│ ☐ Pay off car (BIG MAYBE)              │
│ ☐ MacBook ──────────── R0/R35,000      │
│ ☐ Emergency fund ───── R0/R50,000      │
│   ░░░░░░░░░░░░░░░░░░░░ 0%              │
└─────────────────────────────────────────┘
```

#### F2.7 Debt Payoff Tracking
```
Purpose: Track loan/debt balances for "Pay off X" goals

Features:
- Original balance tracking
- Remaining balance calculation
- Interest rate (optional)
- Projected payoff date based on payment rate
- Payment history via Smart Linking

UI Reference:
┌─────────────────────────────────────────────────────────────┐
│  Pay Off Car                                    DEBT GOAL   │
│  ═══════════════════════════════════════════════════════════│
│                                                             │
│  Original Loan:    R180,000                                 │
│  Remaining:        R67,500                                  │
│  ████████████████████░░░░░░░░░░ 62.5% paid                 │
│                                                             │
│  Monthly Payment:  R4,048 (Car Insurance line item)         │
│  Interest Rate:    10.5%                                    │
│  Lender:           MFC                                      │
│                                                             │
│  At current rate:  Paid off by March 2028 (18 months)       │
│                                                             │
│  Recent Payments:                                           │
│  ✓ R4,048  Mar 2026                                         │
│  ✓ R4,048  Feb 2026                                         │
│  ✓ R4,048  Jan 2026                                         │
└─────────────────────────────────────────────────────────────┘

Integration:
- Link "Car Insurance" expense to this debt goal
- When paid → remaining balance decreases
- System calculates new projected payoff date
```

#### F2.5 Notifications (Gentle Reminders)
```
Trigger Rules:

PAY CYCLE ALERTS:
1. 3 days before pay day:
   "New cycle starting Friday. 4 items still pending from this month."

2. Priority items unpaid after 48hrs post-payday:
   "Gentle reminder: Bond and Medical aid not yet marked as paid."

SMART LINKING ALERTS (Your Key Requirement):
3. Missed contribution detected:
   "Medical aid wasn't paid in March. You're now 1 month behind on your 70k goal."

4. Falling behind trend:
   "Emergency fund: 2 months of missed contributions. R2,000 behind target pace."

5. Back on track:
   "Great! Byte Fusion contribution recorded. You're back on track."

6. Goal milestone reached:
   "70k Medical aid: 50% milestone reached! R35,000 saved."

7. Goal completed:
   "Congratulations! 70k Medical aid goal achieved! Total time: 14 months."

PROGRESS ALERTS:
8. Investment maturity approaching:
   "Byte Fusion matures in 3 months. Current value: R180,000"

9. Spending anomaly:
   "Heads up: Entertainment is R2,000 over your typical spend."

10. Year-end summary:
    "2025 Goals: 8/12 completed. 2 goals need attention."

Implementation:
- Firebase Cloud Functions (scheduled daily check)
- Firebase Cloud Messaging for push
- In-app notification center
- All dismissible, no repeat within 7 days
- "Snooze" option for goals you're intentionally pausing
```

---

### 4.3 Phase 3: AI Features

#### F3.1 Legacy Data Importer (Samsung Notes)
```
Flow:
1. User pastes text from Samsung Notes
2. AI (Gemini) parses into structured data
3. Preview shown for confirmation
4. User adjusts any errors
5. Bulk insert into Firestore

Prompt Engineering:
"""
Parse this South African expense list. Extract:
- label: expense name
- amount: number in ZAR (R9000 = 9000)
- status: "paid" if strikethrough/checked, "pending" otherwise

Input:
☑ Bond - R9,000
☐ Medical aid - R6,000

Output JSON array.
"""

API Route: /api/import/parse
Rate Limit: 10 requests/minute
```

#### F3.2 Bank Statement Import
```
Purpose: Import transactions from bank statements to populate Savings Pot withdrawals

Supported Formats:
- PDF statements (FNB, Standard Bank, Absa, Nedbank, Capitec)
- CSV exports (most banks offer this)
- OFX/QIF files (if available)

Flow:
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: Upload Statement                                    │
│ ─────────────────────────────────────────────────────────── │
│ [Drop PDF/CSV here or click to browse]                      │
│                                                             │
│ Select account: [Medical Aid Account ▼]                     │
│ Statement period: Auto-detected from file                   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 2: AI Parses Transactions                              │
│ ─────────────────────────────────────────────────────────── │
│ Found 23 transactions from 1 Mar - 31 Mar 2026              │
│                                                             │
│ ☑ R1,200.00  DR NAIDOO MEDICAL      [Withdrawal ▼]  Mar 18 │
│ ☑ R450.00    CLICKS PHARMACY        [Withdrawal ▼]  Mar 12 │
│ ☑ R6,000.00  SALARY TRANSFER IN     [Contribution▼] Mar 25 │
│ ☐ R89.00     BANK CHARGES           [Skip ▼]        Mar 01 │
│                                                             │
│ [Select All]  [Deselect All]                                │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 3: Review & Confirm                                    │
│ ─────────────────────────────────────────────────────────── │
│ Adding to: Medical Aid Fund                                 │
│                                                             │
│ Contributions: 1 transaction, +R6,000                       │
│ Withdrawals:   2 transactions, -R1,650                      │
│ Skipped:       1 transaction (bank charges)                 │
│                                                             │
│ New balance after import: R27,800                           │
│                                                             │
│ [Cancel]                              [Confirm Import]      │
└─────────────────────────────────────────────────────────────┘

AI Parsing (Gemini):
- Extracts: date, description, amount, transaction type (debit/credit)
- Cleans merchant names: "CLICKS *1234 SANDTON" → "Clicks Pharmacy"
- Detects duplicates (already imported transactions)
- Suggests categorization based on description

SA Bank Statement Formats:
- FNB: PDF with table structure, CSV available
- Standard Bank: PDF, CSV, OFX
- Absa: PDF, CSV
- Nedbank: PDF, CSV
- Capitec: PDF, CSV (clean format)
- TymeBank: PDF, CSV (digital-first, clean export format)

Edge Cases:
- Duplicate detection (same amount, date, description)
- Multi-month statements
- Foreign currency transactions (show in ZAR equivalent)
- Pending vs cleared transactions

API Routes:
- POST /api/import/statement/upload - Upload file, get parsed preview
- POST /api/import/statement/confirm - Confirm and save transactions

Security:
- Files processed in memory, not stored permanently
- Statement data never leaves your Firebase (no third-party storage)
- Option to auto-delete uploaded file after processing
```

#### F3.2 Smart Advisor
```
Capabilities:
1. Savings Finder
   "Reducing Entertainment by R1,000/month builds R12,000 emergency fund in a year"

2. Seasonal Forecaster
   "Based on history, budget extra R15,000 for December"

3. Goal Achievability
   "70k Medical aid at R2,000/month = 35 months. Consider R3,000/month for 2-year target"

4. Category Health
   "Family support is 17% of income (R14,100). National average is 8-12%."

5. Bill Negotiation Prompts
   "Car insurance at R8,000 is high. Last increased in March 2025. Consider shopping around."

Implementation:
- Weekly Cloud Function analyzes full dataset
- Gemini generates insights with structured prompts
- Insights ranked by actionability
- Stored with expiration dates
```

#### F3.3 Natural Language Entry
```
Future Feature:
"Add bond R9000 to March"
"Mark medical aid as paid"
"How much did I spend on groceries last year?"

Implementation: Gemini function calling with expense schema
```

---

## 5. API Routes

### 5.1 Route Structure

```
/api
├── /auth
│   └── /[...nextauth]     # Auth handlers
├── /expenses
│   ├── GET /              # List expenses (with filters)
│   ├── POST /             # Create expense
│   ├── PATCH /[id]        # Update expense
│   ├── DELETE /[id]       # Delete expense
│   └── POST /bulk         # Bulk operations
├── /folders
│   ├── GET /              # List folders
│   ├── POST /             # Create folder (auto-populates from base expenses)
│   ├── PATCH /[id]        # Update folder
│   └── DELETE /[id]       # Archive folder
├── /base-expenses
│   ├── GET /              # List base expense templates
│   ├── POST /             # Create base expense
│   ├── PATCH /[id]        # Update base expense
│   └── DELETE /[id]       # Deactivate base expense
├── /goals
│   ├── GET /              # List goals
│   ├── POST /             # Create goal
│   └── PATCH /[id]        # Update goal
├── /investments
│   ├── GET /              # List investments
│   ├── POST /             # Create investment
│   ├── PATCH /[id]        # Update investment
│   └── POST /[id]/contribute  # Record contribution
├── /savings-pots
│   ├── GET /              # List savings pots
│   ├── POST /             # Create savings pot
│   ├── PATCH /[id]        # Update savings pot
│   ├── POST /[id]/contribute  # Record contribution (money in)
│   └── POST /[id]/withdraw    # Record withdrawal (money out)
├── /insights
│   ├── GET /              # Get active insights
│   └── PATCH /[id]        # Dismiss insight
├── /import
│   ├── POST /parse              # AI parse Samsung Notes text
│   ├── POST /confirm            # Confirm notes import
│   ├── POST /statement/upload   # Upload bank statement (PDF/CSV)
│   └── POST /statement/confirm  # Confirm statement transactions
├── /analytics
│   ├── GET /dashboard     # Dashboard data
│   ├── GET /trends        # Trend analysis
│   └── GET /categories    # Category breakdown
└── /export
    └── GET /              # Export all data (JSON/CSV)
```

### 5.2 Example Route Implementation

```typescript
// app/api/expenses/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { db } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const folderId = searchParams.get('folderId');

  let query = db
    .collection('users')
    .doc(session.user.id)
    .collection('expenses');

  if (folderId) {
    query = query.where('folderId', '==', folderId);
  }

  const snapshot = await query.orderBy('sortOrder').get();
  const expenses = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  return NextResponse.json({ expenses });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();

  const expense = {
    ...body,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const docRef = await db
    .collection('users')
    .doc(session.user.id)
    .collection('expenses')
    .add(expense);

  return NextResponse.json({ id: docRef.id, ...expense }, { status: 201 });
}
```

---

## 6. UI/UX Specifications

### 6.1 Design System

```
Theme: Dark Mode Primary (light mode secondary)

Colors:
- Background:    #0a0a0a (near black)
- Surface:       #171717 (card backgrounds)
- Border:        #262626 (subtle borders)
- Primary:       #22c55e (green - for paid/positive)
- Warning:       #f59e0b (amber - for pending)
- Danger:        #ef4444 (red - for overdue)
- Text Primary:  #fafafa
- Text Secondary:#a1a1aa

Typography:
- Font: Inter (system fallback: -apple-system, sans-serif)
- Headings: 600 weight
- Body: 400 weight
- Monospace numbers: JetBrains Mono (for amounts)

Spacing:
- Base unit: 4px
- Component padding: 16px
- Card gap: 12px
- Section gap: 24px

Border Radius:
- Cards: 12px
- Buttons: 8px
- Inputs: 8px
- Chips: 9999px (full round)
```

### 6.2 Component Hierarchy

```
App Layout
├── Header
│   ├── Logo
│   ├── Sync Status Indicator
│   └── Profile Menu
├── Navigation (Bottom on mobile, Side on desktop)
│   ├── Dashboard
│   ├── Folders (Monthly expenses)
│   ├── Savings (Pots with in/out: Medical, Emergency, etc.)
│   ├── Investments (Fixed term: Byte Fusion, etc.)
│   ├── Goals (Year plans: MacBook, Pay off car, etc.)
│   └── Settings
└── Main Content Area
    └── [Page Content]

Folder View
├── Folder Header
│   ├── Title + Period
│   ├── Progress Ring
│   └── Income Input
├── Expense List
│   ├── Expense Item (repeating)
│   │   ├── Checkbox
│   │   ├── Label
│   │   ├── Amount
│   │   └── Swipe Actions
│   └── Add Expense Button
└── Footer Summary
    ├── Total
    ├── Paid
    └── Balance
```

### 6.3 Key Interactions

```
Mark as Paid:
- Tap checkbox → immediate strikethrough + green check
- Haptic feedback on mobile
- Optimistic update (no loading state)
- Subtle confetti on completing all items

Add Expense:
- Floating "+" button
- Bottom sheet on mobile, modal on desktop
- Auto-focus on label field
- Smart suggestions based on history

Reorder:
- Long press to drag
- Visual lift effect
- Drop zones highlighted
- Save order on drop

Quick Edit Amount:
- Tap amount to edit inline
- Number pad on mobile
- Enter to confirm, tap outside to cancel
```

### 6.4 Responsive Breakpoints

```
Mobile:    < 640px   (single column, bottom nav)
Tablet:    640-1024px (two columns, side nav)
Desktop:   > 1024px  (three columns, expanded side nav)
```

---

## 7. Project Structure

```
byte-finance/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── layout.tsx
│   ├── (dashboard)/
│   │   ├── page.tsx              # Dashboard home
│   │   ├── folders/
│   │   │   ├── page.tsx          # Folder grid
│   │   │   └── [id]/
│   │   │       └── page.tsx      # Folder detail (expense list)
│   │   ├── savings/
│   │   │   ├── page.tsx          # Savings pots overview
│   │   │   └── [id]/
│   │   │       └── page.tsx      # Pot detail + transactions
│   │   ├── investments/
│   │   │   ├── page.tsx          # Investment portfolio
│   │   │   └── [id]/
│   │   │       └── page.tsx      # Investment detail + contributions
│   │   ├── goals/
│   │   │   └── page.tsx          # Goals by year
│   │   ├── insights/
│   │   │   └── page.tsx          # AI insights
│   │   ├── import/
│   │   │   ├── page.tsx          # Import hub (choose import type)
│   │   │   ├── notes/
│   │   │   │   └── page.tsx      # Samsung Notes importer
│   │   │   └── statement/
│   │   │       └── page.tsx      # Bank statement importer
│   │   ├── settings/
│   │   │   └── page.tsx          # User preferences
│   │   └── layout.tsx            # Dashboard layout with nav
│   ├── api/
│   │   ├── auth/[...nextauth]/
│   │   ├── expenses/
│   │   ├── folders/
│   │   ├── goals/
│   │   ├── insights/
│   │   ├── import/
│   │   ├── analytics/
│   │   └── export/
│   ├── layout.tsx                # Root layout
│   └── globals.css
├── components/
│   ├── ui/                       # Shadcn/ui components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── checkbox.tsx
│   │   ├── dialog.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── input.tsx
│   │   ├── progress.tsx
│   │   └── ...
│   ├── expenses/
│   │   ├── expense-item.tsx
│   │   ├── expense-list.tsx
│   │   ├── expense-form.tsx
│   │   └── expense-summary.tsx
│   ├── folders/
│   │   ├── folder-card.tsx
│   │   ├── folder-grid.tsx
│   │   └── folder-form.tsx
│   ├── goals/
│   │   ├── goal-item.tsx
│   │   ├── goal-list.tsx
│   │   └── goal-form.tsx
│   ├── savings/
│   │   ├── savings-pot-card.tsx
│   │   ├── pot-balance-display.tsx
│   │   ├── transaction-list.tsx
│   │   ├── contribution-form.tsx
│   │   └── withdrawal-form.tsx
│   ├── investments/
│   │   ├── investment-card.tsx
│   │   ├── investment-progress.tsx
│   │   ├── contribution-form.tsx
│   │   └── contribution-history.tsx
│   ├── dashboard/
│   │   ├── balance-ring.tsx
│   │   ├── category-chart.tsx
│   │   ├── quick-stats.tsx
│   │   └── insight-card.tsx
│   ├── layout/
│   │   ├── header.tsx
│   │   ├── nav.tsx
│   │   ├── mobile-nav.tsx
│   │   └── sync-indicator.tsx
│   └── shared/
│       ├── amount-display.tsx
│       ├── currency-input.tsx
│       ├── date-picker.tsx
│       └── empty-state.tsx
├── lib/
│   ├── firebase.ts               # Client SDK init
│   ├── firebase-admin.ts         # Admin SDK init
│   ├── auth.ts                   # NextAuth config
│   ├── utils.ts                  # Helper functions
│   ├── constants.ts              # App constants
│   └── validations.ts            # Zod schemas
├── hooks/
│   ├── use-expenses.ts           # Expense CRUD + real-time
│   ├── use-folders.ts
│   ├── use-goals.ts
│   ├── use-savings-pots.ts       # Savings pots with transactions
│   ├── use-investments.ts        # Investment tracking
│   ├── use-analytics.ts
│   ├── use-pay-day.ts            # Pay day calculation logic
│   └── use-offline-status.ts
├── stores/
│   └── app-store.ts              # Zustand global state
├── types/
│   └── index.ts                  # TypeScript interfaces
├── public/
│   ├── icons/
│   └── manifest.json             # PWA manifest
├── .env.local
├── .env.example
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

---

## 8. Development Phases

### Phase 1: Foundation (MVP)
```
Week 1-2: Setup & Auth
- [ ] Initialize Next.js project
- [ ] Configure Tailwind + dark theme
- [ ] Setup Firebase project
- [ ] Implement authentication (Google + Email)
- [ ] Create user profile on first login
- [ ] Basic layout with navigation

Week 3-4: Core Features
- [ ] Folder CRUD operations
- [ ] Expense CRUD operations
- [ ] Checkbox interaction (mark as paid)
- [ ] Running totals and balance calculation
- [ ] Pay day configuration (fixed date OR last working day)
- [ ] Offline persistence

Week 5-6: Smart Linking (Core Feature)
- [ ] Goal/Investment CRUD operations
- [ ] Link expense to goal/investment
- [ ] Auto-update goal progress when expense marked paid
- [ ] "Behind" calculation logic
- [ ] Basic goal progress UI

Week 7: Polish
- [ ] Responsive design refinement
- [ ] Loading states and error handling
- [ ] Empty states
- [ ] PWA configuration
- [ ] Basic onboarding flow
```

### Phase 2: Intelligence
```
Week 8-9: Dashboard & Analytics
- [ ] Dashboard page with charts
- [ ] Category breakdown
- [ ] Month-over-month comparison
- [ ] Monthly snapshot aggregation
- [ ] Goal/Investment progress overview

Week 10: Notifications & Alerts
- [ ] "Behind on goal" detection logic
- [ ] Push notification setup (FCM)
- [ ] In-app notification center
- [ ] Pay cycle reminders
- [ ] Goal milestone celebrations

Week 11: Historical Backfill
- [ ] Link expense to past months retroactively
- [ ] Bulk contribution calculation
- [ ] Trend detection from historical data
```

### Phase 3: AI Features
```
Week 12-13: Import Tools
- [ ] Legacy data importer (AI parsing from Samsung Notes)
- [ ] Bank statement import (PDF/CSV parsing)
- [ ] Duplicate transaction detection
- [ ] Merchant name cleaning

Week 14-15: Smart Advisor
- [ ] Spending pattern insights
- [ ] Savings recommendations
- [ ] Seasonal forecasting
- [ ] Goal achievability analysis

Week 16-17: Native & Polish
- [ ] Capacitor integration
- [ ] Push notifications
- [ ] Performance optimization
- [ ] Beta testing
```

---

## 9. Environment Variables

```bash
# .env.local

# Firebase Client
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Firebase Admin (Server-side)
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Gemini AI
GEMINI_API_KEY=

# App Config
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 10. Success Metrics

### 10.1 MVP Success Criteria
- [ ] Can create monthly folder and add 25+ expenses
- [ ] Can mark items as paid with single tap
- [ ] Totals calculate correctly
- [ ] Works offline and syncs when online
- [ ] Pay cycle logic respects configured pay day (including last working day)
- [ ] Can link expense to goal/investment (Smart Linking)
- [ ] Linked expense auto-updates goal progress when marked paid

### 10.2 Phase 2 Success Criteria
- [ ] Dashboard loads in < 2 seconds
- [ ] Historical data queryable from 2018
- [ ] At least 3 meaningful insights generated weekly
- [ ] Goal progress accurately tracked via Smart Linking
- [ ] "Behind" alerts trigger when contributions missed
- [ ] Historical backfill works (link expense → apply to past months)

### 10.3 Long-term KPIs
- Time to complete monthly expense entry: < 5 minutes
- Insight actionability rate: > 60% (user finds useful)
- Emergency fund growth: Measurable increase over 12 months
- User retention: Weekly active usage

---

## 11. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Firebase costs at scale | Implement pagination, cache aggressively, monitor usage |
| AI parsing errors | Always show preview, allow manual corrections |
| Offline conflicts | Last-write-wins with conflict log for review |
| Data loss | Daily backups to Cloud Storage, export feature |
| Scope creep | Strict MVP definition, defer "nice to have" features |

---

## 12. Next Steps

1. **Approve this spec** - Review and confirm approach
2. **Setup infrastructure** - Create Firebase project, Vercel project
3. **Initialize codebase** - Next.js with Tailwind, Shadcn/ui
4. **Build auth flow** - Google sign-in working end-to-end
5. **First feature** - Folder + expense CRUD with offline support

---

*Document Version: 1.0*
*Last Updated: April 2026*
*Author: Claude Code Assistant*
