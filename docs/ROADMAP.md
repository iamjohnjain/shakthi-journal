# Shakthi Journal — Roadmap

## Status Key
- ✅ Complete
- 🔄 In progress / partial
- 🔜 Next up
- 📋 Planned
- 💭 Future / exploratory

---

## Phase 1 — Mock Foundation ✅
*Complete*

Dark-mode dashboard, recovery ring, metric cards, sidebar nav. Mock data engine with MOCK DATA badges. Connected Accounts, Sync History, Settings, Dev Diagnostics. DataBadge component. Proper `.env`, `.gitignore`, production build.

---

## Phase 2 — Apple Health Import ✅
*Complete*

IndexedDB v1 setup (`idb` v8). Apple Health XML parser with full HK type support. Date format quirk handling. Unit conversion, daily aggregation. 5-step import flow with preview. 23 parser unit tests. "Delete imported data" in Settings.

---

## Phase 3 — Daily Logging + Progress Compare ✅
*Complete*

`/log` daily entry form (weight, nutrition, workout, mood, energy, sleep, notes). `/compare` two-date comparison with preset chips (7/30/90 day). Profile page with edit modal and photo upload. DB v2: `daily_logs`, `profile` stores.

---

## Phase 4 — Workouts + Nutrition ✅
*Complete*

`/workouts`: session logging, exercise tracking, Epley 1RM, PR detection, 30-day calendar. `/nutrition`: calorie ring, macro bars, meal groups, 14 quick-add presets. `/athletic-goals`: 7 goals with progress bars. Rule-based coach engine (7 rules, no AI). Today Status Bar on Dashboard. DB v3: `workouts`, `nutrition_entries` stores.

---

## Phase 5 — Dashboard + Compare Polish + RENPHO-Inspired Rings ✅
*Complete*

Auto-compare (no button). RENPHO-inspired goal ring on Dashboard (weight progress toward goal weight). 19 selectable metric chips on Compare. Dashboard customization page (`/dashboard-settings`) — per-card on/off. DB v4 migration.

---

## Phase 6 — Full Training System ✅
*Complete*

Training profile + goals setup (`/workouts/plan`). Rule-based workout plan generator (5 plan templates, 9 goal clusters). Workout log redesign (cardio + lifting sections, equipment type per set). 34-exercise library (`/workouts/library`). Progressive overload suggestions. Calorie estimates (MET / HR-based / distance-based). Exercise history and progress charts (`/workouts/progress`). DB v4: `training_profile`, `workout_plans`, `exercise_library`.

---

## Phase 7 — Refinements: 2-Type System, Templates, Units, Nutrition Settings ✅
*Complete*

**Workout types simplified:** 2 primaries (Lifting / Cardio), 11 cardio subtypes. Premium 2-card type picker in Log modal.  
**Week calendar:** W1–52 view, prev/next navigation, completion dots per day (Lifting/Cardio), jump to current week.  
**Edit/delete all logged data:** workouts (edit modal pre-filled), food entries (pencil → edit modal), templates. Confirmation dialogs before delete.  
**Copy/paste workouts** between days. Rest day marker.  
**Workout templates** (`/workouts/templates`): create, edit, delete, view exercises. Load template into log. Save logged workout as template.  
**Unit settings:** US/Hybrid (lbs, miles, ft-in, grams) vs Metric (kg, km, cm, grams). Toggle in Settings, persists to IndexedDB.  
**Nutrition meal naming:** Meal 1/2/3/4/Snack (numbered) or Breakfast/Lunch/Dinner/Snack (standard). Customizable labels. Saved to IndexedDB settings.  
**Nutrition goal editor:** 2300 kcal, 200g protein, 200g carbs, 70g fat, 1 gallon water. Macro-first mode (calories auto-calculated from macros).  
**DB v5:** `workout_templates` store added.

---

## Phase 8 — IA Simplification + Local-First Polish 🔄
*In progress*

This phase simplifies the information architecture and fills in the most valuable gaps before any backend or deployment work.

### Information Architecture (complete ✅)
- [x] Sidebar simplified to 8 items — no nested menus, no section labels
- [x] Workout sub-pages moved to in-page tabs (Today, Plan, History, Progress, Templates, Library)
- [x] Sleep merged into Recovery — one unified page at `/recovery`
- [x] `/sleep` → redirects to `/recovery`
- [x] `/athletic-goals` → redirects to `/goals`
- [x] `WorkoutHistoryPage` — chronological session list grouped by month
- [x] `RecoveryPage` — unified sleep + HRV + resting HR view with recovery ring

### Foundation documents (complete ✅)
- [x] `docs/VISION.md` — product north star
- [x] All 7 foundation documents rewritten to Apple/Stripe/Linear quality

### Logging UX
- [ ] Water intake logging on Nutrition page (glass counter / ml slider)
- [ ] Mood and energy logging — surface on Dashboard (5-point scale, emoji)
- [ ] Daily notes — freeform text per day visible on Dashboard
- [ ] Workout timer — in-session countdown with rest period alerts

### Progress + History
- [ ] Weight trend graph (sparkline, 30/90-day)
- [ ] Protein consistency streak (7-day grid)
- [ ] Monthly summary view — calories, workouts, PRs per month
- [ ] Body fat % trend chart (from RENPHO imported data)

### Workout improvements
- [ ] Workout duration displayed on WorkoutCard (running timer during session)
- [ ] Previous session recall in LogModal ("Last time: 185 × 5" shown per exercise)
- [ ] Volume trend per exercise (weekly volume chart in /workouts/progress)
- [ ] Deload week detection and recommendation
- [ ] Exercise notes per set (injury notes, form cues)

