# Shakthi Journal — Engineering

## Philosophy

**Maintainability over cleverness. Readability over abstraction. Correctness over speed of implementation.**

A codebase is read far more often than it is written. Code that is easy to understand is easier to maintain, easier to review, and safer to change. Abstraction is a tool for managing complexity — not a signal of expertise. Use it only when complexity actually exists.

Three similar blocks of JSX is better than a generic `<DynamicCard />` component that takes 12 props. If a component cannot be understood in 30 seconds of reading, it is too abstract.

Comments explain *why*, not *what*. Identifiers describe *what*. A comment that says `// fetch workouts for the selected date` adds nothing next to `getWorkoutsForDate(selectedDate)`.

---

## Stack

| Layer | Technology | Rationale |
|---|---|---|
| Framework | Vite 6 + React 18 | Fast HMR, tree-shaken bundles, stable ecosystem |
| Language | TypeScript (strict mode) | Catches data shape errors at compile time — critical for a multi-store health schema |
| Routing | react-router-dom v7 | Nested routes, `<Outlet>` layout pattern |
| Storage | IndexedDB via `idb` v8 | Offline-first, structured, indexed, no size limit |
| Icons | lucide-react | Consistent 1.5px stroke, tree-shakeable |
| Tests | Vitest + jsdom | Co-located, fast, no network |
| Styles | Pure CSS, CSS custom properties | Zero runtime cost, full design control |

No UI library (no MUI, no shadcn, no Tailwind). Hand-authored CSS gives complete control over the design system and avoids the visual debt that comes from fighting a framework's defaults.

---

## Commands

```bash
npm run dev       # Dev server → http://localhost:5173
npm test          # Unit tests (Vitest)
npm run build     # Production build → dist/
npx tsc --noEmit  # TypeScript check only
```

**After any meaningful change:** run `npx tsc --noEmit && npm run build`. Zero TypeScript errors. Clean build. No exceptions.

---

## Project Structure

```
src/
  db/
    index.ts              — Schema, getDB(), getSetting/setSetting, migrations
    workoutStore.ts       — Workout CRUD, WORKOUT_TYPES, CARDIO_SUBTYPES, PR detection
    nutritionStore.ts     — Nutrition CRUD, daily totals, quick-add foods
    trainingStore.ts      — Training profile, exercise library, calorie estimates, plan generation
    templateStore.ts      — Workout template CRUD
    logStore.ts           — DailyLog (manual weight/macro/mood entry)
    healthStore.ts        — Apple Health metrics CRUD, buildSnapshot()
    profileStore.ts       — User profile CRUD
  hooks/
    useDashboardData.ts   — Merges Apple Health + DailyLog → DailySnapshot
    useCoachNotes.ts      — Rule engine: reads workouts + nutrition_entries
    useWorkoutSuggestion.ts — Today's training recommendation
    useNutritionSettings.ts — Meal labels, style, and nutrition goals from settings store
    useUnits.ts           — US-hybrid vs metric display preferences
    useDashboardCards.ts  — Which Dashboard cards are visible
  context/
    AppContext.tsx         — mockMode, dbStatus, appVersion
  components/
    DataBadge.tsx         — MOCK/IMPORTED/MANUAL/LIVE badge + MockModeBanner
    GoalRing.tsx          — Weight progress ring
    ImportPage.tsx        — Multi-source import entry point
  pages/
    Dashboard.tsx
    WorkoutsPage.tsx         — Today tab
    WorkoutHistoryPage.tsx   — History tab
    WorkoutPlanPage.tsx      — Plan tab
    WorkoutProgressPage.tsx  — Progress tab
    WorkoutTemplatesPage.tsx — Templates tab
    ExerciseLibraryPage.tsx  — Library tab
    RecoveryPage.tsx         — Sleep + HRV + recovery in one view
    NutritionPage.tsx
    AthleticGoals.tsx        — /goals
    Profile.tsx
    ComparePage.tsx
    DailyLog.tsx
    Progress.tsx
    Settings.tsx
    DashboardSettings.tsx
    ConnectedAccounts.tsx
    SyncHistory.tsx
    ImportAppleHealth.tsx
    DevDiagnostics.tsx
    AICoach.tsx
    StravaCallback.tsx
    ComingSoon.tsx
  parsers/
    appleHealthParser.ts      — XML parser for Apple Health export.xml
    appleHealthParser.test.ts — Unit tests
  styles/
    globals.css           — CSS custom properties, reset, shared layout
  types/
    health.ts             — DailySnapshot, AppleHealthRecord types
  data/
    config.ts             — USER, GOALS constants, formatters
    mock.ts               — mockDailySnapshots (7 days)
  layout/
    Layout.tsx, Sidebar.tsx, Layout.css, Sidebar.css
  App.tsx                 — All routes
```

