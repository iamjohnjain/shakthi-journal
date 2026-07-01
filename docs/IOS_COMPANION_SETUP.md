# iOS Companion App — Setup Guide

Shakthi Journal iOS is a native HealthKit bridge. It reads health data from Apple Health and syncs it to the same Supabase project the web dashboard uses. The web app is unchanged.

**Phase iOS 1.1 changes (current):**
- Missing Supabase config shows `ConfigurationView` instead of crashing
- HealthKit permission request now includes write access for workouts, body weight, body fat (future use — nothing is written yet)
- `SyncState` model replaces single timestamp: tracks `lastSuccessfulSync`, `lastAttemptedSync`, `lastError`, `pendingUploads`, `healthPermissionGranted`, `healthPermissionRequested`
- Dashboard sync card shows full SyncState history

---

## Before you start

| Requirement | Notes |
|---|---|
| Mac with Xcode 15 or 16 | Already installed |
| Apple ID | Free — no $99/yr required for local testing |
| Physical iPhone (iOS 17+) | HealthKit does not work in the Simulator |
| USB cable | First run requires wired connection; wireless works after |
| Supabase URL + anon key | From your existing `.env` file |

---

## Step 1 — Open the project in Xcode

The Xcode project file is already generated at `ios/ShakthiJournal.xcodeproj`. No project creation needed.

```
open /Users/johnmundackal/Projects/ios/ShakthiJournal.xcodeproj
```

Or in Finder: navigate to `Projects/ios/` and double-click `ShakthiJournal.xcodeproj`.

Xcode opens showing the full project navigator with all source files already organised:

```
ShakthiJournal/
├── ShakthiJournalApp.swift
├── Auth/
│   ├── AuthManager.swift
│   ├── KeychainHelper.swift
│   └── SignInView.swift
├── Config/
│   ├── AppConfig.swift
│   ├── Secrets.xcconfig.template
│   └── Secrets.xcconfig          ← gitignored, fill in your values
├── HealthKit/
│   ├── HealthKitManager.swift
│   └── HealthKitMapper.swift
├── Models/
│   ├── HealthMetric.swift
│   └── SyncState.swift
├── Sync/
│   ├── SupabaseClient.swift
│   └── SyncEngine.swift
├── Views/
│   ├── ConfigurationView.swift
│   ├── ContentView.swift
│   ├── DashboardView.swift
│   └── PermissionsView.swift
├── Info.plist
└── ShakthiJournal.entitlements
```

---

## Step 2 — Fill in Supabase credentials

`Secrets.xcconfig` already exists at `ios/ShakthiJournal/Config/Secrets.xcconfig` with placeholder values. Open it and fill in your real values:

```
SUPABASE_URL = https://your-project-ref.supabase.co
SUPABASE_ANON_KEY = eyJhbGci...your-anon-key...
```

Get these from: **Supabase Dashboard → Project Settings → API**.

> **Security note:** The anon key is safe to bundle in the app because Row Level
> Security (RLS) is enabled on all tables. The key alone cannot read any user data.
> **Never** put your `service_role` key here.

`Secrets.xcconfig` is already in `ios/.gitignore` and will never be committed.

The `Secrets.xcconfig` is already wired as the `baseConfigurationReference` for both Debug and Release build configurations in the project file. Xcode automatically substitutes `$(SUPABASE_URL)` and `$(SUPABASE_ANON_KEY)` into `Info.plist` at build time. No Xcode GUI steps needed for this.

---

## Step 3 — Select your Apple ID team

When you first open the project, Xcode shows:

> **"Signing for ShakthiJournal requires a development team."**

Fix this in one click:

1. Click **ShakthiJournal** in the Project Navigator (the blue project icon at the top)
2. Select the **ShakthiJournal** target (under TARGETS)
3. Click the **Signing & Capabilities** tab
4. Under **Team**, click the dropdown → select your Apple ID
   - If your Apple ID isn't listed: **Xcode → Settings → Accounts → +** → add your Apple ID
5. Xcode automatically creates/downloads a provisioning profile

Bundle identifier is already set to `com.shakthijournal.app`. If it conflicts with an existing app, change it to something like `com.yourname.shakthijournal`.

---

## Step 4 — Enable HealthKit capability

The `ShakthiJournal.entitlements` file is already created with the HealthKit entitlement. However, Xcode also needs the **capability** enabled in the target to link the framework correctly:

1. With the **ShakthiJournal** target selected → **Signing & Capabilities** tab
2. Click **+ Capability** (top-left of the tab)
3. Type `HealthKit` → press Return
4. Leave "Clinical Health Records" unchecked

> **If HealthKit is already listed** (Xcode detected the entitlements file): skip this step.

The project already links `HealthKit.framework` and `Security.framework` in the Frameworks build phase, so no manual framework adding is needed.

---

## Step 5 — Connect your iPhone and run

1. Plug your iPhone into the Mac via USB
2. On your iPhone: tap **Trust** on the "Trust This Computer?" prompt
3. If iPhone asks for Developer Mode: **Settings → Privacy & Security → Developer Mode → toggle ON** → restart iPhone
4. In Xcode: click the device dropdown next to the Run button → select your iPhone (it will show the iPhone model name)
5. Press **⌘R** (Run)
6. Xcode compiles and installs the app (~30–60 seconds first time)
7. On your iPhone: **"ShakthiJournal" is not trusted** prompt may appear → go to **Settings → General → VPN & Device Management → tap your Apple ID email → Trust**
8. Tap the ShakthiJournal app icon — it opens

> **7-day profile limit:** With a free Apple ID, the provisioning profile expires every 7 days.
> Run the app from Xcode again to re-sign it. No code changes needed — just ⌘R.

---

## Step 6 — First sync

1. Tap **Connect Apple Health**
2. Review the permissions screen → tap **Allow Access**
3. The iOS HealthKit permission sheet appears — approve each category
4. Return to the dashboard → tap **Sync Now**
5. The app fetches the last 30 days of HealthKit data and uploads it to Supabase
6. Open the Shakthi Journal web dashboard — your health data appears immediately

---

## How the sync works

```
iPhone HealthKit
     │  HealthKitManager.fetchSamples(since: lastSyncAt)
     │
     ▼
HealthKitMapper.map(samples)
     │  Converts samples to health_metrics JSON format
     │  Type strings match the web app exactly (see HealthMetric.swift)
     │
     ▼
SupabaseClient.upsertHealthMetrics(metrics, userId, accessToken)
     │  POST /rest/v1/health_metrics
     │  Prefer: resolution=merge-duplicates  ← upsert, not insert
     │
     ▼
Supabase health_metrics table (same table the web app reads)
     │
     ▼
Web dashboard pulls on next open (syncEngine._pullChanges)
```

**Conflict resolution:** If both the iPhone and a web Apple Health import write the same metric (e.g. `weight_2026-06-30`), whoever writes last wins. The `updated_at` column is used for comparison. This matches the existing web sync behavior.

---

## Data types written

| HealthKit type | Supabase `data.type` | Unit | Aggregation |
|---|---|---|---|
| `.bodyMass` | `weight` | `kg` | latest per day |
| `.bodyFatPercentage` | `bodyFatPct` | `%` | latest per day |
| `.stepCount` | `steps` | `steps` | daily sum |
| `.activeEnergyBurned` | `activeCalories` | `kcal` | daily sum |
| `.restingHeartRate` | `restingHeartRate` | `bpm` | latest per day |
| `.heartRateVariabilitySDNN` | `hrv` | `ms` | latest per day |
| `sleepAnalysis` | `sleepHours` | `h` | asleep stages summed, assigned to wake date |

Workouts are not yet synced (Phase iOS 2 — the schema is more complex).

---

## What works now vs. what requires a paid account later

### Works now (free Apple ID)

- Sign in with the same Supabase account as the web app
- Read all 7 HealthKit data types
- Sync to the same Supabase tables
- Web dashboard shows iPhone data immediately
- Run on your own physical iPhone (7-day profile renewal)

### Requires Apple Developer Program ($99/yr)

| Feature | Why it needs paid tier |
|---|---|
| Background sync (auto-runs every 15–60 min) | `BGTaskScheduler` is a restricted entitlement |
| Push notifications | APNs requires a paid certificate |
| Distribute on App Store | Requires paid account |
| Sign in with Apple | Requires paid account + Apple Services ID |
| 1-year provisioning profile | Free tier profiles expire every 7 days |

---

## No-break guarantee for the web app

