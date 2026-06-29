# Beta Testing Guide

Thank you for testing Shakthi Journal. This is a private beta for trusted testers.

---

## What is Shakthi Journal?

A personal health OS that runs entirely in your browser. It tracks:

- **Workouts** — log sessions, exercises, sets, weight, reps
- **Nutrition** — daily macros, protein, calories, water intake
- **Recovery** — daily readiness from HRV, sleep, and Apple Health data
- **Goals** — athletic goals with status and next actions
- **Daily Brief** — a unified summary of today's readiness and priorities

---

## How to access

Open this URL in your browser:

```
https://shakthi-journal.pages.dev
```

*(URL will be shared directly by the developer.)*

**Best experience:**
- iPhone: use **Safari** and install to home screen (Share → Add to Home Screen)
- Android: use **Chrome** — install when prompted
- Desktop: use Chrome, Safari, or Firefox

---

## Installing on your phone (recommended)

### iPhone
1. Open the URL in **Safari** (not Chrome — iOS PWA install only works in Safari).
2. Tap the **Share** button (box with arrow at the bottom).
3. Scroll down → tap **Add to Home Screen**.
4. Tap **Add**.

The app now opens fullscreen from your home screen, like a native app.

### Android
1. Open the URL in Chrome.
2. Tap the menu (three dots) → **Add to Home Screen**, or wait for Chrome's install banner.
3. Tap **Add**.

---

## Your data — what you need to know

**Everything is stored locally on your device.** No data is sent to any server.

- Data lives in your browser's internal database (IndexedDB).
- If you clear your browser data, the app data is erased.
- If you switch devices, you need to export a backup and import it.
- Each device and browser is a separate data store — they don't sync automatically.

### To protect your data

Go to **Settings → Backup & Restore** regularly and tap **Export All Data**. Save the backup file somewhere safe (iCloud Drive, Google Drive, email it to yourself).

---

## Known limitations

| Limitation | Status |
|---|---|
| Data doesn't sync between devices automatically | By design (local-first). Use Backup & Restore to transfer. |
| Clearing browser storage erases all data | By design. Export backups regularly. |
| Apple Health integration requires manual XML export | Planned automation in future. |
| Strava auto-sync may not be configured | Contact the developer. |
| Offline support is partial | App loads if recently cached, but full offline mode requires a future update. |
| PWA icons are placeholder squares | Will be replaced with proper icons before public launch. |
| No account / login | By design. Cloud sync is a future feature. |

---

## How to report bugs

1. Note exactly what you did and what you expected.
2. Note what actually happened.
3. If possible, include:
   - Device and browser (e.g. "iPhone 15 Pro, Safari 18")
   - Screenshot or screen recording
   - Any error message shown

Send reports to: **[developer's contact method]**

Or file them at: **[GitHub issues URL if public]**

---

## What to test specifically

High-priority areas for beta feedback:

1. **Daily workflow** — Is the Today screen useful? Is the daily brief readable?
2. **Workout logging** — Is the log modal easy to use on a phone? Does the rest timer work?
3. **Water logging** — Are the quick-add buttons the right amounts?
4. **Backup & Restore** — Can you successfully export and re-import your data?
5. **Add to Home Screen** — Does it install cleanly? Does it open fullscreen?
6. **Layout on your device** — Any text overflow, layout breaks, or tap target issues?

---

## How updates are delivered

When a new version is deployed:
- Refresh the app — changes appear automatically.
- If you installed as a PWA, close and reopen the app — the browser fetches the latest version in the background.
- No app store update is needed.

Your data is never affected by updates. The local IndexedDB structure is version-controlled and migrates safely.

---

## Privacy notice

Shakthi Journal is a **local-first application**.

- No health data is transmitted to any server.
- No analytics, tracking, or telemetry is included.
- No account is required.
- The only external connection is Strava OAuth (if you choose to connect it), which sends your request to Strava's servers with your permission.
- The app can be used entirely without any internet connection after the initial page load.

Your data belongs to you. It lives on your device and nowhere else.

---

## Data storage explanation

When you use Shakthi Journal, your data is stored in **IndexedDB** — a database built into every modern browser. Think of it like a local file on your computer, managed by the browser.

| What's stored | Where |
|---|---|
| Workouts | Your browser's IndexedDB |
| Nutrition logs | Your browser's IndexedDB |
| Apple Health data | Your browser's IndexedDB |
| Daily logs | Your browser's IndexedDB |
| App settings | Your browser's IndexedDB |
| Strava OAuth token | Browser localStorage (this device only) |

**Nothing** goes to a server, cloud database, or third party.

**Consequence:** clearing your browser data, switching browsers, or switching devices will remove your data. Always keep a recent backup.