---

## Information Architecture (Routes)

```
/                         Dashboard
/health                   Health Overview (coming)
/recovery                 Recovery (Sleep + HRV + Readiness)
/sleep                  → redirect to /recovery
/nutrition                NutritionPage
/workouts                 WorkoutsPage (Today tab)
/workouts/plan            WorkoutPlanPage
/workouts/history         WorkoutHistoryPage
/workouts/progress        WorkoutProgressPage
/workouts/templates       WorkoutTemplatesPage
/workouts/library         ExerciseLibraryPage
/goals                    AthleticGoals
/athletic-goals           → redirect to /goals
/progress                 Progress
/profile                  Profile
/settings                 Settings
  /dashboard-settings     Dashboard card visibility
  /connected-accounts     Integration status
  /sync-history           Import audit log
  /import                 Import entry point
  /import/apple-health    Apple Health XML import
  /dev                    Developer diagnostics
/compare                  ComparePage (accessible from Progress)
/log                      DailyLog (accessible from Dashboard)
/ai-coach                 AI Coach (accessible from any page, not in nav)
```

Pages not in the main nav remain fully accessible via direct URL. They are de-emphasized, not removed.

---

## IndexedDB Schema

**DB name:** `shakthi-journal`  
**Current version:** 5

| Store | Key | Indexes | Version |
|---|---|---|---|
| `health_metrics` | `${type}_${date}` | by-date, by-type, by-source | v1 |
| `sync_history` | uuid | by-source, by-date | v1 |
| `settings` | string key | — | v1 |
| `daily_logs` | `YYYY-MM-DD` | — | v2 |
| `profile` | `'main'` | — | v2 |
| `workouts` | uuid | by-date, by-type | v3 |
| `nutrition_entries` | uuid | by-date, by-meal | v3 |
| `training_profile` | `'main'` | — | v4 |
| `workout_plans` | uuid | by-week, by-status | v4 |
| `exercise_library` | uuid | by-name, by-muscle | v4 |
| `workout_templates` | uuid | by-name | v5 |

### Migration contract

Every schema version uses `if (oldVersion < N)` guards. A user upgrading from v1 directly to v5 runs all intermediate blocks in one pass.

```typescript
upgrade(db, oldVersion) {
  if (oldVersion < 1) { /* create initial stores */ }
  if (oldVersion < 2) { /* add daily_logs, profile */ }
  if (oldVersion < 3) { /* add workouts, nutrition_entries */ }
  if (oldVersion < 4) { /* add training stores */ }
  if (oldVersion < 5) { /* add workout_templates */ }
}
```

**Rules:**
- Never recreate an existing store inside a migration block. Always add, never replace.
- Never bump `DB_VERSION` without adding the corresponding `if (oldVersion < N)` block.
- Optional fields can be added to existing stores without a version bump (existing records simply lack the field; TypeScript `?` handles this).

---

## Settings Store

Key/value preferences stored in the `settings` IndexedDB store.

```typescript
getSetting<T>(key: string, fallback: T): Promise<T>
setSetting<T>(key: string, value: T): Promise<void>
```

