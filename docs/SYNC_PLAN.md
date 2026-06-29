# Sync Plan

## Architecture Principle

Apple Health is the central health data hub.

Apple Watch, RingConn, and RENPHO all sync into Apple Health automatically via their respective iPhone apps. This means a single Apple Health export can capture data from all three devices at once. The dashboard does NOT need to build separate integrations for each device — it only needs to read Apple Health.

Strava is the exception: GPS route data and detailed activity splits do not flow into Apple Health cleanly. It needs its own integration.

MyFitnessPal no longer has a public API (removed 2019). Nutrition data can flow through Apple Health if the user enables MFP's built-in Health sync. CSV export is the fallback.

---

## Phase 1 — Mock Sync + Manual Imports (Current)

**What works:**
- All dashboard data is populated from `src/data/mock.ts`
- "Sync Now" and "Sync All" buttons simulate a sync with mock data
- Apple Health XML files can be uploaded and parsed (format validation only for now)
- RENPHO CSV files can be uploaded and parsed (format validation only for now)
- MyFitnessPal CSV files can be uploaded and parsed (format validation only for now)

**What's mocked:**
- All health metrics (weight, HRV, sleep, steps, etc.)
- Sync results (record counts, timestamps)
- Connection states

**Deliverable:** Full UI, full navigation, realistic data presentation

---

## Phase 2 — Apple Health XML Full Parser

**Goal:** Parse real `export.xml` from iPhone and populate the dashboard with actual data.

**How to export from iPhone:**
1. Health app → profile icon → Export All Health Data
2. Share `export.zip` to Mac → extract `export.xml`
3. Upload to dashboard

**What the parser must handle:**
- `<Record type="HKQuantityTypeIdentifierBodyMass" ...>` → weight
- `<Record type="HKQuantityTypeIdentifierHeartRate" ...>` → heart rate
- `<Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" ...>` → HRV
- `<Record type="HKQuantityTypeIdentifierRestingHeartRate" ...>` → resting HR
- `<Record type="HKQuantityTypeIdentifierStepCount" ...>` → steps
- `<Record type="HKQuantityTypeIdentifierActiveEnergyBurned" ...>` → calories burned
- `<Record type="HKCategoryTypeIdentifierSleepAnalysis" ...>` → sleep
- `<Record type="HKQuantityTypeIdentifierVO2Max" ...>` → VO2 max
- `<Record type="HKQuantityTypeIdentifierBodyFatPercentage" ...>` → body fat
- `<Record type="HKQuantityTypeIdentifierLeanBodyMass" ...>` → lean mass / muscle
- `<Workout ...>` → workout history
- Nutrition records from MFP if Apple Health sync is enabled in MFP

**Implementation notes:**
- Use `DOMParser` (browser-native, no dependency) to parse XML
- The file can be 100–500MB for long-term users — stream or chunk
- Index by date for fast daily lookup
- Store parsed results in `localStorage` or `IndexedDB` (no server needed)
- Never send the file to any external service

**Libraries to consider:**
- `fast-xml-parser` (npm) if DOMParser is too slow for large files
- `idb` (npm) for IndexedDB wrapper

**Effort:** Medium — 1–2 days of focused work

---

## Phase 3 — Strava Official OAuth API

**Why Strava needs its own integration:**
- GPS routes, detailed splits, pace zones, and effort scores don't exist in Apple Health
- Strava has a free, well-documented public API

**OAuth flow:**
1. User clicks "Connect Strava"
2. Redirect to `https://www.strava.com/oauth/authorize?client_id=...&scope=activity:read_all`
3. Strava redirects back to `http://localhost:5173/oauth/strava/callback?code=...`
4. Exchange code for access token at `https://www.strava.com/oauth/token`
5. Store access token in `localStorage` (never on a server)
6. Fetch activities: `GET https://www.strava.com/api/v3/athlete/activities`

**What you get:**
- All activities with type, distance, time, pace, heart rate
- GPS route as a polyline (encoded)
- Personal records flagged
- Segment efforts

