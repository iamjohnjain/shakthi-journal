# Shakthi Journal — Architecture Decisions

A log of non-obvious decisions made during development. Each entry records what was decided, why, and what was rejected. This exists so future sessions don't re-litigate settled choices.

---

## ADR-001 — IndexedDB over localStorage

**Date:** Phase 1  
**Decision:** Use IndexedDB (via `idb` v8) as the sole local storage mechanism.

**Why:**
- localStorage is synchronous, limited to ~5MB, string-only, and cannot store structured health records
- IndexedDB supports indexes (by-date, by-type), async reads, and structured binary data
- `idb` v8 wraps the raw API with Promises and TypeScript generics — ergonomic and type-safe
- Future: Service Worker background sync requires IndexedDB (not localStorage)

**Rejected:** localStorage (too limited), SQLite/WASM (too heavy for a personal web app at this stage), PouchDB (unnecessary complexity before sync is needed)

---

## ADR-002 — DB version migration with `if (oldVersion < N)` guards

**Date:** Phase 2  
**Decision:** Each schema version uses `if (oldVersion < N)` blocks, never recreating existing stores.

**Why:**
- A user upgrading from v1 to v5 in one step must have all intermediate migrations run
- Recreating stores destroys existing data — the worst possible migration outcome
- This pattern is idiomatic for IndexedDB and has no downside

**Pattern:**
```typescript
upgrade(db, oldVersion) {
  if (oldVersion < 1) { /* create initial stores */ }
  if (oldVersion < 2) { /* add new stores from v2 */ }
  if (oldVersion < 3) { /* add new stores from v3 */ }
}
```

**Rule going forward:** Never bump `DB_VERSION` without adding a corresponding `if (oldVersion < N)` block. Never modify an existing store inside a versioned block without also handling existing records.

---

## ADR-003 — No UI library

**Date:** Phase 1  
**Decision:** Pure CSS with custom properties. No MUI, shadcn, Tailwind, or any UI framework.

**Why:**
- Full design control — the app should not look like Material Design or Tailwind defaults
- Smaller bundle: the CSS is ~130KB gzipped for the entire app
- Dark-mode-first is trivially implemented with CSS custom properties
- No version upgrade churn from framework breaking changes
- Every pixel is deliberate

**Cost:** More boilerplate per component. Accepted — the design quality justifies it.

**Rejected:** Tailwind (classes in JSX create visual noise and obscure design intent), shadcn (opinionated, hard to override for a custom dark theme), MUI (Material Design aesthetic conflicts with Apple-inspired visual language)

---

## ADR-004 — Mock mode as a first-class state

**Date:** Phase 1  
**Decision:** Mock data is a persistent app state (stored in `settings` store), not just a dev tool.

**Why:**
- On first launch with no imported data, the app would be empty and useless
- Mock mode shows realistic data so the user can understand what the app will look like
- Mock data is clearly labeled (MOCK DATA banner, orange badges) — never silently mixed with real data
- The user can switch to live mode at any time; mock data does not interfere

**Rule:** Mock data must always be labeled. Real data and mock data must never appear together unlabeled on the same screen.

---

## ADR-005 — Rule-based coach engine, no AI

**Date:** Phase 4  
**Decision:** `useCoachNotes.ts` is a deterministic rule engine. No AI API calls.

**Why:**
- Health recommendations should be auditable. When the app says "low recovery today," the user should be able to understand exactly why.
- AI recommendations that can't be explained are a liability in a health context
- The rule engine runs client-side, adds no latency, costs nothing, and works offline
- AI is deferred until real data is solid (30+ days) — an AI trained on mock data gives meaningless output

**When AI will be added:** Phase 13 of the roadmap, only after the data foundation is established. See `docs/RESEARCH_PRINCIPLES.md` for the standards AI must meet.

---

## ADR-006 — DataMode labeling on every record

**Date:** Phase 2  
**Decision:** Every record that enters the system carries a `dataMode: 'mock' | 'imported' | 'live' | 'manual'` tag.

