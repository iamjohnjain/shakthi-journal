# Native App Roadmap
*Shakthi Journal — Future iOS Companion App*
*Status: Planning only — not being built yet*
*Last updated: 2026-06-30*

---

## Why a Native App?

The web app covers ~90% of the use case. The remaining 10% requires platform APIs that Safari explicitly blocks for privacy and battery reasons:

| Capability | Web (Today) | Native (Future) |
|---|---|---|
| Apple Health read | ❌ Requires manual export | ✅ HealthKit background access |
| Background sync | ❌ Browser must be open | ✅ Background App Refresh |
| Push notifications | ❌ No iOS web push in standalone | ✅ APNs |
| Widgets | ❌ | ✅ WidgetKit |
| Live Activities | ❌ | ✅ ActivityKit |
| Siri shortcuts | ❌ | ✅ App Intents |
| Haptic feedback | ⚠️ Limited via Web API | ✅ Full UIFeedbackGenerator |
| Always-on display | ❌ | ✅ Apple Watch face |

The native app is a companion, not a replacement. The web app remains the primary surface and the source of truth.

---

## Architecture Principles

### 1. Shared Backend
Both apps use the same Supabase instance and the same database schema.
- Same user accounts (Supabase Auth)
- Same sync tables
- No separate native-only tables

### 2. Local-First on Both Platforms
- Web: IndexedDB
- Native: SwiftData or Core Data
- Both sync to Supabase via the same conflict resolution rules (last-write-wins on `updated_at`)

### 3. Auth Handoff
A user who signs into the web app and then installs the native app must not need to re-enter credentials.
- Solution: Sign in with Apple / Google on native uses the same Supabase Auth provider
- Supabase session tokens are NOT shared across platforms — each platform authenticates independently
- User sees their data immediately after signing in because cloud sync downloads it

### 4. No Feature Lock-In
Features that work on native must also work on web (even if less convenient).
- Example: HealthKit auto-sync → web equivalent is manual Apple Health export import
- Native features are enhancements, not exclusives

---

## HealthKit Integration

### What HealthKit Provides
```
HKQuantityType:
  - HKQuantityTypeIdentifierBodyMass          (weight)
  - HKQuantityTypeIdentifierBodyFatPercentage (body fat %)
  - HKQuantityTypeIdentifierHeartRate         (resting HR, workout HR)
  - HKQuantityTypeIdentifierHeartRateVariabilitySDNN (HRV)
  - HKQuantityTypeIdentifierStepCount         (steps)
  - HKQuantityTypeIdentifierActiveEnergyBurned (calories burned)
  - HKQuantityTypeIdentifierBasalEnergyBurned (BMR)
  - HKQuantityTypeIdentifierDistanceWalkingRunning
  - HKQuantityTypeIdentifierOxygenSaturation  (SpO₂)
  - HKQuantityTypeIdentifierSleepAnalysis     (sleep stages via HKCategoryType)
  - HKQuantityTypeIdentifierVO2Max

HKWorkoutType:
  - All workout types (running, strength, HIIT, cycling, etc.)
  - Duration, calories, heart rate zones, GPS route
```

### Permission Model
Request read permissions at first launch. Request only what the user intends to use. Never request write permissions unless the app actively creates workouts.

```swift
let typesToRead: Set<HKObjectType> = [
    HKQuantityType(.bodyMass),
    HKQuantityType(.heartRate),
    HKQuantityType(.heartRateVariabilitySDNN),
    HKCategoryType(.sleepAnalysis),
    HKWorkoutType.workoutType(),
    // etc.
]

healthStore.requestAuthorization(toShare: [], read: typesToRead) { success, error in ... }
```

### Sync Strategy
- On app launch: query for records newer than `lastHealthKitSyncAt`
- Map HealthKit samples → Shakthi `health_metrics` schema
- Write to local SwiftData → queue to Supabase
- Update `lastHealthKitSyncAt` after each successful sync
- Background App Refresh: trigger a HealthKit query and sync when iOS wakes the app

### Mapping HealthKit → Shakthi Schema
```swift
// health_metrics record format (same as web):
{
  "id": "weight_2026-06-30",         // type_date
  "date": "2026-06-30",
  "type": "weight",
  "value": 84.5,                     // kg
  "unit": "kg",
  "sourceId": "com.apple.health",
  "sourceName": "Apple Health",
  "dataMode": "imported",
  "importedAt": "2026-06-30T08:00:00Z"
}
```

---

## Shared Authentication

### Flow: Web → Native
1. User registers on web (email or OAuth)
2. User installs native app
3. User taps "Sign in with Google / Apple / Email" — same Supabase project
4. Supabase Auth returns session tokens
5. Native app stores tokens in Keychain (not UserDefaults)
6. App downloads cloud data to local SwiftData

### Flow: Native → Web
1. User is signed in to native app
2. User opens web app on desktop
3. User signs in with same account
4. Web app downloads same cloud data to IndexedDB
5. Both are now in sync

### Deep Link for Auth Handoff
The native app registers a custom URL scheme and/or universal link:
```
shakthijournal://auth/callback   (custom scheme)
https://app.shakthijournal.com/auth/callback  (universal link)
```

This allows Supabase email confirmation links to open the native app when installed.

### Token Storage (Native)
```swift
// Store in Keychain, not UserDefaults
KeychainHelper.save(supabaseAccessToken, key: "supabase_access_token")
KeychainHelper.save(supabaseRefreshToken, key: "supabase_refresh_token")
```