**Privacy:**
- Request `activity:read_all` scope (read-only)
- Never request `activity:write`
- Set Strava privacy zones for start/end of GPS routes
- Token stored locally, never transmitted to a backend you don't control

**Implementation notes:**
- Need to register a Strava API application at https://www.strava.com/settings/api
- Client ID and secret stored in `.env` (never committed to git)
- For a purely local web app, the OAuth callback must hit `localhost`
- Rate limit: 200 req/15min, 2000 req/day on free tier

**Effort:** Medium — 1 day

---

## Phase 4 — RENPHO & RingConn via Apple Health

**RENPHO:**
- Enable in RENPHO app: Me → Connect to → Health App
- Once enabled, body composition data (weight, body fat, muscle mass, visceral fat) syncs to Apple Health
- Phase 2's Apple Health parser will automatically pick this up
- CSV fallback: RENPHO app → Me → Export Data

**RingConn:**
- Enable in RingConn app: Profile → Health App → toggle all metrics ON
- Once enabled, sleep stages, HRV, SpO2, and heart rate sync to Apple Health
- Phase 2's Apple Health parser will automatically pick this up
- No CSV export option currently (as of 2026)

**Effort for Phase 4:** Near-zero if Phase 2 is done — it's just enabling Apple Health sync in each app. The parser handles the rest automatically.

---

## Phase 5 — MyFitnessPal

**Option A (Recommended): Apple Health sync**
- MFP → Settings → Privacy → App Permissions → Health App
- Enable: Calories eaten, Carbohydrates, Fat, Protein, Dietary Fiber, etc.
- Once enabled, nutrition data flows into Apple Health
- Phase 2's parser picks it up automatically

**Option B: CSV export**
- myfitnesspal.com → Reports → date range → Export
- Upload to dashboard

**Option C: Official API (not recommended)**
- MFP removed their public API in 2019
- No current public API exists
- Unofficial scrapers violate ToS and break frequently
- Do not build an unofficial scraper

**Effort:** Near-zero if Apple Health sync is used (Phase 5 collapses into Phase 4)

---

## Phase 6 — Native iOS HealthKit Companion App

**Why this matters:**
- Web apps cannot access HealthKit data directly — only native iOS apps can
- Phases 1–5 all require manual exports or OAuth tokens
- A native companion app can push data to the web dashboard automatically in the background

**What this unlocks:**
- Real-time sync without any manual steps
- Live heart rate during workouts
- Background refresh (data updates while you're not using the app)
- Write back to Apple Health (log water, meals, mood)
- Apple Watch app

**How it would work:**
1. Build a native iOS/SwiftUI companion app
2. App requests HealthKit permissions
3. App reads latest data from HealthKit
4. App sends data to a lightweight local server or iCloud sync
5. Web dashboard reads from that sync point

**Requirements:**
- Apple Developer account ($99/year)
- Swift/SwiftUI skills or contractor
- iCloud or local network sync architecture

**Effort:** Large — 2–4 weeks, requires native iOS development

**Recommended timing:** After Phase 3 is proven and the dashboard has regular daily use

---

## Summary Table

| Phase | Source | Method | Effort | Status |
|-------|--------|--------|--------|--------|
| 1 | All sources | Mock data + file import UI | Done | ✅ Current |
| 2 | Apple Health | XML export parser | Medium | Next |
| 3 | Strava | Official OAuth API | Medium | Planned |
| 4 | RENPHO, RingConn | Via Apple Health (Phase 2) | Minimal | Planned |
| 5 | MyFitnessPal | Via Apple Health sync or CSV | Minimal | Planned |
| 6 | Apple Health | Native iOS HealthKit app | Large | Future |

---

## Privacy Commitment

- All data processed locally — no health data is ever sent to a server you don't control
- OAuth tokens stored in `localStorage` only, never transmitted
- Apple Health export files are parsed in the browser and never uploaded
- GPS route data from Strava is stored locally only
- No analytics, no telemetry, no third-party data sharing
