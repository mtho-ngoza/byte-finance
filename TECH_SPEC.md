# ByteFinance - Technical Specification

> Personal financial command center for ZAR-based expense tracking, goal management, and AI-powered insights.

---

## 1. Overview

### 1.1 Problem Statement

Manual expense tracking fails to provide:
- Visibility into spending trends over time
- Automatic progress tracking toward financial goals
- Proactive insights about spending patterns
- Quick understanding of current financial status

### 1.2 Solution

A mobile-first web app built around **cash flow management** with three core concepts:

1. **Commitments** - Your recurring financial obligations (what you pay every month)
2. **Cycles** - Auto-generated pay periods (no manual folder creation)
3. **Goals** - What you're building toward (savings, debt payoff, investments)

The app surfaces your financial status at a glance via a **dashboard-first** design, with intelligent automation that tracks goal progress as you pay your commitments.

### 1.3 Design Principles

1. **Dashboard-First** - See your financial health immediately, not buried in menus
2. **Zero Maintenance** - Cycles auto-generate, goals auto-track, no manual folder management
3. **Gentle Intelligence** - Suggestions, not warnings; insights, not judgments
4. **Offline-First** - Full functionality without internet, seamless sync when online
5. **Data Ownership** - All data exportable, no vendor lock-in

---

## 2. Technical Stack

### 2.1 Core Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Framework | Next.js 14+ (App Router) | SSR, API routes, excellent DX |
| Styling | Tailwind CSS | Rapid UI development, dark mode support |
| Database | Firebase Firestore | Real-time sync, offline persistence |
| Auth | Firebase Auth | Simple, secure, Google Sign-In |
| Hosting | Vercel | Edge functions, automatic deployments |
| AI | Gemini API | Cost-effective, good at structured extraction |

### 2.2 Future Considerations

| Feature | Technology | Phase |
|---------|------------|-------|
| Native App | Capacitor | Phase 3 |
| Push Notifications | Firebase Cloud Messaging | Phase 2 |
| Bank Integration | Plaid/Stitch (SA) | Phase 4 |

---

## 3. Core Concepts

### 3.1 Mental Model

```
┌─────────────────────────────────────────────────────────────┐
│                      YOUR FINANCIAL PLAN                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   COMMITMENTS                    GOALS                       │
│   (What you pay monthly)         (What you're building)      │
│   ────────────────────           ─────────────────────       │
│   Bond           R9,000          Medical Fund    → R70k      │
│   Medical Aid    R6,000   ──────→Emergency Fund  → R50k      │
│   Car Insurance  R8,000          Byte Fusion     → R200k     │
│   Grocery        R4,000          Pay off car     → R0 debt   │
│                                                              │
│   Commitments spawn into cycles automatically                │
│   Goals update automatically when linked items are paid      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    CURRENT CYCLE (April 2026)                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Income: R84,000              Status: 18/24 paid            │
│   Committed: R71,500           Remaining: R12,500            │
│                                                              │
│   Items auto-populated from commitments                      │
│   You just update status: upcoming → due → paid              │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Key Entities

| Entity | Purpose | Lifecycle |
|--------|---------|-----------|
| **Commitment** | Recurring monthly obligation template | Created once, spawns items each cycle |
| **Goal** | Financial target (savings, debt, investment) | Created once, progress auto-tracked |
| **Cycle** | Pay period container | Auto-generated on pay day |
| **CycleItem** | Instance of commitment or one-off expense | Created per cycle, status changes over time |

### 3.3 Status Flow

Instead of checkboxes, items flow through statuses:

```
UPCOMING ──→ DUE ──→ PAID
    │                  │
    └──→ SKIPPED ←─────┘