- No new Supabase tables
- No migration files
- No changes to `src/` or any web source
- The web sync engine already handles records written by the iOS app
- Web users who never install the iOS app see no change

---

## First run experience on a physical iPhone

This is exactly what you will see when you install and open the app for the first time.

### If Secrets.xcconfig is not configured

The app opens to a **Configuration Required** screen. It shows:
- Which values are missing (`SUPABASE_URL`, `SUPABASE_ANON_KEY`)
- Whether the placeholder text is still present
- The five steps to fix it

This screen appears instead of a crash. Once you follow the steps and rebuild, it never appears again.

---

### If Secrets.xcconfig is correctly configured

**1. Loading (< 1 second)**
The app tries to restore a session from Keychain. Nothing is there yet, so it transitions immediately.

**2. Sign In screen**
Plain dark screen with the Shakthi mark, two text fields, and a Sign In button. Enter the same email and password you use on the web app. No Google or Apple options yet — those are Phase iOS 2+.

**3. Authentication**
A brief loading state while Supabase verifies the credentials. If the password is wrong, a red error message appears inline ("Incorrect email or password."). No alert dialogs.

**4. Dashboard — first view**
Three cards appear:
- **Account card** — your email address and a Sign Out button
- **Apple Health card** — shows "Connect Apple Health" button (not yet connected)
- **Sync Status card** — all values show "Never" or "Not connected"

HealthKit permission is **not** requested at this point. The app waits for you to initiate.

**5. Tap "Connect Apple Health"**
A sheet slides up showing two sections:
- **Reading Today** — 7 types with eye icons (read)
- **Write Permission (Future Use)** — 3 types with pencil icons and "future" badge

A note explains that nothing is written today; the write permission is established early to avoid a second dialog later.

**6. Tap "Allow Access"**
The iOS HealthKit permission sheet appears — this is the native system sheet, not an app screen. It lists every data type. You can approve all or selectively. The app does not require all permissions; it just skips types that are denied.

**7. Back on Dashboard**
The Apple Health card now shows the "Sync Now" button. The permission badge in the Sync Status card changes to "Authorized".

**8. Tap "Sync Now"**
Three status lines cycle in sequence:
```
Reading Apple Health…
Mapping 847 samples…
Uploading 183 records…
```
The Sync Status card updates live:
- **Last attempt:** [timestamp]
- **Pending:** 183 records (clears on success)

**9. Sync complete**
```
Last sync:      Jun 30, 2026 at 10:23 AM
Last batch:     183 records
Total uploaded: 183 records
Apple Health:   Authorized + data received
```

**10. Open the web dashboard**
Your health data appears immediately — Timeline shows the past 30 days of metrics, Recovery shows HRV and sleep, the Dashboard shows today's weight and steps. No import needed.

---

### On subsequent launches

1. App opens → loading spinner
2. Session restored from Keychain (< 300ms) → Dashboard
3. Sync Status card shows last sync time and totals
4. Tap "Sync Now" to push any new HealthKit data since the last sync
5. Only new records are uploaded (incremental sync from `lastSuccessfulSync`)

---

### If sync fails

The Sync Status card shows:
- **Last attempt** in red (differs from last successful sync)
- **Last error** message below the grid
- **Pending** count if records were ready but network failed

Tap "Sync Now" to retry. The app picks up from the last successful sync timestamp.

---

## Troubleshooting

**Build error: `SUPABASE_URL not set`**
→ Make sure `Secrets.xcconfig` exists and is attached to both Debug and Release configurations (Step 3b).

**HealthKit permission sheet doesn't appear**
→ Check that the HealthKit capability is enabled (Step 4). On Simulator, HealthKit is unavailable by design — use a physical iPhone.

**"Untrusted Developer" on iPhone**
→ Go to iPhone → Settings → General → VPN & Device Management → tap your Apple ID → Trust.

**Sync shows 0 records**
→ Apple Health may have no data in the last 30 days. Check the Health app. If data exists, check that you approved all permission types in the iOS HealthKit sheet.

**401 Unauthorized from Supabase**
→ Your session token expired. Sign out and sign back in. (Token refresh happens automatically on app launch; if it failed, sign-in forces a new token.)

**Web dashboard doesn't update after sync**
→ The web app pulls from Supabase on next open. Refresh the browser or navigate away and back to `/` to trigger a pull.
