# ByteFinance - Development Status

> Quick reference for feature implementation status.
> Based on TECH_SPEC.md — feature-first view, no need to read the codebase.

---

## Legend

- ✅ Done - Built and working
- 🔄 In Progress - Partially implemented
- ⏳ Todo - Not started

---

## Phase 1: Core Tracking (MVP)

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | Authentication | ✅ Done | Firebase Auth config, Google Sign-In, dev bypass active |
| 2 | User Profile & Pay Day Config | ✅ Done | UserProfile created on sign-in, preferences stored, pay day hook |
| 3 | Pay Cycle Logic | ✅ Done | Fixed + last working day modes, all SA public holidays, cycle boundaries |
| 4 | Commitments (recurring templates) | ✅ Done | API routes (GET/POST/PATCH/DELETE), `use-commitments` hook, settings UI |
| 5 | Goals | ✅ Done | API routes, `use-goals` hook, goals page with create/delete/progress |
| 6 | Cycles (auto-generated pay periods) | ✅ Done | API routes, `use-cycles` hook, auto-spawns items from commitments |
| 7 | Cycle Items (status flow) | ✅ Done | API routes, `use-cycle-items` hook, optimistic updates, status toggle |
| 8 | Smart Linking (auto goal contributions) | ✅ Done | Wired in `use-cycle-items` — marking paid auto-contributes to linked goal |
| 9 | Dashboard (Now view) | ✅ Done | Cycle progress, goals summary, due/upcoming/paid sections, year + account filters, add item, pay day countdown |
| 10 | Plan View (Commitments + Goals) | ⏳ Todo | `/plan` page — commitments grouped by category, goals with progress |
| 11 | Cycle Detail View | ⏳ Todo | `/cycle/[id]` — full cycle with editing, skip, reorder |
| 12 | Offline Support | 🔄 In Progress | Firestore IndexedDB persistence enabled, sync indicator in header |
| 13 | Responsive Design | 🔄 In Progress | Mobile-first layout done, desktop side nav needs polish |

---

## Phase 2: Intelligence

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 14 | History View | ⏳ Todo | `/history` — spending chart, category breakdown, past cycles list |
| 15 | Monthly Snapshots | ⏳ Todo | Aggregated data written by Cloud Function for trend queries |
| 16 | Trend Analysis | ⏳ Todo | Cloud Function scaffold exists (`functions/src/trend-analyzer.ts`) |
| 17 | Smart Advisor | ⏳ Todo | Cloud Function scaffold exists (`functions/src/smart-advisor.ts`) |
| 18 | In-App Notifications / Insights | ⏳ Todo | Alerts, milestones, reminders — Cloud Function + dismiss UI |

---

## Phase 3: AI & Polish

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 19 | Data Importer (text) | ⏳ Todo | AI parsing of plain text expense lists |
| 20 | Bank Statement Import | ⏳ Todo | PDF/CSV parsing via Gemini |
| 21 | Push Notifications | ⏳ Todo | FCM integration |
| 22 | Data Export | ⏳ Todo | JSON/CSV export from Settings |
| 23 | PWA Optimization | ⏳ Todo | Manifest exists, install prompt + icons needed |

---

## Progress Overview

```
Phase 1 (MVP):    ████████████████░░░░  9 / 13 features
Phase 2:          ░░░░░░░░░░░░░░░░░░░░  0 / 5 features
Phase 3:          ░░░░░░░░░░░░░░░░░░░░  0 / 5 features
─────────────────────────────────────────────────────────
Total:            ████████░░░░░░░░░░░░  9 / 23 features (39%)
```

---

## What's Navigable Right Now

| Route | Works? |
|-------|--------|
| `/` (Dashboard) | ✅ Full — cycle progress, goals, items, filters |
| `/goals` | ✅ Full — create, view, delete, progress bars |
| `/settings` | ✅ Commitments CRUD (base templates) |
| `/plan` | ❌ Not built yet |
| `/history` | ❌ Not built yet |
| `/cycle/[id]` | ❌ Not built yet |
| `/login` | ✅ Renders (bypassed in dev) |

---

## Data Model (Current)

The app was refactored from Folders/Expenses to the new model:

| Old (removed) | New |
|---------------|-----|
| `Folder` | `Cycle` (auto-generated) |
| `BaseExpense` | `Commitment` (recurring template) |
| `Expense` | `CycleItem` (instance per cycle) |
| `SavingsPot` / `Investment` | Merged into `Goal` (with `allowWithdrawals` + `investmentTracking`) |

---

## Infrastructure Status

| Item | Status | Notes |
|------|--------|-------|
| Firebase Project | ✅ Ready | `byte-finance-prod` |
| Firebase Config | ✅ Done | `firebase.json`, `.firebaserc`, indexes updated |
| Cloud Functions | ✅ Scaffold | v2 syntax, needs Blaze plan to deploy |
| Vercel Deployment | ⏳ Todo | Not configured |
| API Routes | ✅ Done | `/commitments`, `/cycles`, `/cycle-items`, `/goals` |

---

## Next Up

1. **Plan View** — `/plan` page with commitments grouped by category + goals management
2. **Cycle Detail** — `/cycle/[id]` with full item list, edit amounts, skip items
3. **History View** — `/history` with spending charts and past cycles

---

*Last Updated: April 2026*
