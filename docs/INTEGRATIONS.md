# Integrations Reference
*Phase 15 — Real Data Integrations Platform*  
*Updated: 2026-06-29*

---

## Integration Matrix

| Provider | Status | Method | Auto-sync | API | Dev Account |
|----------|--------|--------|-----------|-----|-------------|
| Apple Health | ✅ Manual Import | XML export | ❌ needs native app | HealthKit (iOS only) | No |
| Apple Watch | ✅ Via Apple Health | Through AH hub | ❌ | None (no web API) | No |
| RENPHO | ✅ Manual Import | CSV + AH passthrough | ❌ | None | No |
| RingConn | ✅ Via Apple Health | Through AH hub | ❌ | None | No |
| Strava | ⚡ OAuth Ready | OAuth 2.0 API | ✅ (needs credentials) | Public REST | Free |
| MyFitnessPal | ✅ Manual Import | CSV + AH passthrough | ❌ | Deprecated (2019) | No |
| Garmin | 🔮 Coming Soon | Garmin Health API | ✅ | Partnership required | Paid |
| WHOOP | 🔮 Coming Soon | WHOOP API | ✅ | Invite-only | WHOOP sub |
| Oura | 🔮 Coming Soon | Oura API v2 | ✅ | Public (free dev tier) | Free |

---

## Source Trust Hierarchy

When two sources report conflicting values for the same metric on the same day,  
the engine uses this trust ranking to resolve the conflict (higher = more authoritative):

| Score | Source | Reasoning |
|-------|--------|-----------|
| 90 | RENPHO | Dedicated scale; most accurate body composition |
| 88 | WHOOP | Recovery/HRV is WHOOP's primary purpose |
| 85 | Oura | Sleep and readiness is Oura's primary purpose |
| 80 | Apple Watch | General fitness ground truth |
| 78 | Garmin | Activity and GPS accuracy |
| 75 | RingConn | Sleep and HRV from ring |
| 70 | Strava | Activity ground truth for endurance |
| 65 | MyFitnessPal | Nutrition logging accuracy |
| 50 | Apple Health | Hub; may aggregate from any source |
| 40 | Manual | User-entered; intentional but imprecise |

Conflicts are logged to `settings['import.conflict_log']` (last 200 entries).

---

## Source Detection from Apple Health

When importing Apple Health XML, each `<Record>` element has a `sourceName` attribute.  
We auto-detect the originating device/app:

| sourceName pattern | Detected provider |
|--------------------|------------------|
| `watch` | apple_watch |
| `renpho` | renpho |
| `ringconn` / `ring conn` | ringconn |
| `whoop` | whoop |
| `oura` | oura |
| `garmin` | garmin |
| `myfitnesspal` | myfitnesspal |
| `strava` | strava |
| (other) | apple_health |

This means a single Apple Health export correctly attributes data to RENPHO, RingConn, WHOOP, etc.

---

## Developer Accounts Required

| Provider | Account Type | Cost | URL |
|----------|-------------|------|-----|
| Strava | Free developer app | Free | strava.com/settings/api |
| Garmin | Partnership (apply) | Free to apply | connect.garmin.com/developer |
| WHOOP | WHOOP membership + dev access | WHOOP subscription | developer.whoop.com |
| Oura | Free developer app | Free | cloud.ouraring.com/oauth/applications |

Apple Health, RENPHO, RingConn, and MFP: no developer account possible/needed.

---

## What Works Today

| Feature | Status |
|---------|--------|
| Apple Health XML import | ✅ Real |
| RENPHO auto-detection from AH | ✅ Real |
| RingConn auto-detection from AH | ✅ Real |
| WHOOP/Oura/Garmin via AH | ✅ Real (auto-detected from sourceName) |
| MFP via AH or CSV | ✅ Real |
| Strava OAuth flow | ✅ Architecture complete, needs .env credentials |
| Deduplication with trust hierarchy | ✅ importEngine.ts |
| Conflict logging | ✅ settings['import.conflict_log'] |
| Data attribution popover | ✅ MetricAttribution component |
| Background sync | ❌ Requires native iOS app |
| Auto-refresh | ❌ Requires native app or OAuth polling |
| Strava live sync | 🔨 Next milestone |
| Oura OAuth | 🔨 Phase 6 |

---