| Key | Type | Default | Purpose |
|---|---|---|---|
| `mock-mode` | boolean | `true` | Show simulated data before real data is imported |
| `unit-system` | `'us-hybrid' \| 'metric'` | `'us-hybrid'` | Display unit preference |
| `meal-style` | `'standard' \| 'numbered'` | `'numbered'` | Meal slot naming |
| `meal-labels` | `string[]` | `['Meal 1', 'Meal 2', 'Meal 3', 'Meal 4', 'Snack']` | Custom meal names |
| `active-meals` | number | `4` | Number of active meal slots |
| `nutrition-goals` | `NutritionGoals` | `{calories:2300, proteinG:200, ...}` | Daily macro targets |
| `dashboard-cards` | object | all visible | Per-card Dashboard visibility |

---

## Data Modes

Every record from an external source is tagged with its provenance. This tag is the foundation of the honest-labeling system.

```typescript
type DataMode = 'mock' | 'imported' | 'live' | 'manual'
```

A record that loses its `dataMode` tag is a bug. Every write path sets it explicitly.

---

## Core Algorithms

### Epley 1RM
`e1RM = weight × (1 + reps / 30)`

Used for PR detection and progressive overload suggestions. Accuracy degrades above 10 reps and for isolation movements. Applied as an estimate — not presented as a precise measurement.

### PR Detection
At `saveWorkout` time, `annotateExercises()` reads all-time PRs, calculates Epley 1RM per set, and marks `isPR: true` on any set that exceeds the prior best. Annotated sessions are saved back to IndexedDB.

### Calorie Estimation (cascading priority)
1. Manual override (user-entered)
2. Keytel HR formula: `((-55.0969 + 0.6309×avgHR + 0.1988×weightKg + 0.2017×age) / 4.184) × durationMin`
3. Distance-based: `MET-factor × bodyWeightKg × distanceKm`
4. MET-based: `MET × bodyWeightKg × (durationMin / 60)`

Confidence reported: `'high'` (manual or HR-based), `'medium'` (distance), `'low'` (MET only).

### Rule-Based Coach Engine
`useCoachNotes.ts` — deterministic, no AI, no API calls. Runs on every Dashboard render.

Rules (evaluated in priority order, max 5 notes):
1. Recovery — warn if HRV < 7-day average, celebrate if peak
2. Protein — action if >20g remaining, celebrate if hit
3. Calorie pacing — tip if significantly behind at midday
4. Hydration — warn if <45% of daily goal
5. Steps — tip if low
6. Workout — tip if no workout logged, celebrate if done
7. Weight plateau — warn if <0.5kg change over 14 days

Each note includes a `sources` array so the user knows which data the coach is reading.

### ISO Week Numbering
`getISOWeek(date)` returns `{ week, year }` per ISO 8601. Week 1 is the week containing the first Thursday of the year. Navigation uses UTC arithmetic to avoid DST edge cases.

---

## Engineering Principles

**Small milestones.** Every change ships in a working state. No half-implemented features left in `// TODO` comments. If something cannot be finished in one session, leave the existing code intact.

**No premature abstractions.** Add abstraction when complexity actually needs managing — not in anticipation of hypothetical future needs.

**No fake integrations.** If an integration is not real, label it `[MOCKED]`. The user must always be able to distinguish real data from simulated data.

**Local-first.** Prefer IndexedDB over any remote service. Document what data leaves the device and where it goes.

**Privacy by default.** No analytics, no tracking, no telemetry. No health data transmitted without explicit user consent.

**No backwards-compatibility shims.** If something is unused, delete it. If something is renamed, rename it everywhere.

---

## Environment Variables

```env
VITE_STRAVA_CLIENT_ID=
VITE_STRAVA_CLIENT_SECRET=       # Dev only — extract to serverless proxy before public deploy
VITE_STRAVA_REDIRECT_URI=http://localhost:5173/oauth/strava/callback
VITE_APP_VERSION=0.3.0
```

`VITE_STRAVA_CLIENT_SECRET` is bundle-embedded (visible in source). Acceptable for single-user local use. Must be moved to a Vercel Edge Function before any public deployment.

---

## Required Checks After Any Change

```bash
npx tsc --noEmit   # Must pass with zero errors
npm run build      # Must succeed with no missing-export warnings
npm test           # Parser tests must all pass
```

If any of these fail, the change is not complete.
