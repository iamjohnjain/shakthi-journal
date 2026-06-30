# Beta Launch Checklist
*Shakthi Journal — Pre-Beta Verification*
*Last updated: 2026-06-30*

This checklist must pass before sharing with external beta testers.

---

## 1. Deployment

- [ ] Latest build deployed to Cloudflare Pages (`main` branch or production channel)
- [ ] Deployed URL loads correctly in Chrome, Safari, and Firefox
- [ ] `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` environment variables set in Cloudflare Pages dashboard
- [ ] `VITE_APP_VERSION` reflects the current release
- [ ] Custom domain configured (if applicable)
- [ ] HTTPS enforced — no HTTP fallback
- [ ] PWA manifest at `/manifest.json` returns correctly
- [ ] Icons at `/icon-192.png`, `/icon-512.png`, `/icon.svg` load
- [ ] "Add to Home Screen" prompt works on iOS Safari and Android Chrome
- [ ] Cloudflare `_redirects` file routes all SPA paths to `index.html`
- [ ] `_headers` file is serving correct cache control headers for assets

---

## 2. Supabase / Auth

- [ ] Supabase project is on a **paid plan** (or free plan usage is below limits)
- [ ] Email confirmations are enabled and sending from a verified domain (not `supabase.io`)
- [ ] Google OAuth provider configured in Supabase Auth dashboard
- [ ] Apple OAuth provider configured (requires Apple Developer account + Services ID)
- [ ] Allowed redirect URLs in Supabase Auth include:
  - `https://yourdomain.com/auth/callback`
  - `https://yourdomain.com/onboarding`
  - `http://localhost:5173/auth/callback` (dev only)
- [ ] Email templates customized (not default Supabase branding)
- [ ] Rate limiting appropriate for beta scale

---

## 3. Database / Security

- [ ] **RLS enabled on ALL Supabase tables** — critical; verify in Supabase dashboard
  - [ ] `workouts`
  - [ ] `nutrition_entries`
  - [ ] `daily_logs`
  - [ ] `health_metrics`
  - [ ] `profiles`
  - [ ] `user_settings`
  - [ ] `training_profiles`
  - [ ] `workout_plans`
  - [ ] `exercise_library`
  - [ ] `workout_templates`
  - [ ] `sync_history_cloud`
- [ ] RLS policies enforce `auth.uid() = user_id` for SELECT, INSERT, UPDATE, DELETE
- [ ] No public (unauthenticated) read access to any table
- [ ] Supabase anon key exposed in frontend is intentional — confirm it has no admin privileges
- [ ] Supabase service role key is NOT in frontend source code or Cloudflare env vars visible to users

---

## 4. Sync

- [ ] Fresh sign-in downloads existing cloud data
- [ ] Workout created offline → syncs when back online
- [ ] Nutrition entry created offline → syncs when back online
- [ ] MergeDialog appears when signing in with local data and cloud data exist
- [ ] All three merge choices work (Merge / Replace Cloud / Replace Local)
- [ ] Sync status indicator visible on desktop (sidebar) and mobile (settings)
- [ ] `lastSyncAt` setting updates correctly after each sync cycle
- [ ] Sync queue is cleared after successful sync (no phantom entries)

---

## 5. Onboarding

- [ ] Fresh user (no cookies, no IDB) → lands on Welcome screen
- [ ] "Continue as Guest" → completes onboarding → reaches Dashboard
- [ ] Email sign-up → confirmation email sent → confirms → auto-signed in → onboarding continues
- [ ] Google OAuth → returns to `/onboarding` → cloud profile prefills → onboarding continues
- [ ] Existing user with profile → prefilled profile form
- [ ] Completing onboarding sets `onboarding.completed: true` in IDB
- [ ] `?edit=1` mode starts at Profile step, not Welcome
- [ ] `?edit=1` finish navigates to `/profile`
- [ ] `?edit=1` does NOT overwrite `startDate` or existing body composition data
- [ ] Settings → "Run Setup Again" → opens `/onboarding?edit=1`
- [ ] Profile page → "Run Setup Again" button → same

---

## 6. Core Features

### Workouts
- [ ] Create a workout session with exercises and sets
- [ ] PR detection marks a set with PR badge
- [ ] Workout saves to IndexedDB
- [ ] Workout appears in history
- [ ] Workout template: create, use, update
- [ ] Empty state shown for first-time users with no workouts

