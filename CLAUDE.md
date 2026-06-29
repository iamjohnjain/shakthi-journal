# Shakthi Journal — Claude Code Guide

## Project Overview

A personal health OS dashboard built with Vite 6 + React 18 + TypeScript. Local-first, zero cloud auth. All data lives in IndexedDB. No third-party analytics or health data transmission.

## Key Commands

```bash
npm run dev       # Start dev server → http://localhost:5173
npm test          # Run parser unit tests (Vitest, 23 tests)
npm run build     # Production build
npx tsc --noEmit  # TypeScript check
```

## Architecture

### Stack
- **Framework:** Vite 6 + React 18 + TypeScript (strict)
- **Routing:** react-router-dom v7 — nested routes, `<Outlet>` pattern in Layout
- **Storage:** IndexedDB via `idb` v8 — DB name `shakthi-journal`, version **3**
- **Icons:** lucide-react
- **Styling:** Pure CSS, dark-mode-first, CSS custom properties in `globals.css`
- **Tests:** Vitest v4 + jsdom environment

### IndexedDB Stores (v3 schema)

| Store | Key | Purpose |
|-------|-----|---------|
| `health_metrics` | `${type}_${date}` | Apple Health parsed records |
| `sync_history` | uuid | Import/sync audit log |
| `settings` | string key | App settings (mock mode, etc.) |
| `daily_logs` | `YYYY-MM-DD` | Manual daily log entries |
| `profile` | `'main'` | User profile baseline |
| `workouts` | uuid | Workout sessions (Phase 4) |
| `nutrition_entries` | uuid | Per-meal nutrition entries (Phase 4) |

### Data Modes
Every record carries a `dataMode: 'mock' | 'imported' | 'live' | 'manual'` tag.
- **mock:** Simulated/placeholder data
- **imported:** Parsed from Apple Health XML export
- **manual:** Entered via `/log` page
- **live:** Future: real-time API connection

### Key Files

```
src/
  db/
    index.ts          — Schema (v3), getDB(), settings/sync helpers
    healthStore.ts    — Apple Health metric CRUD + buildSnapshot()
    logStore.ts       — DailyLog CRUD
    profileStore.ts   — Profile CRUD
    workoutStore.ts   — WorkoutSession CRUD + Epley 1RM + PR detection
    nutritionStore.ts — NutritionEntry CRUD + daily totals + quick foods
  context/
    AppContext.tsx     — mockMode, dbStatus, appVersion via useApp()
  hooks/
    useDashboardData.ts — Merges AH + manual log, returns DataSource type
    useCoachNotes.ts    — Rule-based daily recommendation engine (no AI)
  components/
    DataBadge.tsx     — Badge for mock/imported/live/local/manual data
  parsers/
    appleHealthParser.ts  — XML parser for Apple Health export.xml
    appleHealthParser.test.ts — 23 unit tests
  pages/
    Dashboard.tsx     — Main dashboard with empty states, status bar, coach notes
    DailyLog.tsx      — /log — manual daily entry form
    ComparePage.tsx   — /compare — two-date progress comparison
    Profile.tsx       — /profile — with edit modal + photo upload
    WorkoutsPage.tsx  — /workouts — log sessions, track exercises, PRs
    NutritionPage.tsx — /nutrition — meal entries, macro tracking
    AthleticGoals.tsx — /athletic-goals — 7 goals with status + next action
    ImportAppleHealth.tsx — /import/apple-health — 5-step import flow
    ConnectedAccounts.tsx — /connected-accounts — honest source status
    SyncHistory.tsx   — /sync-history — filterable import log
    Settings.tsx      — /settings — storage, mock mode, delete
    DevDiagnostics.tsx — /dev — real-time DB + env diagnostics
    StravaCallback.tsx — /oauth/strava/callback — outside Layout
  services/
    strava/stravaOAuth.ts — OAuth 2.0 flow (client-side only, dev)
  types/
    health.ts         — DailySnapshot, AppleHealthRecord, etc.
  data/
    config.ts         — USER, GOALS constants, kgToLbs, getGreeting
    mock.ts           — mockDailySnapshots (7 days)
```

### Data Flow (Dashboard)

```
IndexedDB (health_metrics)  ──┐
IndexedDB (daily_logs)      ──┤→ useDashboardData() → Dashboard
mockDailySnapshots          ──┘   (merges AH + manual, falls back to mock)
```

`DataSource` types returned by the hook:
- `'mock'` — mock mode is ON or no real data exists
- `'imported'` — Apple Health data, no manual log
- `'manual'` — manual log only, no Apple Health
- `'merged'` — Apple Health + manual log combined

### Critical Implementation Notes

**Apple Health Date Format:**
Dates are `"2024-01-15 08:30:00 -0700"` (NOT valid ISO 8601). Must use:
```typescript
s.replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/, '$1T$2$3:$4')
```

**Sleep Assignment:** Assigned to wake-up date (end date), not start date.

**Strava OAuth:** `VITE_STRAVA_CLIENT_SECRET` is bundle-embedded — acceptable for personal dev use only. See `docs/REAL_INTEGRATIONS.md`.

**DB Version Migration:** The `upgrade()` callback checks `oldVersion` to avoid recreating existing stores when upgrading from v1 → v2.

## Environment Variables

```env
VITE_STRAVA_CLIENT_ID=
VITE_STRAVA_CLIENT_SECRET=
VITE_STRAVA_REDIRECT_URI=http://localhost:5173/oauth/strava/callback
VITE_APP_VERSION=0.3.0
```

## Routes

| Route | Component | Notes |
|-------|-----------|-------|
| `/` | Dashboard | Today status bar + coach notes |
| `/log` | DailyLog | Manual daily entry |
| `/compare` | ComparePage | Two-date progress comparison |
| `/profile` | Profile | With edit modal |
| `/workouts` | WorkoutsPage | Log sessions, exercises, PR detection |
| `/nutrition` | NutritionPage | Meal entries, macro progress rings |
| `/athletic-goals` | AthleticGoals | 7 goals with status + next action |
| `/import/apple-health` | ImportAppleHealth | 5-step XML import |
| `/connected-accounts` | ConnectedAccounts | Per-source status |
| `/sync-history` | SyncHistory | Filterable audit log |
| `/settings` | Settings | Storage + mock mode |
| `/dev` | DevDiagnostics | Real-time diagnostics |
| `/oauth/strava/callback` | StravaCallback | Outside Layout shell |

## Nutrition Defaults

Protein: 200g · Calories: 2300 kcal · Water: 1 US gallon (3785 ml)

## 1RM Formula

Epley: `weight × (1 + reps/30)` — in `workoutStore.estimateOneRM()`

## Coach Notes Engine

Rule-based, no AI, no API calls. Runs in `useCoachNotes.ts` on every Dashboard render.
Sources labeled: Apple Health / Manual Log / Mock / Missing (shown per note).