**Why:**
- The user's trust depends on knowing the provenance of every metric
- Data from Apple Health is labeled IMPORTED. User-typed entries are labeled MANUAL. Simulated data is labeled MOCK.
- This labeling enables per-section badges on the Dashboard and filtering in Sync History

**Rule:** A record that loses its dataMode tag is a bug. Every write path must set the dataMode explicitly.

---

## ADR-007 — Two primary workout types (Lifting / Cardio)

**Date:** Phase 7  
**Decision:** The top-level `WorkoutSession.type` field stores only `'lifting'` or `'cardio'`. Cardio varieties are stored in `cardioSubtype`.

**Why:**
- The old 9-type system ('basketball', 'running', 'cycling', ...) mixed primary categories with subtypes at the same level
- The LogModal type picker was a cramped 3×3 grid — no room for the premium, touch-friendly treatment it deserved
- Two large cards (Lifting / Cardio) give each type the visual weight and space it deserves
- Subtypes (11 cardio varieties) live in a scrollable chip row — easy to add more without redesigning the modal

**Migration:** Old records with `type: 'basketball'` etc. are valid — `WorkoutCard` and `useCoachNotes` handle legacy types by treating any non-`'lifting'` type as cardio. When editing a legacy workout, the cardioSubtype state falls back to `workout.type` if no `cardioSubtype` field exists.

---

## ADR-008 — Calorie estimation with three-tier fallback

**Date:** Phase 6  
**Decision:** Estimate workout calories using: (1) manual override, (2) heart rate formula (Keytel 2005), (3) distance-based, (4) MET-based, in that priority order.

**Why:**
- A single method would be wrong for most sessions (MET alone ignores individual fitness level; HR-based needs HR data)
- Cascading from most accurate to least accurate produces the best estimate from available data
- Confidence is reported (`'high'`, `'medium'`, `'low'`) so the user knows how much to trust the number

**Constraint:** These are estimates, not measurements. They should never be presented as precise. Confidence badges communicate this.

---

## ADR-009 — Nutrition goals stored in settings, not hardcoded

**Date:** Phase 7  
**Decision:** `NutritionGoals` (calories, protein, carbs, fat, water) is stored in the `settings` IndexedDB store under key `'nutrition-goals'`.

**Why:**
- Old code had hardcoded `GOALS.proteinG = 200` from `data/config.ts` shared across Dashboard, NutritionPage, and Coach Notes
- When the user changes their calorie target, every component reading from `config.ts` would still show the old value
- Settings store is the single source of truth; `useNutritionSettings()` hook loads it and provides live values

**Remaining issue:** The Dashboard Nutrition metric cards still read from `useDashboardData` (which reads from the old `DailyLog` store), not from `nutrition_entries`. The TodayStatusBar and Coach Notes correctly read from `nutrition_entries`. This architectural split is a known limitation tracked for Phase 8.

---

## ADR-010 — Meal style: numbered vs. standard

**Date:** Phase 7  
**Decision:** Default meal style is `'numbered'` (Meal 1, Meal 2, Meal 3, Meal 4, Snack). Meal IDs in this mode are `'meal-1'`, `'meal-2'`, etc.

**Why:**
- John's preference is a number-based meal structure, not time-of-day labels
- Number-based is more flexible for flexible eating schedules

**Migration issue:** Pre-v7 entries used `mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack'`. Under numbered mode, these entries don't match any slot and would be silently invisible.

**Fix (implemented in QA pass):** NutritionPage now renders an "Other" catch-all section for entries whose `mealType` doesn't match any active meal slot ID. These entries remain editable and deletable.

---

## ADR-011 — Templates strip PR/e1RM annotations

**Date:** Phase 7  
**Decision:** `workoutToTemplate()` strips `e1rm` and `isPR` from all sets before saving.