Never store auth tokens in:
- UserDefaults (readable without entitlement)
- iCloud KeyValue store (syncs and readable on other devices)
- Any file (App sandbox is secure but tokens belong in Keychain)

---

## Background Sync

### Approach
Use iOS Background App Refresh for periodic sync (every 15–60 minutes based on iOS availability):

```swift
import BackgroundTasks

// Register at app startup
BGTaskScheduler.shared.register(forTaskWithIdentifier: "com.shakthi.sync", using: nil) { task in
    self.handleBackgroundSync(task: task as! BGAppRefreshTask)
}

// Schedule next refresh
func scheduleBackgroundSync() {
    let request = BGAppRefreshTaskRequest(identifier: "com.shakthi.sync")
    request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
    try? BGTaskScheduler.shared.submit(request)
}
```

Background sync should:
1. Pull latest HealthKit data (last N hours)
2. Drain the local sync queue to Supabase
3. Pull cloud changes to local SwiftData
4. Re-schedule itself

### Limitations
- iOS controls when background tasks actually run — no guarantees
- Background tasks get ~30 seconds of execution time
- Foreground sync should always be the primary mechanism

---

## Widgets

### Planned Widgets

**Small (2×2):** Daily ring showing calorie/protein progress
**Medium (2×4):** Today's workout + nutrition summary
**Large (4×4):** Weekly consistency score + key metrics

### Implementation
```swift
struct ShakthiWidget: Widget {
    let kind = "ShakthiDailyWidget"
    
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: DailyProvider()) { entry in
            DailyWidgetView(entry: entry)
        }
        .configurationDisplayName("Shakthi Daily")
        .description("Today's progress at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
```

Widgets read from a shared App Group container that the main app writes to after each sync. Never read from Keychain or Supabase directly from within the Widget extension.

---

## Push Notifications

### Use Cases (User-Controlled)
- Daily workout reminder ("Time to train — your plan says Legs today")
- Weekly review ready ("Your week in review is ready")
- PR alert ("New squat PR — 225 lbs × 5")
- Streak at risk ("You haven't logged today — 12-day streak at risk")

### What We'll Never Send
- Marketing notifications
- "We miss you" re-engagement spam
- Monetization nudges

### Implementation
```swift
// Request permission
UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
    guard granted else { return }
    DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() }
}

// Register token with Supabase
func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    let tokenString = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
    supabase.functions.invoke("register-push-token", body: ["token": tokenString])
}
```

All notification preferences are stored locally and in Supabase. Users can granularly disable any notification type in Settings.

---

## Live Activities

### Use Case: Active Workout Timer
While a workout is in progress, show on the Lock Screen and Dynamic Island:
- Elapsed time
- Current exercise + set count
- Heart rate (from Apple Watch)
- Calories burned

```swift
struct WorkoutAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var elapsedSeconds: Int
        var currentExercise: String
        var setsCompleted: Int
        var heartRate: Int?
        var calories: Int
    }
    var workoutTitle: String
    var startedAt: Date
}
```

Live Activities do not require a server — they are driven entirely from the app process.

---

## Apple Watch Companion

### Minimum Viable Watch App
- Quick log: log a set (exercise, reps, weight) from wrist
- Heart rate ring on watch face complication
- Workout timer with RPE entry at finish

### Data Flow
```
Apple Watch ←→ iPhone App ←→ Supabase
         WatchConnectivity       Sync Engine
```

Watch data is sent to iPhone via `WCSession` → iPhone writes to local + queues sync. Watch does not talk to Supabase directly.

---

## Tech Stack Recommendation

| Layer | Choice | Reason |
|---|---|---|
| Language | Swift 6 | Strict concurrency, modern ergonomics |
| UI | SwiftUI | Matches declarative style of React |
| Local storage | SwiftData | Modern replacement for Core Data, Codable-native |
| Network | URLSession + async/await | No extra dependency |
| Auth | Supabase Swift SDK | Same backend |
| HealthKit | Native HealthKit framework | Required |
| Background | BackgroundTasks framework | BGAppRefreshTask |
| Notifications | UserNotifications framework | APNs |
| Widgets | WidgetKit | SwiftUI widgets |
| Live Activities | ActivityKit | iOS 16.1+ |
| Watch | WatchConnectivity + WatchKit | Real-time WCSession |

---

## Development Phases (When Started)

### Phase N+1: Foundation
- [ ] Project setup, Supabase Swift SDK integrated
- [ ] Auth (Sign in with Apple, Google, Email)
- [ ] Download existing cloud data → display in SwiftUI
- [ ] Upload new data to Supabase
- [ ] HealthKit read permissions + basic sync

### Phase N+2: Core Features
- [ ] Workout logging (mirror web feature parity)
- [ ] Nutrition logging
- [ ] Daily log
- [ ] Push notifications (reminders only)

### Phase N+3: Native Advantages
- [ ] HealthKit background sync
- [ ] Widgets (small + medium)
- [ ] Apple Watch companion
- [ ] Live Activities for workout timer

### Phase N+4: Polish
- [ ] Siri shortcuts
- [ ] iCloud Keychain credential autofill
- [ ] Universal links for deep linking from web
- [ ] App Clips for onboarding without full install

---

## What the Web App Does While Waiting

Until the native app ships:
- Apple Health: manual export.xml import (already implemented)
- Background sync: not available — user must have browser open
- Widgets: not available — suggest bookmarking web app to home screen
- Push notifications: not available on iOS Safari (web push blocked in PWA mode until further WebKit updates)

This is clearly communicated to users in the onboarding Health Data step and in Connected Accounts.
