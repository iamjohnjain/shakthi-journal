# Data Sources

## The Central Rule: Apple Health Is the Hub

Apple Watch, RingConn, and Renpho all have iPhone apps that sync into Apple Health automatically. This means you already have one place where most of your health data lives. The integration strategy starts there — not with building separate connectors for each device.

---

## Source-by-Source Breakdown

### Apple Watch
- **Sync path:** Automatic → Apple Health
- **What it provides:** Heart rate, resting HR, HRV, steps, active calories, workouts, VO2 max, sleep (via Sleep app)
- **Integration method:** Apple Health export (V1) → Native HealthKit (future)
- **Action needed:** Nothing extra. Data is already in Apple Health.

### RingConn
- **Sync path:** RingConn app → Apple Health (sleep, HRV, SpO2, heart rate)
- **What it provides:** Sleep stages, HRV, recovery score, resting HR
- **Integration method:** Apple Health export (V1)
- **Action needed:** Confirm in the RingConn app that Apple Health sync is enabled.

### Renpho Smart Scale
- **Sync path:** Renpho app → Apple Health (weight, body fat %, BMI, muscle mass, etc.)
- **What it provides:** Weight, body composition breakdown
- **Integration method:** Apple Health export (V1)
- **Action needed:** Confirm in Renpho app that Apple Health sync is enabled.

### MyFitnessPal
- **Sync path:** MFP app → Apple Health (calories eaten, macros)
- **What it provides:** Calories, protein, carbs, fat, fiber
- **Official API:** Removed in 2019. No public API currently exists.
- **Integration method:** Apple Health export (since MFP syncs nutrition to Apple Health) OR manual CSV export from MFP
- **Action needed:** In MFP → Settings → Health App → enable calorie and nutrient sync. Then data appears in Apple Health export.
- **Note:** If MFP nutrition is syncing to Apple Health, you don't need a separate MFP integration at all.

### Strava
- **Sync path:** Does NOT sync to Apple Health by default (can be configured, but limited)
- **What it provides:** GPS routes, pace, distance, elevation, splits, effort scores
- **Official API:** Yes — Strava has a free, well-documented OAuth 2.0 API
- **Integration method:** Official Strava API (V2 feature)
- **Action needed:** Nothing yet. Plan OAuth flow for later.

---

## Data Source Integration Matrix

| Source        | In Apple Health? | V1 Method              | V2 Method           |
|---------------|-----------------|------------------------|---------------------|
| Apple Watch   | Yes             | AH Export XML          | Native HealthKit    |
| RingConn      | Yes (if enabled)| AH Export XML          | Native HealthKit    |
| Renpho        | Yes (if enabled)| AH Export XML          | Native HealthKit    |
| MyFitnessPal  | Partial (if enabled) | AH Export XML / CSV | AH HealthKit sync  |
| Strava        | No (or limited) | Manual GPX/CSV export  | Official OAuth API  |

---

## Apple Health Export Format

When you export from iPhone → Health app → profile icon → Export All Health Data, you get a `export.zip` containing:

- `export.xml` — the main file with all health records (XML format, can be large)
- `workout-routes/` — GPS .gpx files for each workout
- `electrocardiograms/` — ECG CSVs if applicable

The XML is structured with `<Record>` entries like:

```xml
<Record type="HKQuantityTypeIdentifierHeartRate" 
        value="62" 
        unit="count/min" 
        startDate="2026-06-25 08:14:00 -0700" />
```

V1 plan: build a parser that reads this file and loads it into the dashboard's local data store.