**Why:**
- PR annotations are session-specific metadata — they record what was a record *on that day*
- A template is a reusable starting point, not a snapshot of a specific session's outcomes
- Re-annotating from a template would create false PRs (a set loaded from template hasn't been performed yet)

---

## ADR-012 — Unit system: US/Hybrid as default

**Date:** Phase 7  
**Decision:** Default unit system is `'us-hybrid'` — lbs for workouts and body weight, grams for food, miles for distance, ft/in for height.

**Why:**
- John is based in the US and logs workouts in lbs
- Food macros are universally in grams regardless of unit system (this is standard even in US nutrition labeling)
- The `'us-hybrid'` label distinguishes this from pure imperial (which would use oz for food)

**Storage:** All weights stored in lbs internally (matching the input unit). When metric display is selected, `fmtWeight(lbs / 2.205)` converts for display. This avoids precision loss from double conversion.

**Remaining work:** `useUnits()` provides formatters but they are not yet wired into workout input fields. Display formatting is the next step — tracked in Phase 8.

---

## ADR-013 — ISO week numbering (W1–W52/53)

**Date:** Phase 7  
**Decision:** The week calendar uses ISO 8601 week numbering. Week 1 is the week containing the first Thursday of the year. Week numbers run W1–W52 or W53 depending on year.

**Why:**
- ISO weeks are the standard for athletic programming ("Week 4 of the training block")
- The ISO week year can differ from the calendar year for dates in late December / early January — the implementation accounts for this
- Navigation uses UTC date arithmetic to avoid daylight saving time edge cases

---

## ADR-014 — No cloud auth until multi-device need is explicit

**Date:** Phase 1 (re-affirmed in every phase)  
**Decision:** No Supabase, no Firebase, no Clerk, no Auth0 until the user has a specific multi-device or backup need that cannot be solved locally.

**Why:**
- Adding auth adds: a backend dependency, a cost, an account management burden, and a new privacy surface for health data
- The backup/restore problem (Phase 9) can be solved with local JSON export before it requires a cloud account
- The user currently uses one Mac and one iPhone — a single browser's IndexedDB is adequate

**When to reconsider:** When the user says "I want to access this from both my phone and my Mac" or "I'm worried about losing my data."

---

## ADR-015 — `VITE_STRAVA_CLIENT_SECRET` in the bundle (dev-only posture)

**Date:** Phase 1  
**Decision:** The Strava OAuth client secret is stored as a Vite env variable and bundled into the client in development. This is acknowledged as insecure for production.

**Why (for now):** The app is a personal tool running on `localhost`. No one else has access to the running instance. The secret being bundle-embedded does not create risk in this context.

**Required before public deployment:** Extract to a Vercel Edge Function or serverless proxy. The client exchanges an auth code for a token via the proxy; the proxy holds the secret. See `docs/REAL_INTEGRATIONS.md`.

---

## ADR-016 — Confirm dialog before any delete

**Date:** Phase 7  
**Decision:** All delete operations (workouts, templates, food entries, exercises) require an explicit confirmation dialog before executing.

**Why:**
- Health data takes time to accumulate. An accidental delete is a real data loss.
- The confirmation dialog is a one-tap friction cost that prevents weeks of logged data from being deleted by a stray tap
- The dialog shows the name of what is being deleted ("Delete 'Push Day A'?"), not a generic "Are you sure?"

---

## ADR-017 — Progressive overload suggestion is advisory, not automatic

**Date:** Phase 6  
**Decision:** `suggestNextSet()` returns a human-readable string displayed as a suggestion. It does not pre-fill weight values in the log modal.

**Why:**
- Pre-filling values removes the user's intentional choice about what to attempt
- A suggestion that is wrong (the user is tired, wants to go lighter) creates friction to override
- An advisory display ("Try 195 lbs") is quickly ignored if not wanted; a pre-filled input requires active deletion

---

## ADR-018 — `seedExerciseLibraryIfEmpty()` called once per WorkoutsPage mount

**Date:** Phase 7  
**Decision:** The 34 default exercises are seeded into `exercise_library` on the first mount of WorkoutsPage, using a `useRef` guard to prevent re-seeding.

**Why:**
- The library seed is expensive (34 puts) and must only run once
- A `useRef(false)` guard ensures it runs once per page mount, not on every render
- Checking `exercise_library` count on every render would add an async DB read to every render

**Alternative considered:** Seed at app startup in `AppContext`. Rejected because it would add startup latency for all pages even if the user never visits Workouts.

---

## ADR-019 — Simplified sidebar: 8 items, no nesting

**Date:** Phase 8 (IA refactor)
**Decision:** The sidebar contains exactly 8 navigation items: Dashboard, Health, Recovery, Nutrition, Workouts, Goals, Progress, and at the bottom Profile and Settings. No groups, no labels, no expandable sub-items, no nested workout links.

**Why:**
- The prior sidebar had 18+ items across 4 groups: a "Health" group with 11 items including nested workout sub-pages, a "Progress" group, a "Data" group, and 4 bottom items. This created cognitive overhead before the user even began their daily task.
- Apple HIG principle: navigation should be visible at a glance. A sidebar that requires reading to locate a common destination has failed.
- Nested `↳ Plan`, `↳ Library` items in the sidebar violated the "no nesting" principle and created visual noise next to top-level items.
- Rarely-visited pages (Connected Accounts, Sync History, Import, Dashboard Settings, Diagnostics) are already accessible from Settings. Surfacing them in the sidebar gave them unwarranted visual prominence.

**What changed:**
- Workout sub-pages (Plan, History, Progress, Templates, Library) moved to in-page tabs within the Workouts section.
- Sleep merged into Recovery — one nav item instead of two, one unified page.
- Daily Log, AI Coach, Compare remain accessible via direct link or Dashboard quick actions — not in the main nav.
- `/athletic-goals` redirects to `/goals`. `/sleep` redirects to `/recovery`.

**Rejected:** Keeping sub-items but making them collapsible. A collapsible sidebar is still cognitively expensive. The correct solution is not to organize the complexity — it is to reduce it.

---

## ADR-020 — Workouts in-page tabs: Today, Plan, History, Progress, Templates, Library

**Date:** Phase 8 (IA refactor)
**Decision:** All Workouts sub-sections are accessed via a persistent in-page tab bar rather than sidebar links. Tabs: Today, Plan, History, Progress, Templates, Library. The tab bar is present on every Workouts route.

**Why:**
- In-page tabs are the natural pattern for a section where the user moves frequently between related contexts (Today's log, past History, exercise Library) without leaving the Workouts mental model.
- Apple apps (Health, Fitness, Activity) use this pattern for section-internal navigation.
- Six tabs fit comfortably in a horizontally-scrollable strip at 14px. On mobile, the strip scrolls; on desktop, all tabs are visible.
- The tab bar uses `flex: 0 0 auto` items (not `flex: 1`) so six tabs do not compress to illegible widths on small screens.

**Tab renamed:** "Log" → "Today". The label "Log" emphasized the action (logging), when the page is about the current day. "Today" is more accurate and more natural in conversation: "what's on Today?", "show me Today."

**History tab added:** New page (`/workouts/history`) shows all past sessions grouped by month. No editing from History — to edit a past session, navigate to Today and select the date from the week calendar. This is not removing edit functionality; it is locating it in the context where it makes sense (the week calendar on Today).

---

## ADR-021 — Recovery merges Sleep

**Date:** Phase 8 (IA refactor)
**Decision:** The `/sleep` route redirects to `/recovery`. The Recovery page shows sleep duration, sleep score, HRV, and resting heart rate in one view.

**Why:**
- Sleep is the primary input to recovery. Separating them into two nav items implies they are independent when they are causally linked: poor sleep → low HRV → degraded recovery.
- The user does not ask "how did I sleep?" and "how is my recovery?" as separate daily questions. They ask "am I recovered?" Sleep data answers that question, as one of its components.
- One fewer nav item reduces cognitive load without removing any data.

**What this is not:** A design choice to hide sleep data. Sleep is prominently displayed on the Recovery page. It is a navigation choice — one destination, not two.
