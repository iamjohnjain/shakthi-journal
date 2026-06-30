# iPhone Testing Checklist — Shakthi Journal

**URL:** https://shakthi-journal.pages.dev  
**Test devices:** iPhone 14 Pro (390px), iPhone 15 Pro Max (430px)

---

## 1. Install as PWA

1. Open Safari → go to https://shakthi-journal.pages.dev
2. Tap the Share button (box with arrow)
3. Tap "Add to Home Screen"
4. Confirm name → "Add"
5. ✅ Icon appears on home screen
6. ✅ App opens full-screen (no Safari UI bars)
7. ✅ Safe area handled (no content behind status bar or home indicator)

---

## 2. Guest Mode — Create Profile

1. Open the app (no sign-in required)
2. Complete onboarding if prompted
3. Tap **Me** (bottom right)
4. Tap **Edit** → set your name, goal weight, start weight
5. ✅ Name appears in greeting on Today tab
6. ✅ Settings accessible via gear icon (top right of Profile)
7. ✅ Sign In button visible (tap opens auth screen)

---

## 3. Log Workout

1. Tap **Train** in bottom nav
2. Tap **+ New Session**
3. Add 1–2 exercises with sets and weight
4. Tap **Save**
5. ✅ Toast shows "Workout saved"
6. ✅ Returns to workout list
7. ✅ Workout appears under Today on Dashboard

---

## 4. Log Meal

1. Tap **Eat** in bottom nav
2. Tap **+ Add Entry**
3. Log a meal with protein and calories
4. ✅ Toast shows "Meal logged"
5. ✅ Protein progress updates
6. ✅ Dashboard Nutrition section shows real values

---

## 5. Verify Guest Data Persists

1. Force-close Safari (swipe up and close from app switcher)
2. Reopen from Home Screen icon
3. ✅ Workout is still in Train tab
4. ✅ Meal is still in Eat tab
5. ✅ Dashboard shows the logged values (not zeros)
6. ✅ Profile name still set

---

## 6. Sign In (Cloud Sync)

1. Tap **Me** → tap **Sign in** (top right)
2. Create an account with email/password  
   _or_ sign in to existing account
3. ✅ Auth screen fits on 390px (no horizontal scroll, buttons visible)
4. ✅ After sign in: redirects back to Dashboard
5. ✅ Sync status shows in sidebar (desktop) or Me page (mobile)

---

## 7. Verify Data Syncs

1. After signing in, wait 10–15 seconds
2. Open app on a **second device** (desktop or another iPhone)
3. Sign in with the same account
4. ✅ Workouts appear
5. ✅ Nutrition entries appear
6. ✅ Profile name matches
7. ✅ Dashboard cards show same data

---

## 8. Dashboard Customization

1. On the Dashboard, tap the **⋮** (three dots) on any section (Body, Activity, Nutrition, Vitals)
2. ✅ Popover shows: Move Up, Move Down, Pin to Top, Hide section
3. Tap **Move Up** → section moves above the previous one
4. Tap **Hide section** → section disappears from dashboard
5. ✅ Hidden notice appears at bottom: "Some sections are hidden · Manage in Settings"
6. Tap the notice → navigates to **Dashboard Layout** settings
7. ✅ Can re-enable hidden sections
8. ✅ Order changes persist after refresh

---

## 9. Layout Checks at 390px

- ✅ Bottom nav never covers Save buttons
- ✅ No horizontal scroll on any page
- ✅ Modals fit fully in viewport (Edit Profile, Quick Add, etc.)
- ✅ Toast messages appear above nav bar
- ✅ Quick Actions (Log Food, Log Workout, etc.) — all 4 fit in one row
- ✅ Metric cards display on 2-column grid
- ✅ Dashboard sections not clipped

---

## 10. Mobile Navigation Coverage

| Feature | Path | Mobile Access |
|---------|------|--------------|
| Dashboard | `/` | BottomNav: Today |
| Workouts | `/workouts` | BottomNav: Train |
| Log daily | `/log` | BottomNav: center + |
| Nutrition | `/nutrition` | BottomNav: Eat |
| Goals | `/athletic-goals` | BottomNav: Goals |
| Profile | `/profile` | BottomNav: Me |
| Settings | `/settings` | Profile page → gear icon |
| Sign In | `/auth` | Profile page → Sign in button |
| Import Apple Health | `/import/apple-health` | Dashboard → Import Data quick action |
| Dashboard Layout | `/dashboard-settings` | Settings page |

---

## 11. Data Persistence Guarantee

| Data type | Stored locally | Synced to cloud |
|-----------|---------------|-----------------|
| Workouts | ✅ IndexedDB | ✅ Supabase (when signed in) |
| Nutrition entries | ✅ IndexedDB | ✅ Supabase |
| Daily logs | ✅ IndexedDB | ✅ Supabase |
| Profile / avatar | ✅ IndexedDB | ✅ Supabase |
| Nutrition goals | ✅ IndexedDB (settings) | ✅ Supabase (settings store) |
| Dashboard card layout | ✅ IndexedDB (settings) | ✅ Supabase (settings store) |
| Apple Health imports | ✅ IndexedDB | ✅ Supabase |
| Onboarding state | ✅ IndexedDB (settings) | ✅ Supabase (settings store) |
| Weekly/monthly reviews | ✅ IndexedDB (derived) | ❌ Regenerated from primary data |
| Achievements | ✅ IndexedDB (derived) | ❌ Recalculated from primary data |

---

## 12. Beta User Flow (End-to-End)

1. User opens https://shakthi-journal.pages.dev (cold, no account)
2. Completes onboarding → sets goal, name
3. Logs a workout → ✅ data persists
4. Logs a meal → ✅ data persists  
5. Closes browser → reopens → ✅ data still there (IndexedDB)
6. Creates account with email/password
7. Data uploads to Supabase
8. Opens app on desktop browser → signs in with same account
9. ✅ Workouts, meals, profile all appear within ~15s of sign-in
10. Hides a dashboard section on mobile → ✅ reflects on desktop after refresh

---

## Known Limitations

- Apple Health automatic background sync requires a native iOS app (not yet built).  
  Web import works by exporting `export.xml` from the Health app and uploading it via Import Data.
- Strava OAuth uses client-side secret — acceptable for personal dev, not for production distribution.
- Weekly/monthly reviews and achievements are computed locally and not synced; they regenerate on each device.
