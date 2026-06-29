# Production QA Checklist

Run this checklist after every deployment before sharing with beta testers.

---

## 1. Desktop (Chrome / Safari / Firefox)

| Check | Pass? |
|---|---|
| App loads at root URL without white flash | |
| Browser tab title shows "Shakthi Journal" | |
| Sidebar navigation renders | |
| All nav links route correctly | |
| Refreshing `/settings`, `/workouts`, `/nutrition` returns the app (not 404) | |
| No JavaScript errors in browser console | |

---

## 2. Today (Dashboard)

| Check | Pass? |
|---|---|
| Daily Brief card renders (recovery ring, stats) | |
| Coach notes section renders | |
| Visible section toggle works | |
| "Log Workout" / "Log Food" buttons navigate correctly | |

---

## 3. Workouts

| Check | Pass? |
|---|---|
| Workouts page loads | |
| "Log Workout" opens the log modal | |
| Adding exercises and sets works | |
| Elapsed timer ticks during logging | |
| 90-second rest timer starts and counts down | |
| Saving a workout persists to IndexedDB | |
| Workout appears in history after save | |
| Exercise last-performance bar shows on second log | |

---

## 4. Nutrition

| Check | Pass? |
|---|---|
| Nutrition page loads with macro rings | |
| Water quick-add buttons (+250 / +500 / +750 / +1000) update total | |
| Water total persists on page reload | |
| Protein remaining text shows food suggestions | |

---

## 5. Settings & Data Safety

| Check | Pass? |
|---|---|
| Settings page loads | |
| Data Safety section visible | |
| Export Backup navigates to Backup & Restore page | |
| Restore from Backup navigates to Backup & Restore page | |
| "Export All Data" button triggers file download | |
| Downloaded file name matches `shakthi-journal-backup-YYYY-MM-DD.json` | |
| Downloaded file is valid JSON (open and inspect) | |
| "Choose Backup File" opens file picker | |
| Selecting the downloaded file shows the Import Preview modal | |
| Preview shows: export date, app version, record counts | |
| Merge mode selected by default | |
| Switching to Replace All shows orange warning | |
| Cancel closes modal without importing | |
| Merge import completes with success message | |
| Replace all shows confirmation, then completes | |

---

## 6. Backup round-trip test

| Check | Pass? |
|---|---|
| Export a backup | |
| Log a new workout | |
| Import the backup with Merge — old workout exists, new workout also exists | |
| Import the backup with Replace All — only pre-export workouts remain | |

---

## 7. iPhone Safari

| Check | Pass? |
|---|---|
| App loads at `https://your-app.pages.dev` | |
| No horizontal scroll / layout overflow | |
| Tap targets are large enough to tap accurately | |
| Modals open and scroll correctly | |
| Keyboard doesn't permanently cover inputs | |
| Share → Add to Home Screen → Add works | |
| App opens fullscreen from home screen (no browser chrome) | |
| App title on home screen shows "Shakthi" | |
| Export backup downloads a file on iOS Safari | |

---

## 8. Android Chrome

| Check | Pass? |
|---|---|
| App loads | |
| Install PWA prompt appears (or via browser menu) | |
| Installed PWA opens fullscreen | |
| Navigation works in installed PWA | |
| Export backup works | |

---

## 9. Compare

| Check | Pass? |
|---|---|
| Compare page loads | |
| Date pickers accept input | |
| With data: metrics render for both dates | |
| With no data: empty state shown gracefully | |

---

## 10. Profile

| Check | Pass? |
|---|---|
| Profile page loads | |
| Edit modal opens | |
| Saving changes persists | |

---

## 11. Import (Apple Health)

| Check | Pass? |
|---|---|
| Import page loads | |
| File picker accepts `.xml` files | |
| Step progress advances | |
| Imported metrics appear in Dashboard | |

---

## 12. IndexedDB persistence

| Check | Pass? |
|---|---|
| Log a workout, close the tab, reopen — workout still exists | |
| Add water, reload — water total is preserved | |
| Change unit system, reload — setting is preserved | |
| Enable Mock Mode, reload — still enabled | |

---

## Sign-off

Tested by: _______________

Date: _______________

Deploy URL: _______________

All critical checks passed: ☐ Yes  ☐ No (see notes below)

Notes:
