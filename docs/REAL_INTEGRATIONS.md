# Real Integrations Assessment
## What's Actually Possible Today (as of 2026)

This is an honest, source-by-source breakdown of what's technically real — no hype.

---

## Apple Health / iPhone

**Verdict: Manual import REAL today. Automatic sync requires native iOS app (Phase 6).**

### What's possible:
- **XML export (manual):** Export all health data from the iPhone Health app as a ZIP. Unzip to get `export.xml`. We can parse this file to import all health records. ✅ Real today.
- **Apple Health API (HealthKit):** Only accessible from native iOS/macOS apps. Web apps **cannot** access HealthKit. No workaround.
- **Automatic background sync:** Impossible from a web app. Requires iOS companion app (Phase 6).

### How to use today:
1. iPhone → Health app → Profile photo → Export All Health Data
2. Share the ZIP to your Mac → unzip → import `export.xml` here

### What it contains:
Steps, heart rate, HRV, sleep, active calories, workouts, ECG, blood oxygen, and any data from connected devices (Apple Watch, RingConn, RENPHO if sync enabled).

---

## Apple Watch

**Verdict: Data flows through Apple Health. No separate integration needed.**

### What's possible:
- All Apple Watch data is written to Apple Health in real time.
- Importing the Apple Health XML export includes Watch data automatically.
- No direct web API for Apple Watch exists.

### Limitation:
We cannot see Watch data in real time without a native iOS app querying HealthKit.

---

## RingConn

**Verdict: Via Apple Health only. No public RingConn API.**

### What's possible:
- RingConn app can sync to Apple Health (user must enable this in the RingConn app).
- Data types: sleep stages, HRV, SpO2, stress score, activity.
- Once Apple Health sync is enabled, RingConn data appears in the Apple Health XML export.
- RingConn has **no public third-party API** as of 2026.

### How to use today:
1. Open RingConn app → Profile → Connected Apps → Apple Health → enable all categories
2. Then import Apple Health XML export to capture Ring data

---

## RENPHO

**Verdict: CSV export or via Apple Health. No public RENPHO API.**

### What's possible:
- **Apple Health sync:** RENPHO app can sync body composition data to Apple Health. ✅ Real.
- **CSV export:** RENPHO app → Profile → Export Data → provides a CSV of all weigh-ins. ✅ Real.
- **No public API:** RENPHO has no documented third-party developer API as of 2026.

### Data types: Weight, body fat %, muscle mass, BMI, body water %, bone mass, visceral fat, basal metabolic rate (BMR).

### Recommendation:
Enable Apple Health sync in the RENPHO app. Then a single Apple Health export captures everything.

---

## Strava

**Verdict: REAL OAuth 2.0 API. Full integration possible today.**

### What's possible:
- Strava has a well-documented, free public API with OAuth 2.0.
- Activities (GPS routes, splits, pace, power, heart rate zones) ✅
- Segment efforts, personal records ✅
- Live segment data (requires premium subscription) — out of scope
- Rate limits: 200 requests/15 min, 2,000 requests/day (free tier)

### How the OAuth flow works:
1. User registers an app at strava.com/settings/api
2. Gets a `client_id` and `client_secret`
3. User clicks "Connect with Strava" in the app
4. Redirected to Strava's authorization page
5. After approval, Strava redirects to our callback URL with an auth `code`
6. We exchange the code for an access token + refresh token
7. We use the access token to call the Strava API

### Security limitation (important):
In a browser-only app, the `client_secret` must be in the JavaScript bundle (via `VITE_STRAVA_CLIENT_SECRET`). This is acceptable for **personal local use** — anyone with access to your laptop could theoretically extract it. For a production public app, the token exchange must happen through a backend server so the secret never reaches the browser.

### What's NOT in Strava's API:
- Nutrition data (Strava doesn't track food)
- Sleep data
- Body composition

### Files involved:
- `src/services/strava/stravaOAuth.ts` — OAuth flow implementation
- `.env.example` — required environment variables
- `src/pages/StravaCallback.tsx` — OAuth callback handler

---

## MyFitnessPal (MFP)

**Verdict: No public API. CSV export or via Apple Health.**

### What happened:
MyFitnessPal had a public API for years. In May 2019, they deprecated it and removed all developer access. As of 2026, there is **no official third-party API**.

### What's possible:
- **Apple Health sync:** MFP app can sync daily nutrition totals to Apple Health (calories, macros). ✅ Real — enable in MFP app settings.
- **CSV export:** myfitnesspal.com website → Settings → Diary Settings → Export allows downloading a CSV of your food diary. ✅ Real.
- **Unofficial scrapers:** Exist but violate MFP Terms of Service. Not implemented — unreliable and carries account ban risk.

### Limitation:
MFP-to-Apple-Health sync only provides daily totals (total calories, total protein, etc.), not individual meal entries or food items.

---

## Summary Table

| Source | API Available | Method Today | Automatic Sync | Phase |
|--------|--------------|--------------|----------------|-------|
| Apple Health | No (web) | XML export → manual import | Phase 6 (iOS app) | 2 |
| Apple Watch | No | Via Apple Health export | Phase 6 | 2 |
| RingConn | No | Via Apple Health export | Phase 6 | 2 |
| RENPHO | No | CSV export or Apple Health | Phase 6 | 2 |
| Strava | Yes ✅ | OAuth 2.0 API | Yes (with creds) | 3 |
| MyFitnessPal | No | CSV export or Apple Health | Phase 6 | 2 |

---

## What "Real Today" Means

- **Phase 1 (now):** All data is mock. UI is fully functional with simulated data.
- **Phase 2 (next):** Build real XML/CSV parsers. Users manually export files from Apple Health, RENPHO, MFP and import them here. Data is real but manual.
- **Phase 3:** Strava OAuth connection. Automatically fetch real activities.
- **Phase 6:** Native iOS companion app with HealthKit access = truly automatic sync for everything.