### Nutrition improvements
- [ ] Nutrition goal editor accessible from NutritionPage header (not just Settings)
- [ ] Meal label editor accessible from NutritionPage
- [ ] Daily calorie budget remaining shown prominently
- [ ] Recent foods quick-repeat (last 5 foods logged for this meal slot)

### Settings
- [ ] Unit display wired through workout input fields (show lbs or kg consistently)
- [ ] Data export as JSON (all stores)
- [ ] Import from JSON backup

### Quality
- [ ] All data QA: verify no data is lost through any logging flow
- [ ] Offline behavior testing (airplane mode)
- [ ] iOS Safari testing (safe area insets, bottom navigation)

---

## Phase 9 — Backup / Restore 📋

IndexedDB data lives in the browser. If the user clears browser data, all is lost.

- [ ] Export all data as `.sjb` (Shakthi Journal Backup) — JSON blob of all stores
- [ ] Import from backup file — validates schema version, migrates if needed
- [ ] Auto-export reminder in Settings ("Last backed up: X days ago")
- [ ] Optional: iCloud Drive / local filesystem access via File System Access API

**Why before deployment:** The backup story must exist before any user invests months of real data. Losing a year of health logs because of a browser update is unacceptable.

---

## Phase 10 — Free Public Deployment 📋

Make the app accessible from iPhone without requiring `localhost`.

- [ ] Deploy to Vercel (zero config, free tier, HTTPS automatic)
- [ ] Custom domain (e.g. `journal.yourdomain.com`)
- [ ] Move `VITE_STRAVA_CLIENT_SECRET` to Vercel Edge Function — never bundle in client
- [ ] HTTPS enables: reliable iOS Safari IndexedDB, future PWA/Service Worker
- [ ] PWA manifest + iOS icon set (192, 512px icons in `public/`)
- [ ] "Add to Home Screen" flow tested on iOS Safari
- [ ] Service Worker (via `vite-plugin-pwa`): offline cache for app shell

**Note:** At this stage the app is still single-user, no login. The URL is public but data is local to the device's IndexedDB. Anyone who visits the URL sees an empty app with mock data.

---

## Phase 11 — Cloud Login + Sync 📋

Triggered when: user wants access from multiple devices, or wants a safety net beyond browser storage.

- [ ] Authentication: Apple Sign-In (priority) + email magic link
- [ ] Backend: Supabase (Postgres + Row Level Security)
- [ ] Sync: IndexedDB → Supabase on change, Supabase → IndexedDB on login from new device
- [ ] Conflict resolution: local manual entries win, cloud serves as backup
- [ ] Data access model: each user sees only their own rows (RLS enforced)
- [ ] See `docs/AUTH_PLAN.md` for full plan

**Decision criteria:** Only add cloud if the value of multi-device access or backup reliability justifies the complexity and the ongoing cost of managing auth and a database.

---

## Phase 12 — Real Integrations 📋

### Strava (Priority 1)
- [ ] OAuth 2.0 flow via serverless function proxy (client secret never in bundle)
- [ ] Pull activities via Strava API v3 (`/athlete/activities`)
- [ ] Store runs/rides in `health_metrics` with `dataMode: 'live'`
- [ ] Display in Dashboard Activity card and future `/running` page
- [ ] Token refresh handling

### Apple Health — Direct (Priority 2, requires native)
- XML import (current) is the web path
- True direct access requires a native iOS app with HealthKit entitlement
- Until then: guided "Export → Import" flow with clear step-by-step UI

### RENPHO (Priority 3)
- RENPHO provides CSV export (scale measurements)
- Parser: weight, body fat %, BMI, muscle mass, visceral fat, BMR per row
- Store in `health_metrics` with `sourceId: 'renpho'`

### MyFitnessPal (Priority 4)
- MFP diary CSV export
- Parse daily calories, protein, carbs, fat, fiber
- Store in `nutrition_entries` with `dataMode: 'imported'`

### RingConn (Priority 5)
- No official API
- CSV export parser for sleep stages, HRV, SpO2
- See `docs/DATA_SOURCES.md`

---

## Phase 13 — AI Coach 💭

*Only after the data foundation is solid and real data is consistently logged.*

### Requirements before AI is useful:
- At least 30 days of real workout data logged
- At least 30 days of real nutrition data logged
- Real HRV / sleep data from Apple Watch or RingConn
- Real body weight trend from RENPHO or manual log

### Design principles:
- AI augments the rule engine, does not replace it
- All AI recommendations must follow `docs/RESEARCH_PRINCIPLES.md`
- Uncertainty is stated explicitly, not hidden
- No health data sent to AI APIs without explicit user consent and clear disclosure
- The AI explains its reasoning, not just its conclusion
- The user can always override or dismiss any AI suggestion

### Implementation options (to evaluate at the time):
- Claude API via Anthropic (on-demand, user pays or app pays per call)
- Claude Code as an MCP-connected local context (see `docs/MCP_PLAN.md`)
- On-device model (Core ML on iOS — future native app)

---

## Phase 14 — Native iOS + HealthKit 💭

*Long-term. Requires significant investment.*

- SwiftUI app with direct HealthKit read access (no XML export)
- Real-time sync with the web app via the Phase 11 backend
- On-device background processing for daily summaries
- Push notifications for streak reminders and training alerts
- Apple Watch complication showing today's protein progress and recovery score
- Widget (iOS home screen) for quick stats

---

## Non-Goals (Permanent)

These will not be built regardless of how the product evolves:

- No third-party analytics or tracking (no GA, no Mixpanel, no Amplitude)
- No health data sold or shared with advertisers
- No social features (no leaderboards, no sharing, no followers)
- No dark patterns (no engagement-maximizing notifications, no guilt-based streaks)
- No unofficial third-party health MCP servers without full source code review
- No AI features until real data is solid and the user explicitly wants them
