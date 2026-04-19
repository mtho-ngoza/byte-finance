# ByteFinance AI — Feature Status

> Quick reference: what's built, what's in progress, what's still todo.
> Based on requirements.md — one row per feature, no need to read the codebase.

---

## Legend
- ✅ Done — built and working
- 🔄 Partial — some parts done, some missing
- ⏳ Todo — not started

---

## Feature Status

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | User Authentication | 🔄 Partial | Login page + NextAuth config built. Dev bypass active (no real Firebase Auth needed locally). Google + email/password wired but untested without real credentials. |
| 2 | User Profile & Preferences | 🔄 Partial | UserProfile created on first sign-in with correct defaults. Settings page exists but pay day preference UI not yet wired. |
| 3 | Pay Cycle Calculation | ✅ Done | Full SA holiday registry, fixed + last-working-day modes, pay cycle boundaries. "Days until pay day" shown on monthly folder. 37 tests passing. |
| 4 | Folder Management | ✅ Done | Create, edit, archive (soft delete), progress ring, budgeted/paid totals, income field, monthly auto-population from base expenses. |
| 5 | Expense Management | ✅ Done | Add/edit/delete, optimistic toggle, paidDate, drag-to-reorder, account type filter, notes/tags, celebratory animation, expense summary footer. |
| 6 | Base Expenses (Templates) | ✅ Done | CRUD, active/inactive toggle, drag-to-reorder, auto-populates new monthly folders. |
| 7 | Offline Support | 🔄 Partial | IndexedDB persistence enabled, sync indicator in header, optimistic writes. Conflict resolution relies on Firestore default (last-write-wins). Full offline test requires real Firebase. |
| 8 | Smart Linking | ✅ Done | Core logic done — contribution record/reverse on toggle, backfill API, suggestion banner on expense items, backfill confirmation sheet. |
| 9 | Goal Tracking | ⏳ Todo | API routes, hook, components, goals page — not started. **Next up.** |
| 10 | Debt Payoff Tracking | ⏳ Todo | Extension of Goal tracking — not started. |
| 11 | Investment Tracking | ⏳ Todo | API routes, hook, components, investments page — not started. |
| 12 | Savings Pots | ⏳ Todo | API routes, hook, components, savings page — not started. |
| 13 | Dashboard | ⏳ Todo | Placeholder page only. Balance ring, category chart, quick stats, upcoming expenses, insights panel — not started. |
| 14 | Trend Analysis | ⏳ Todo | Cloud Function (nightly), MonthlySnapshot aggregation, trend/alert Insights — not started. |
| 15 | Notifications & Alerts | ⏳ Todo | Cloud Function, FCM push, in-app Insights for missed contributions, milestones, anomalies — not started. Dismiss/snooze UI also not started. |
| 16 | AI Smart Advisor | ⏳ Todo | Cloud Function (weekly), Gemini integration, suggestion Insights — not started. |
| 17 | Samsung Notes Importer | ⏳ Todo | Gemini parse route, preview table, confirm + bulk insert — not started. |
| 18 | Bank Statement Import | ⏳ Todo | PDF/CSV upload, Gemini parse, duplicate detection, preview + confirm — not started. |
| 19 | Data Export | ⏳ Todo | JSON + CSV export from Settings — not started. |
| 20 | Security & Data Isolation | 🔄 Partial | Firestore rules written, Admin SDK used in all API routes. Auth bypass active in dev. Full enforcement requires real Firebase + auth enabled. |
| 21 | Responsive UI & Design System | ✅ Done | Single/two/three column layouts, dark theme, JetBrains Mono for amounts, haptic feedback on toggle, PWA manifest. |

---

## Progress at a Glance

```
Done (✅)     ████████████░░░░░░░░  7 / 21 features
Partial (🔄)  ████░░░░░░░░░░░░░░░░  4 / 21 features
Todo (⏳)     ░░░░░░░░████████████  10 / 21 features
```

---

## What's Navigable Right Now

| Route | Works? |
|-------|--------|
| `/` (Dashboard) | ⚠️ Placeholder text only |
| `/folders` | ✅ Full CRUD |
| `/folders/[id]` | ✅ Expenses, toggle, reorder, summary |
| `/settings` | ✅ Base expense management |
| `/goals` | ❌ 404 |
| `/savings` | ❌ 404 |
| `/investments` | ❌ 404 |
| `/insights` | ❌ 404 |
| `/import` | ❌ 404 |
| `/login` | ✅ Renders (bypassed in dev) |

---

## What Needs Firebase to Work Fully

These features are built but require real Firebase credentials in `.env.local`:
- Sign in / sign out (Google + email/password)
- Firestore reads/writes (all data persistence)
- Offline sync
- Push notifications (FCM)

Replace placeholder values in `.env.local` with real project credentials when ready to connect.