### Nutrition
- [ ] Log a food entry (breakfast, lunch, dinner, snack)
- [ ] Calorie and macro bars update correctly
- [ ] Water log quick-add works
- [ ] Empty state shown for first-time users
- [ ] Daily totals reset correctly at midnight

### Dashboard
- [ ] All cards visible on first load
- [ ] Card visibility toggle works and persists after refresh
- [ ] Card order reordering works and persists
- [ ] Dashboard shows empty states (not mock data) for new users

### Import
- [ ] Apple Health export XML can be imported (real export, not mock)
- [ ] Import progress shown
- [ ] Imported data appears in dashboard metrics
- [ ] Import does not create duplicate records if re-imported

---

## 7. Mobile QA (iPhone Safari)

- [ ] Welcome screen at 390px width: all buttons visible, not cut off
- [ ] "Continue as Guest" button not hidden behind Safari bottom bar
- [ ] Onboarding profile form scrolls cleanly
- [ ] Wearables step: all 6 cards visible
- [ ] Review step: review cards are readable, Edit buttons tappable
- [ ] Finish screen: "Enter Shakthi Journal" button not behind home indicator
- [ ] Dashboard loads cleanly with no horizontal overflow
- [ ] Bottom navigation: all 5 tabs accessible
- [ ] App can be installed to Home Screen
- [ ] Installed PWA opens correctly without browser chrome

---

## 8. Data Safety

- [ ] Refresh browser → all data persists (IndexedDB)
- [ ] Close browser → reopen → all data persists
- [ ] Clear site data → data gone (expected)
- [ ] Guest mode → sign in → MergeDialog appears if local data exists
- [ ] "Erase All Data" in Settings removes all local data
- [ ] Backup (JSON export) works and produces a readable file
- [ ] Restore from backup re-populates all data
- [ ] Profile photo data survives refresh

---

## 9. Privacy

- [ ] `grep -r "analytics\|gtag\|mixpanel\|segment\|amplitude\|sentry\|hotjar\|posthog" src/` — zero results
- [ ] Network tab (DevTools) in guest mode: no requests to third-party endpoints after app loads
- [ ] Network tab in signed-in mode: only requests to Supabase project URL and Cloudflare Pages
- [ ] No health data visible in `console.log` output in production build

---

## 10. Performance

- [ ] Lighthouse Performance score ≥ 70 on mobile
- [ ] Lighthouse PWA audit: installable = pass
- [ ] First Contentful Paint < 3s on 3G (simulated in DevTools)
- [ ] Dashboard renders without visible jank on iOS Safari
- [ ] Bundle size: gzipped JS < 300KB (current: 224KB ✅)
- [ ] No memory leaks visible when navigating between pages for 5+ minutes

---

## 11. Known Limitations for Beta

Document these for beta testers so they don't report them as bugs:

- **Apple Health**: Web can only import via export.xml — no automatic sync. Native app required for background HealthKit sync.
- **Push notifications**: Not available on iOS Safari PWA. Will be available in future native app.
- **Widgets**: Not available on web. Coming in native app.
- **Background sync**: The browser must be open for sync to run. Closing the browser pauses sync; it resumes when reopened.
- **"Delete Account"**: Not yet implemented. To remove cloud data, contact support (until this is built).
- **Garmin, WHOOP, Oura, RingConn, Fitbit**: Coming soon — not yet connected.
- **AI Coach**: Rule-based notes only. LLM-powered coaching is planned.
- **Strava OAuth**: Client-side only, token visible in source — for personal/dev use only.

---

## 12. Bug Reporting

Tell beta testers:

> Found a bug? Please report it with:
> 1. What you were trying to do
> 2. What happened instead
> 3. Steps to reproduce
> 4. Device + browser (e.g., iPhone 14 Pro, Safari 17)
> 5. A screenshot if possible
>
> Send to: [your email] or use the issue tracker.

Do NOT ask beta testers to submit issues directly to a public GitHub repo if the repo is private or if the issues might contain health data.

---

## Pre-Launch Sign-Off

| Area | Reviewer | Status |
|---|---|---|
| Deployment | | ☐ |
| Supabase + Auth | | ☐ |
| Database RLS | | ☐ |
| Sync | | ☐ |
| Onboarding | | ☐ |
| Core features | | ☐ |
| Mobile QA | | ☐ |
| Data safety | | ☐ |
| Privacy audit | | ☐ |

**All rows must be checked before sharing with external testers.**