```

- **Upcoming** - Not yet due (based on due date or cycle start)
- **Due** - Due date reached or within due window
- **Paid** - Marked as paid by user
- **Skipped** - Intentionally skipped this cycle

---

## 4. Data Architecture

### 4.1 Firestore Collections

```typescript
// Collection: users/{userId}
interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  preferences: {
    payDayType: 'fixed' | 'last_working_day';
    payDayFixed?: number;                      // 1-28, used if type is 'fixed'
    currency: 'ZAR';
    theme: 'dark' | 'light';
    notificationsEnabled: boolean;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Collection: users/{userId}/commitments/{commitmentId}
// Your recurring financial obligations - the "template" for monthly items
interface Commitment {
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

// Collection: users/{userId}/goals/{goalId}
// Financial targets - savings, debt payoff, investments
interface Goal {
  id: string;
  name: string;                     // "Medical Fund", "Pay off car", "Byte Fusion"
  type: 'savings' | 'debt_payoff' | 'investment';

  // Target tracking
  targetAmount: number;             // Target in cents (R70,000 = 7000000)
  currentAmount: number;            // Current progress (auto-calculated)

  // For debt_payoff type
  debtTracking?: {
    originalBalance: number;        // Starting debt amount
    interestRate?: number;          // Annual rate (0.105 = 10.5%)
    minimumPayment?: number;
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
  monthlyTarget?: number;           // Expected monthly contribution
  linkedCommitmentLabel?: string;   // For auto-linking suggestions

  // Contribution history
  contributions: Array<{
    id: string;
    date: Timestamp;
    amount: number;
    cycleId: string;
    cycleItemId?: string;
    note?: string;
  }>;

  // For savings type with withdrawals (e.g., Medical Fund)
  allowWithdrawals: boolean;
  withdrawals?: Array<{
    id: string;
    date: Timestamp;
    amount: number;
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

// Collection: users/{userId}/cycles/{cycleId}
// Auto-generated pay periods
interface Cycle {
  id: string;                       // Format: "2026-04"

  // Period boundaries
  startDate: Timestamp;             // Pay day of this cycle
  endDate: Timestamp;               // Day before next pay day

  // Income for this cycle
  income?: {
    amount: number;
    source?: string;
    receivedDate?: Timestamp;
    verified: boolean;
  };

  // Calculated totals (denormalized for fast reads)
  totalCommitted: number;           // Sum of all item amounts
  totalPaid: number;                // Sum of paid item amounts
  itemCount: number;
  paidCount: number;

  // Status
  status: 'active' | 'closed';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Collection: users/{userId}/cycleItems/{itemId}
// Individual items within a cycle (spawned from commitments or one-offs)
interface CycleItem {
  id: string;
  cycleId: string;

  // Source tracking
  commitmentId?: string;            // Null for one-off items

  // Item details
  label: string;
  amount: number;
  category: Category;
  accountType: 'personal' | 'business';

  // Status flow
  status: 'upcoming' | 'due' | 'paid' | 'skipped';

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

// Collection: users/{userId}/insights/{insightId}
// AI-generated insights and alerts
interface Insight {
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

// Collection: users/{userId}/snapshots/{snapshotId}
// Monthly aggregations for trend analysis
interface MonthlySnapshot {
  id: string;                       // Format: "2026-04"
  year: number;
  month: number;
  totalCommitted: number;
  totalPaid: number;
  categoryBreakdown: Record<Category, number>;
  topItems: Array<{ label: string; amount: number }>;
  goalsProgress: number;            // Overall goal progress percentage
  createdAt: Timestamp;
}

// Category enum
type Category =
  | 'housing'        // Bond, Levies, Rates, Electricity
  | 'transport'      // Car Insurance, Petrol, Car tracker
  | 'family'         // Support payments, school fees
  | 'utilities'      // Fibre, DSTV, subscriptions
  | 'health'         // Medical aid, pharmacy
  | 'education'      // UNISA, courses
  | 'savings'        // Emergency fund, investments
  | 'lifestyle'      // Entertainment, dining, shopping
  | 'business'       // PAYE, accounting, business expenses
  | 'other';
```

### 4.2 Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isOwner(userId) {
      return request.auth != null && request.auth.uid == userId;
    }

    match /users/{userId} {
      allow read, write: if isOwner(userId);

      match /{subcollection}/{docId} {
        allow read, write: if isOwner(userId);
      }
    }
  }
}
```

### 4.3 Indexes Required

```json
{
  "indexes": [
    {
      "collectionGroup": "cycleItems",
      "fields": [
        { "fieldPath": "cycleId", "order": "ASCENDING" },
        { "fieldPath": "sortOrder", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "cycleItems",
      "fields": [
        { "fieldPath": "category", "order": "ASCENDING" },
        { "fieldPath": "paidDate", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "goals",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "priority", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "cycles",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "startDate", "order": "DESCENDING" }
      ]
    }
  ]
}
```

---

## 5. Feature Specifications

### 5.1 Phase 1: Core Tracking (MVP)

#### F1.1 Authentication
- Google Sign-In (primary)
- Email/Password (fallback)
- Persistent session
- Auto-create UserProfile on first sign-in

#### F1.2 Dashboard (Home)
```
┌─────────────────────────────────────────┐
│  ByteFinance                      ⚙️    │
├─────────────────────────────────────────┤
│                                         │
│  APRIL 2026              5 days left    │
│                                         │
│  R84,000                                │
│  ████████████████░░░░░░░░ 85%           │
│  R71,500 paid · R12,500 remaining       │
│                                         │
│  ┌─ NEEDS ATTENTION ──────────────────┐ │
│  │ 🔴 Bond, Medical Aid    due today  │ │
│  │ 🟡 Grocery              due Fri    │ │
│  │                        [View all →]│ │
│  └────────────────────────────────────┘ │
│                                         │
│  ┌─ GOALS ────────────────────────────┐ │
│  │ Medical Fund   ████████░░  R42k    │ │
│  │ Emergency      ██░░░░░░░░  R8k     │ │
│  │ Byte Fusion    █████░░░░░  R90k    │ │
│  │                        [View all →]│ │
│  └────────────────────────────────────┘ │
│                                         │
│  ┌─ INSIGHT ──────────────────────────┐ │
│  │ 💡 Grocery up 12% vs 3-month avg   │ │
│  │                           [Dismiss]│ │
│  └────────────────────────────────────┘ │
│                                         │
├─────────────────────────────────────────┤
│    [Now]    [Plan]    [History]         │
└─────────────────────────────────────────┘
```

Features:
- Current cycle progress bar (paid vs total)
- Days until next pay day
- Needs attention section (due/overdue items)
- Goals summary with progress bars
- Latest insight card
- Quick add button for one-off items

#### F1.3 Plan View (Commitments & Goals)
```
┌─────────────────────────────────────────┐
│  Your Financial Plan                    │
├─────────────────────────────────────────┤
│                                         │
│  MONTHLY COMMITMENTS         R83,990    │
│  ───────────────────────────────────────│
│  Housing                        R24,000 │
│  ├─ Bond ────────────────────── R9,000  │
│  ├─ Levies ──────────────────── R3,500  │
│  ├─ Rates ───────────────────── R2,500  │
│  └─ Electricity ─────────────── R1,800  │
│                                         │
│  Transport                      R16,000 │
│  ├─ Car Insurance ───────────── R8,000  │
│  └─ Petrol ──────────────────── R4,000  │
│                                         │
│  [+ Add Commitment]                     │
│                                         │
│  ───────────────────────────────────────│
│  GOALS                                  │
│  ───────────────────────────────────────│
│                                         │
│  💰 Medical Fund ─────────── R6,000/mo  │
│     ████████░░░░░░░░░░░░ R42k / R70k    │
│                                         │
│  🎯 Emergency Fund ───────── R1,000/mo  │
│     ██░░░░░░░░░░░░░░░░░░ R8k / R50k     │
│                                         │
│  📈 Byte Fusion ──────────── R3,000/mo  │
│     █████░░░░░░░░░░░░░░░ R90k / R200k   │
│     Matures: Jan 2027 (9 months)        │
│                                         │
│  [+ Add Goal]                           │
│                                         │
├─────────────────────────────────────────┤
│    [Now]    [Plan]    [History]         │
└─────────────────────────────────────────┘
```

Features:
- All commitments grouped by category
- Monthly total calculation
- Goals with progress bars
- Investment maturity dates
- Add/edit/delete commitments and goals
- Link commitments to goals

#### F1.4 Cycle View (Current Period Items)

Accessed by tapping "View all" from dashboard or navigating to current cycle:

```
┌─────────────────────────────────────────┐
│  ← April 2026                   R84,000 │
├─────────────────────────────────────────┤
│                                         │
│  Housing                                │
│  ───────────────────────────────────────│
│  ✓ Bond ─────────────────────── R9,000  │
│  ✓ Levies ───────────────────── R3,500  │
│  ○ Rates ────────────────────── R2,500  │
│  ○ Electricity ──────────────── R1,800  │
│                                         │
│  Transport                              │
│  ───────────────────────────────────────│
│  ✓ Car Insurance ────────────── R8,000  │
│  ○ Petrol ───────────────────── R4,000  │
│                                         │
│  [+ Add one-off item]                   │
│                                         │
├─────────────────────────────────────────┤
│  Total: R83,990                         │
│  Paid:  R71,500                         │
│  ───────────────────────────────────────│
│  Remaining: R12,500                     │
└─────────────────────────────────────────┘
```

Features:
- Items grouped by category
- Tap to change status (upcoming → due → paid)
- Swipe actions (edit amount, skip, delete)
- One-off items (not from commitments)
- Running totals

#### F1.5 Pay Cycle Logic

```typescript
// Configurable pay day with two modes:
// 1. Fixed date (e.g., 25th of every month)
// 2. Last working day (excludes weekends + SA public holidays)

function getPayDay(year: number, month: number, prefs: UserPreferences): Date {
  if (prefs.payDayType === 'fixed') {
    return new Date(year, month - 1, prefs.payDayFixed);
  }
  // Last working day logic
  const lastDay = new Date(year, month, 0);
  while (isWeekend(lastDay) || isPublicHoliday(lastDay)) {
    lastDay.setDate(lastDay.getDate() - 1);
  }
  return lastDay;
}

// Cycle boundaries:
// - Start: Pay day of current month
// - End: Day before pay day of next month
```

SA Public Holidays included:
- New Year's Day (1 Jan)
- Human Rights Day (21 Mar)
- Good Friday & Easter Monday (calculated)
- Freedom Day (27 Apr)
- Workers' Day (1 May)
- Youth Day (16 Jun)
- National Women's Day (9 Aug)
- Heritage Day (24 Sep)
- Day of Reconciliation (16 Dec)
- Christmas & Day of Goodwill (25-26 Dec)

#### F1.6 Smart Linking (Auto Goal Tracking)

When a commitment is linked to a goal:

```
┌─────────────────────────────────────────────────────────────┐
│ COMMITMENT                       LINKED GOAL                 │
│ ─────────────────────────────────────────────────────────── │
│ Medical Aid - R6,000      →      Medical Fund (savings)      │
│ Byte Fusion - R3,000      →      Byte Fusion (investment)    │
│ Emergency - R1,000        →      Emergency Fund (savings)    │
│ Car Insurance - R4,048    →      Pay off car (debt_payoff)   │
└─────────────────────────────────────────────────────────────┘

When cycle item is marked PAID:
1. System checks: Is this item linked to a goal?
2. If YES → Auto-record contribution to goal
3. Goal progress updates automatically
4. If goal completed → Achievement notification
```

#### F1.7 Offline Support

- Firestore IndexedDB persistence enabled
- Optimistic UI updates
- Sync indicator in header
- Conflict resolution: last-write-wins

---

### 5.2 Phase 2: Intelligence Layer

#### F2.1 History View (Trends & Analysis)

```
┌─────────────────────────────────────────┐
│  History                                │
├─────────────────────────────────────────┤
│                                         │
│  [This Year ▼]                          │
│                                         │
│  SPENDING TREND                         │
│  ───────────────────────────────────────│
│  [Monthly bar chart showing totals]     │
│                                         │
│  CATEGORY BREAKDOWN                     │
│  ───────────────────────────────────────│
│  [Donut chart with category %]          │
│                                         │
│  Housing      ████████████ 35%          │
│  Transport    ██████████   28%          │
│  Family       ████████     22%          │
│  Other        ████         15%          │
│                                         │
│  PAST CYCLES                            │
│  ───────────────────────────────────────│
│  March 2026    ✓ R82,500 / R83,990      │
│  February 2026 ✓ R79,200 / R81,000      │
│  January 2026  ✓ R84,100 / R85,500      │
│                                         │
├─────────────────────────────────────────┤
│    [Now]    [Plan]    [History]         │
└─────────────────────────────────────────┘
```

#### F2.2 Trend Analysis (Cloud Function)

Runs nightly to:
- Compare current month to previous month
- Compare to 3-month rolling average
- Compare to same month last year
- Generate insights for significant changes (>10%)

#### F2.3 Smart Advisor (Cloud Function)

Runs weekly to:
- Analyze spending patterns
- Identify savings opportunities
- Check goal achievability
- Suggest payment optimizations

#### F2.4 Notifications

Alerts include:
- Pay cycle reminders (3 days before)
- Overdue items (48hrs post-payday)
- Missed goal contributions
- Goal milestones (25%, 50%, 75%, 100%)
- Spending anomalies

---

### 5.3 Phase 3: AI Features

#### F3.1 Data Importer

Import from:
- Plain text (AI parsing)
- Bank statements (PDF/CSV)
- Duplicate detection

#### F3.2 Natural Language Entry

Future feature:
- "Add R500 for groceries"
- "Mark car insurance as paid"
- "How much did I spend on transport last year?"

---

## 6. API Routes

```
/api
├── /auth
│   └── /[...nextauth]         # Auth handlers
├── /commitments
│   ├── GET /                  # List commitments
│   ├── POST /                 # Create commitment
│   ├── PATCH /[id]            # Update commitment
│   └── DELETE /[id]           # Delete commitment
├── /goals
│   ├── GET /                  # List goals
│   ├── POST /                 # Create goal
│   ├── PATCH /[id]            # Update goal
│   ├── POST /[id]/contribute  # Record contribution
│   └── POST /[id]/withdraw    # Record withdrawal (savings type)
├── /cycles
│   ├── GET /                  # List cycles
│   ├── GET /current           # Get or create current cycle
│   └── PATCH /[id]            # Update cycle (income, close)
├── /cycle-items
│   ├── GET /?cycleId=         # List items for cycle
│   ├── POST /                 # Create one-off item
│   ├── PATCH /[id]            # Update item (status, amount)
│   ├── PATCH /[id]/status     # Quick status update
│   └── DELETE /[id]           # Delete item
├── /insights
│   ├── GET /                  # Get active insights
│   └── PATCH /[id]            # Dismiss/read insight
├── /analytics
│   ├── GET /dashboard         # Dashboard data
│   ├── GET /trends            # Trend analysis
│   └── GET /categories        # Category breakdown
├── /import
│   ├── POST /parse            # AI parse text
│   └── POST /statement        # Parse bank statement
└── /export
    └── GET /                  # Export all data (JSON/CSV)
```

---

## 7. UI/UX Specifications

### 7.1 Navigation Structure

Three main views accessible via bottom nav:

| Tab | View | Purpose |
|-----|------|---------|
| **Now** | Dashboard | Current status at a glance |
| **Plan** | Commitments & Goals | Your financial plan |
| **History** | Trends & Past Cycles | Analysis and history |

Plus:
- Settings (gear icon in header)
- Cycle detail (drill down from dashboard)
- Goal detail (drill down from plan)

### 7.2 Design System

```
Colors (dark theme default):
  background:    #0a0a0a
  surface:       #171717
  border:        #262626
  primary:       #22c55e  (green - paid/positive)
  warning:       #f59e0b  (amber - due/pending)
  danger:        #ef4444  (red - overdue)
  text-primary:  #fafafa
  text-secondary:#a1a1aa

Typography:
  labels/UI:     Inter (400, 600)
  amounts:       JetBrains Mono

Spacing:
  base unit:     4px
  component:     16px
  section:       24px

Border radius:
  cards:         12px
  buttons:       8px
  inputs:        8px

Responsive:
  mobile:        < 640px  (single column, bottom nav)
  tablet:        640-1024px (two columns, side nav)
  desktop:       > 1024px (three columns, expanded side nav)
```

### 7.3 Key Interactions

**Status Change:**
- Tap item row to cycle: upcoming → due → paid
- Visual feedback: color change, subtle animation
- Haptic feedback on mobile

**Add Item:**
- Floating "+" button
- Bottom sheet on mobile
- Auto-focus on label field

**Quick Edit:**
- Tap amount to edit inline
- Number pad on mobile
- Tap outside to cancel

---

## 8. Project Structure

```
byte-finance/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── layout.tsx
│   ├── (main)/
│   │   ├── page.tsx                    # Dashboard (Now)
│   │   ├── plan/page.tsx               # Commitments & Goals
│   │   ├── history/page.tsx            # Trends & Past Cycles
│   │   ├── cycle/[id]/page.tsx         # Cycle detail
│   │   ├── goal/[id]/page.tsx          # Goal detail
│   │   ├── settings/page.tsx
│   │   └── layout.tsx                  # Main layout with nav
│   ├── api/
│   │   └── [... see API routes above]
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── ui/                             # shadcn/ui primitives
│   ├── dashboard/
│   │   ├── cycle-progress.tsx          # Progress bar
│   │   ├── needs-attention.tsx         # Due items card
│   │   ├── goals-summary.tsx           # Goals preview
│   │   └── insight-card.tsx
│   ├── plan/
│   │   ├── commitment-list.tsx
│   │   ├── commitment-form.tsx
│   │   ├── goal-card.tsx
│   │   └── goal-form.tsx
│   ├── cycle/
│   │   ├── cycle-item.tsx
│   │   ├── cycle-item-list.tsx
│   │   ├── cycle-summary.tsx
│   │   └── add-item-sheet.tsx
│   ├── history/
│   │   ├── spending-chart.tsx
│   │   ├── category-breakdown.tsx
│   │   └── past-cycles-list.tsx
│   ├── layout/
│   │   ├── header.tsx
│   │   ├── bottom-nav.tsx
│   │   ├── side-nav.tsx
│   │   └── sync-indicator.tsx
│   └── shared/
│       ├── amount-display.tsx
│       ├── currency-input.tsx
│       ├── progress-bar.tsx
│       └── status-badge.tsx
├── hooks/
│   ├── use-commitments.ts
│   ├── use-goals.ts
│   ├── use-cycles.ts
│   ├── use-cycle-items.ts
│   ├── use-insights.ts
│   ├── use-pay-day.ts
│   └── use-offline-status.ts
├── lib/
│   ├── firebase.ts
│   ├── firebase-admin.ts
│   ├── auth.ts
│   ├── pay-day.ts
│   ├── smart-link.ts
│   ├── validations.ts
│   └── utils.ts
├── stores/
│   └── app-store.ts
├── types/
│   └── index.ts
├── functions/                          # Firebase Cloud Functions
│   ├── src/
│   │   ├── index.ts
│   │   ├── trend-analyzer.ts
│   │   ├── smart-advisor.ts
│   │   └── notification-service.ts
│   └── package.json
├── public/
│   ├── manifest.json
│   └── icons/
└── [config files]
```

---

## 9. Development Phases

### Phase 1: Foundation (MVP)

- [ ] Authentication (Google + Email)
- [ ] User profile with pay day config
- [ ] Commitments CRUD
- [ ] Goals CRUD
- [ ] Cycles (auto-generation)
- [ ] Cycle items (status flow)
- [ ] Smart linking (auto-contributions)
- [ ] Dashboard view
- [ ] Plan view
- [ ] Cycle detail view
- [ ] Offline support
- [ ] Responsive design

### Phase 2: Intelligence

- [ ] History view with charts
- [ ] Monthly snapshots
- [ ] Trend analysis (Cloud Function)
- [ ] Smart advisor (Cloud Function)
- [ ] Notifications (in-app)
- [ ] Goal insights

### Phase 3: AI & Polish

- [ ] Data importer (AI parsing)
- [ ] Bank statement import
- [ ] Push notifications (FCM)
- [ ] Data export
- [ ] PWA optimization
- [ ] Performance tuning

---

## 10. Future Enhancements

Features considered for future development (post-MVP):

### 10.1 Year-over-Year Comparison

Side-by-side comparison of financial data between years:
- Compare spending patterns between 2025 vs 2026
- Identify what changed (new commitments, removed ones, amount changes)
- Visual diff showing increases/decreases per category
- Highlight significant changes (>10% difference)

**UI Concept:**
```
┌─────────────────────────────────────────────────────────────┐
│  Compare Years                                              │
├─────────────────────────────────────────────────────────────┤
│  [2025 ▼]  vs  [2026 ▼]                                     │
│                                                              │
│  CATEGORY         2025         2026        CHANGE           │
│  ─────────────────────────────────────────────────────────  │
│  Housing         R290,000    R312,000     +7.6% ↑           │
│  Transport       R180,000    R156,000     -13.3% ↓          │
│  Family          R144,000    R180,000     +25.0% ↑          │
│                                                              │
│  TOTAL           R980,000    R1,020,000   +4.1%             │
└─────────────────────────────────────────────────────────────┘
```

### 10.2 Sage Accounting Integration

Read-only integration with Sage Accounting for business expense verification:
- OAuth connection to Sage API
- Sync business transactions (read-only)
- Match ByteFinance business items to Sage entries
- Flag discrepancies for review
- Generate accountant-ready reports

**Benefits:**
- Verify business expenses are properly recorded in Sage
- Identify items paid from wrong account
- Simplify month-end reconciliation

### 10.3 AI Wrong-Account Detection

Machine learning to detect potential wrong-account transactions:
- Learn patterns from historical data
- Flag business expenses paid from personal account
- Suggest corrections with one-tap fix
- Train on user corrections to improve accuracy

**Example Insight:**
```
💡 "Car Tracker (R199) looks like a business expense but was
   marked as personal. Move to business?"
   [Yes, move] [No, keep as personal] [Ignore]
```

### 10.4 Multi-Currency Support

Extend beyond ZAR for international users:
- Support additional currencies (USD, EUR, GBP)
- Currency conversion for cross-border transactions
- Historical exchange rate tracking

### 10.5 Shared Household Finances

Multiple users sharing a household budget:
- Invite family members
- Shared commitments vs personal commitments
- Combined dashboard with contribution visibility
- Per-person expense assignment

---

## 11. Success Metrics

### MVP Success Criteria

- [ ] Can create commitments and goals
- [ ] Cycles auto-generate on pay day
- [ ] Can mark items paid with single tap
- [ ] Goals auto-update when linked items paid
- [ ] Dashboard shows accurate current status
- [ ] Works offline with seamless sync
- [x] Year filter dropdown on dashboard
- [x] Account type filter (All/Personal/Business)

### Long-term KPIs

- Time to view financial status: < 2 seconds (app open to dashboard)
- Time to mark item paid: < 1 second
- Goal tracking accuracy: 100% (no manual intervention needed)
- Monthly active usage: weekly sessions

---

*Document Version: 2.1*
*Last Updated: April 2026*
