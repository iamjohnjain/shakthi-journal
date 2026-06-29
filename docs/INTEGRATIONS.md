# Integrations Plan

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
