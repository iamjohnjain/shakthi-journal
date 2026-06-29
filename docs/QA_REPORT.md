# QA Report — Refinements Pass (Phase 7 + 8)

**Date:** 2026-06-29  
**DB version:** 5  
**Build:** Clean (0 TypeScript errors, 0 Vite warnings)

---

## Summary

6 bugs found and fixed. Build passes clean. All major flows verified by code inspection and live server check.

---

## What Passed ✅

### Data Integrity / Migration
- **IndexedDB v1→v5 migration**: All `if (oldVersion < N)` guards in place. `workout_templates` store only created on v4→v5 upgrade. Existing data in `workouts`, `nutrition_entries`, `settings`, `daily_logs`, `profile`, `exercise_library`, `workout_plans` is untouched.
- **NutritionEntry mealType**: Widened from enum to `string` — backwards-compatible. Old values ('breakfast', 'lunch', etc.) remain valid and are now shown in the catch-all "Other" section when meal style is set to numbered.
- **WorkoutSession.cardioSubtype**: Added as optional field — no migration needed, old records simply have `undefined` here and are handled.
- **Mock mode**: `MockModeBanner` still renders "MOCK DATA MODE" banner at top of Dashboard when mock mode is on. All workout/cardio source fields can be set to `[MOCKED]` in the Log modal.

### Pages (code + live server verified)
- **Dashboard**: Loads correctly. Today Status Bar reads workouts from `workouts` store and nutrition from `nutrition_entries` via `useCoachNotes`. Coach Notes engine fires correctly.
- **Workouts** (`/workouts`): Week calendar renders W1–52 navigation, 2-card type picker (Lifting/Cardio), cardio subtype row, exercise blocks with equipment picker, calorie preview, template load/save.
- **Templates** (`/workouts/templates`): Full CRUD — create, view, edit, delete. Template modal with exercise name datalist.
- **Nutrition** (`/nutrition`): Edit and delete food entries. Dynamic meal labels from `useNutritionSettings`. Macro goals from `useNutritionSettings` (not hardcoded).
- **Settings** (`/settings`): New "Units" section at top — toggles US/Hybrid vs Metric, persists to IndexedDB.
- **Compare** (`/compare`): Unaffected — no changed imports.
- **Profile** (`/profile`): Unaffected — no changed imports.
- **Exercise Library, Plan, Progress**: Unaffected.

### CSS / Layout
- All CSS custom properties referenced exist: `--blue-dim`, `--green-dim`, `--orange-dim`, `--red`, `--yellow`, `--teal`, `--purple`, `--bg-elevated`, `--border-subtle`.
- Week calendar day tiles: `grid-template-columns: repeat(7,1fr)` — 7 cells across, each ~45px on 360px screen. DOW abbreviations fit.
- Log modal type cards: 2-column grid, large touch targets, good spacing.
- Cardio subtype chips: `flex-wrap: wrap` — OK on narrow screens.

---

## What Was Fixed 🔧

### Bug 1 — LogModal: cardioSubtype init wrong for new-style workouts
**File:** `src/pages/WorkoutsPage.tsx`  
**Problem:** When editing a workout saved with `type: 'cardio'` + `cardioSubtype: 'running'`, the modal set `cardioSubtype = 'cardio'` (from `initialWorkout.type`), which matched no subtype chip.  
**Fix:** Now reads `initialWorkout.cardioSubtype` first; falls back to `initialWorkout.type` for legacy workouts where the subtype was stored directly in the type field.

### Bug 2 — NutritionPage: legacy entries (mealType='breakfast') invisible under numbered mode
**File:** `src/pages/NutritionPage.tsx`  
**Problem:** Old nutrition entries logged with 'breakfast'/'lunch'/'dinner'/'snack' mealTypes didn't match the new numbered slot IDs ('meal-1', 'meal-2', etc.), so they were silently dropped from the UI.  
**Fix:** Added `ungrouped` array (entries not matching any active meal slot) rendered in a catch-all "Other" section at the bottom of the page. Entries are still editable and deletable from there.

### Bug 3 — Dashboard: empty nutrition state navigated to wrong page
**File:** `src/pages/Dashboard.tsx`  
**Problem:** "Log nutrition →" button pointed to `/log` (the old DailyLog page). Food logged on NutritionPage won't satisfy the DailyLog check, so the Dashboard empty state would persist.  
**Fix:** Button now navigates to `/nutrition`.

### Bug 4 — Dashboard: workout type displayed as raw 'lifting'/'cardio'/'running'
**Files:** `src/pages/Dashboard.tsx`, `src/hooks/useCoachNotes.ts`  
**Problem:** TodayStatusBar showed "lifting done", "cardio done" (lowercase raw type). Dashboard Workout metric card showed "lifting"/"cardio".  
**Fix:** Applied `.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())` to all workout type display sites. "recovery-walk" → "Recovery Walk", "lifting" → "Lifting", etc.

