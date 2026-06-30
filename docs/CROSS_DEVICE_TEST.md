# Cross-Device Sync — Test Script
*Phase 16 — Sync Reliability*  
*Use this to verify sync works between iPhone (Safari) and desktop (Chrome/Safari)*

---

## Prerequisites

Before testing:
- Supabase is configured (`VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` in `.env`)
- App is deployed (or both devices on the same local network reaching the dev server)
- You have one test account (create one at `/auth`)

---

## Test 1 — Log food on iPhone, confirm on desktop

**Goal:** Data written on mobile appears on desktop after sync.

Steps:
1. On iPhone → open the app in Safari → sign in with test account
2. Navigate to `/nutrition`
3. Add a meal entry (e.g. "Test Meal — Sync Test 1")
4. Confirm it appears in the nutrition list on iPhone ✓
5. On desktop → open app → wait up to 30 seconds (auto-pull interval)
6. Navigate to `/nutrition` → confirm the same meal entry appears ✓

Faster alternative (don't wait 30s):
- Desktop → `/dev/sync-test` → tap **Force Sync** → then check `/nutrition`

**Pass criteria:** Same meal appears on desktop with correct calories and date.

---

## Test 2 — Log workout on desktop, confirm on iPhone

**Goal:** Data written on desktop appears on mobile after sync.

Steps:
1. On desktop → sign in with test account
2. Navigate to `/workouts` → log a workout session
3. On iPhone → open app → wait up to 30 seconds OR tap **Force Sync** in `/dev/sync-test`
4. Navigate to `/workouts` → confirm the workout appears ✓

**Pass criteria:** Workout appears on iPhone with correct title, date, and exercises.

---

## Test 3 — Update profile on iPhone, confirm on desktop

**Goal:** Profile updates sync.

Steps:
1. On iPhone → `/profile` → Edit profile → change display name or goal weight → Save
2. On desktop → wait 30 seconds or force sync
3. `/profile` on desktop → confirm updated display name/goal weight appears ✓

**Pass criteria:** Profile changes appear on desktop.

---

## Test 4 — Offline write → sync on reconnect

**Goal:** Data logged while offline reaches the cloud when connectivity returns.

Steps:
1. On iPhone → turn on Airplane Mode
2. Log a meal at `/nutrition` (app should work normally — local only)
3. Confirm meal appears on iPhone ✓ (local write succeeded)
4. Turn Airplane Mode OFF
5. Within 5 seconds → app should auto-sync (online event fires → queue drains)
6. On desktop → `/dev/sync-test` → tap **Force Sync** → check counts

**Pass criteria:**
- Meal logged during airplane mode reaches the cloud within 5 seconds of going back online
- No error state shown
- Queue pending count returns to 0

---

## Test 5 — Sign out → guest mode still works

**Goal:** Guest mode is unaffected by sign-out; local data survives.

Steps:
1. On desktop → `/settings` → Sign out
2. Confirm sync status shows "Sign in to sync" (not an error)
3. Navigate to `/workouts` → confirm existing local data is still visible ✓
4. Log a new workout while signed out
5. Sign back in → choose "Merge" if merge dialog appears
6. Confirm the workout logged while signed out is now in the cloud ✓

**Pass criteria:**
- Local data persists after sign-out
- No data is deleted on sign-out
- After sign-in with merge, offline workout is synced

---

## Test 6 — First sign-in with existing local data (merge dialog)

**Goal:** Merge dialog appears and all three choices work correctly.

**Setup:** Log 2+ workouts as a guest (before signing in). Then sign in.

**Test 6A — Merge (keep both):**
1. Log workouts as guest → sign in → Merge dialog appears
2. Choose "Merge" → both local and cloud records should combine
3. Confirm workouts count = local + any pre-existing cloud records

**Test 6B — Replace Cloud (local wins):**
1. Same setup → choose "Replace Cloud with Local"
2. Cloud should be overwritten with current local data

**Test 6C — Replace Local (cloud wins):**
1. Same setup → choose "Replace Local with Cloud"
2. Local data should be replaced by cloud data

**Pass criteria:** Each choice produces the described outcome without errors or data corruption.

---

## Using /dev/sync-test

Navigate to `/dev/sync-test` to see:
- Auth state and user ID
- Local vs cloud record counts per store (useful to verify sync worked)
- Queue pending/failed counts
- Action buttons: Force Sync, Pull from Cloud, Create test data, Clear test data

**Expected counts after sync:**
- Local and Cloud columns should show equal numbers for `workouts`, `nutrition_entries`, `daily_logs`, `profile`
- `health_metrics` may differ if you've imported Apple Health data (only uploaded on initial merge)

---

## What to Watch For

| Symptom | Likely cause |
|---|---|
| Data doesn't appear after 60+ seconds | Queue may be failing — check failed count in /dev/sync-test |
| Queue failed count > 0 | Supabase table may be missing or RLS is blocking writes |
| "Sync failed" status | Network error or Supabase connection issue — check browser console |
| Local count higher than cloud | Records haven't been uploaded yet — tap Force Sync |
| Cloud count higher than local | Pull didn't run — tap Force Sync or wait 30s |
| Data duplicated after merge | Merge conflict — check Supabase table for duplicate `id` values |

---

## Known Limitations

| Limitation | Explanation |
|---|---|
| Auto-sync only works while app is open | Web apps can't sync in the background. Close the tab → no sync until reopen. |
| health_metrics not incrementally synced | Apple Health imports are bulk-uploaded at sign-in only. Subsequent imports need a manual "Upload All" or re-sign-in. |
| iPhone requires Safari or a compatible browser | IndexedDB persistence in PWA mode is better than browser tabs on iOS. |
| Sync interval is 30 seconds | New data from the other device may take up to 30 seconds to appear. Use Force Sync in `/dev/sync-test` for immediate pull. |
| No real-time push | Sync is poll-based (pull every 30s). True real-time would require Supabase Realtime subscriptions (Phase 17+). |