## iOS Companion App Architecture (Phase 6)

The only path to automatic Apple Health sync:

```
HealthKit background delivery
    ↓ (iOS app, Swift)
SwiftUI lightweight companion
    ↓ (HTTPS POST)
Supabase API
    ↓ (real-time subscription)
Shakthi web app
```

The companion app's only jobs:
- Request HealthKit permissions
- Register for HealthKit background delivery (fires even when app is closed)
- Push new records to Supabase on background delivery
- Display sync status

No UI needed beyond a status screen. Estimated: 4–8 weeks for a focused build.

---

## Strava Integration — Next Steps

1. User adds `VITE_STRAVA_CLIENT_ID` and `VITE_STRAVA_CLIENT_SECRET` to `.env`
2. OAuth flow redirects to Strava, user authorizes
3. Token stored in localStorage
4. App fetches activities list via `https://www.strava.com/api/v3/athlete/activities`
5. Activities parsed and stored in `workouts` IndexedDB store
6. Strava activity ID stored as dedup key (prevents re-importing on refresh)

Rate limit: 200 req/15min, 2000 req/day — sufficient for personal use.

---

## Original Plan (V1/V2) below

---

## Version 1 — Local & Manual (Build This First)

The goal of V1 is a fully working dashboard with real-looking data, zero API keys, zero cloud services, and zero security surface area.

### V1 Data Inputs

**1. Mock Data (Day 1)**
- A local `data/mock.json` file with sample metrics covering all tracked fields
- Lets you build and polish the full UI before any real data pipeline exists
- Looks and behaves exactly like real data

**2. Apple Health XML Import (Week 1–2)**
- User exports from iPhone → Health → Export All Health Data
- Upload `export.xml` into the dashboard (local file picker)
- A parser reads and normalizes the XML into the app's internal data model
- Data never leaves the machine
- Covers: weight, body fat, heart rate, HRV, resting HR, steps, sleep, VO2 max, active calories, workouts, and nutrition (if MFP is synced to Apple Health)

**3. Manual JSON/CSV Import (Week 2–3)**
- Simple upload interface for any CSV or JSON file
- Useful for: Strava bulk export, Renpho CSV export, custom workout logs
- Row-mapping UI lets you match columns to dashboard fields

---

## Version 2 — Strava OAuth (After V1 is Solid)

Strava has a free, official API with OAuth 2.0. This is the cleanest external integration to add first because:
- It's the only major data source NOT in Apple Health
- The API is well-documented and stable
- It doesn't require any paid tier
- OAuth means you never store or touch credentials directly

**What Strava provides via API:**
- All activities (runs, rides, gym sessions)
- GPS routes, pace, distance, elevation
- Heart rate during workouts
- Effort scores and PRs

**Flow:**
1. User clicks "Connect Strava" in dashboard settings
2. Redirect to Strava OAuth authorization page
3. Strava redirects back with an access token
4. Dashboard fetches activities using that token
5. Token stored locally (never sent to a server you don't control)

---

## Version 3 — Native iOS HealthKit (Future)

This is the ideal end state: a native iOS app with direct HealthKit access.

**What this unlocks:**
- Real-time data (no manual export step)
- Write back to Apple Health (log workouts, meals, water)
- Background refresh
- Watch app

**Tradeoff:** Building a native iOS app requires Swift/SwiftUI and an Apple Developer account ($99/year). This is a significant jump in complexity. Worth doing once the dashboard concept is proven with V1 and V2.

---

## Version 4 — MyFitnessPal (Only If Needed)

MFP has no public API. But if you have MFP syncing nutrition data to Apple Health (which it supports), then all macro data already comes through the Apple Health export — no separate MFP integration needed.

If Apple Health sync doesn't cover everything you need, MFP allows CSV export of diary data. That falls under the V1 manual CSV import path.

Do not use any unofficial MFP scrapers or third-party connectors. See `PRIVACY_SECURITY.md`.

---

## Integration Roadmap Summary

| Version | What Gets Built                        | When              |
|---------|----------------------------------------|-------------------|
| V1      | Mock data + AH XML import + CSV import | Now               |
| V2      | Strava official OAuth API              | After V1 is solid |
| V3      | Native iOS app + live HealthKit        | Future            |
| V4      | MFP (only if AH sync is insufficient)  | Future / maybe    |