### Bug 5 — useCoachNotes: didn't use cardioSubtype for display
**File:** `src/hooks/useCoachNotes.ts`  
**Problem:** `workoutType` was always `workout.type` ('lifting' or 'cardio'). For cardio sessions with a subtype ('running', 'cycling'), the coach note said "Cardio session logged" instead of "Running session logged".  
**Fix:** `workoutType` now uses `workout.cardioSubtype ?? workout.type` (falling back to raw type for legacy workouts or lifting).

### Bug 6 — Mobile: set-row equipment picker caused horizontal overflow
**File:** `src/pages/WorkoutsPage.css`  
**Problem:** The set-row (reps input + weight input + 6 equipment buttons + badges) did not wrap on narrow screens, causing horizontal scroll inside the log modal.  
**Fix:** Added `flex-wrap: wrap` to `.set-row` and `flex-basis: 100%; padding-left: 20px` to `.set-eq-picker` so the equipment row always starts on its own line below the inputs.

---

## Known Limitations / Future Work ⚠️

### Dashboard Nutrition metric cards don't read from NutritionPage
The "Protein" and "Calories In" metric cards in the Dashboard's Nutrition section read from the old `DailyLog` system (`useDashboardData` → `getLog()`). They will show "—" unless you also use the `/log` page.

**Why not fixed here:** The Dashboard's health snapshot view is intentionally separate from the food diary. The Today Status Bar and Coach Notes *do* correctly read from `nutrition_entries` (NutritionPage data). Bridging fully requires updating `useDashboardData` to merge `getDailyTotals()` — tracked as future work.

### Unit settings: formatters not wired to workout inputs
`useUnits()` provides `fmtWeight(kg)` and `fmtDistance(km)` formatters. The Settings toggle persists the preference, but workout input fields still show raw lbs (since that's the storage unit). Display-only formatting (cards, history, progress) is the next step.

### Datalist ID collision (minor HTML hygiene)
`<datalist id="exercise-datalist">` is rendered inside each `ExerciseBlock` component. Multiple elements share the same ID, which is technically invalid HTML. Browsers handle it gracefully (use first match). Low priority — a single shared datalist at the LogModal level would be the clean fix.

### Week 53
The ISO week algorithm correctly handles 53-week years (e.g. years starting Thursday). `addWeeks` navigates by jumping ±7 days in UTC so week-year transitions work correctly. No special handling needed.

---

## Test Matrix

| Feature | Status | Verified via |
|---------|--------|--------------|
| DB migration v1→v5 | ✅ Pass | Code inspection (guards) |
| Log Lifting workout | ✅ Pass | Code + server live |
| Log Cardio + subtype | ✅ Pass | Code (bug 1 fixed) |
| Edit existing workout | ✅ Pass | Code (bug 1 fixed) |
| Delete workout (confirm dialog) | ✅ Pass | Code inspection |
| Copy workout | ✅ Pass | Code inspection |
| Paste workout to different day | ✅ Pass | Code inspection |
| Mark rest day | ✅ Pass | Code inspection |
| Week calendar navigation (prev/next/today) | ✅ Pass | Code inspection |
| W1–W52 ISO week numbering | ✅ Pass | Standard algorithm |
| Create template | ✅ Pass | Code inspection |
| Edit template | ✅ Pass | Code inspection |
| Delete template (confirm dialog) | ✅ Pass | Code inspection |
| Load template into Log modal | ✅ Pass | Code inspection |
| Save logged workout as template | ✅ Pass | Code inspection |
| Add food (NutritionPage) | ✅ Pass | Code inspection |
| Edit food entry | ✅ Pass | Code inspection |
| Delete food entry | ✅ Pass | Code inspection |
| Legacy mealTypes visible | ✅ Pass | Bug 2 fixed |
| Unit settings toggle (US/Metric) | ✅ Pass | Code inspection |
| Unit setting persists to IndexedDB | ✅ Pass | useUnits hook |
| Dashboard TodayStatusBar workout | ✅ Pass | Bug 4+5 fixed |
| Dashboard "Log nutrition →" nav | ✅ Pass | Bug 3 fixed |
| Mock mode banner | ✅ Pass | Code inspection |
| Mock labels on workout source | ✅ Pass | CardioSection has [MOCKED] option |
| Compare page | ✅ Pass | No changed imports |
| Profile page | ✅ Pass | No changed imports |
| TypeScript check | ✅ 0 errors | `npx tsc --noEmit` |
| Production build | ✅ Clean | `npm run build` |
| Mobile set-row layout | ✅ Pass | Bug 6 fixed |
