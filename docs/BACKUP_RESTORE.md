# Backup & Restore

All Shakthi Journal data lives in **IndexedDB on this device in this browser**. It is not backed up to any server. Clearing your browser data, switching browsers, or deploying to a new domain will erase it.

**Export a backup before any of those events.**

---

## Exporting

1. Go to **Settings → Backup & Restore** (or navigate to `/settings/backup`).
2. Click **Export All Data**.
3. A JSON file is downloaded to your Downloads folder:
   `shakthi-journal-backup-YYYY-MM-DD.json`

The file contains all 11 IndexedDB stores:

| Store | Contents |
|---|---|
| `health_metrics` | Apple Health parsed records (HRV, sleep, steps, weight, etc.) |
| `sync_history` | Import/sync audit log |
| `settings` | App settings (mock mode, units, etc.) |
| `daily_logs` | Manual daily entries (weight, water, notes) |
| `profile` | Your profile baseline |
| `workouts` | Workout sessions |
| `nutrition_entries` | Per-meal nutrition logs |
| `training_profile` | Training profile settings |
| `workout_plans` | Workout plans |
| `exercise_library` | Custom exercise definitions |
| `workout_templates` | Workout templates |

---

## Importing

1. Go to **Settings → Backup & Restore**.
2. Click **Choose Backup File** and select your `.json` backup.
3. A preview shows:
   - Export date
   - App version the backup was created with
   - Record counts per store
4. Choose an **import mode**:

| Mode | What happens |
|---|---|
| **Merge** | Adds records from the backup that don't exist locally. Existing records are kept. Safe to run on a partially-populated database. |
| **Replace all** | Clears every store first, then restores everything from the backup. Use when moving to a new device/browser. |

5. Confirm. A progress indicator shows which store is being processed.
6. On completion you'll see how many records were imported and how many were skipped (already existed).

---

## Recommended workflow — switching devices or browsers

1. On the old device/browser: **Export All Data** → save the file to iCloud Drive / Google Drive / email it to yourself.
2. On the new device/browser: open the app, go to **Backup & Restore**, **Choose Backup File** → select **Replace all** → confirm.
3. Verify a few workouts or logs to confirm the restore worked.

---

## Recommended workflow — before deploying

If you deploy to Cloudflare Pages (new domain), the IndexedDB data does **not** transfer automatically because it is scoped to `localhost:5173`.

1. Export a backup on `localhost:5173`.
2. Open the deployed URL.
3. Import with **Replace all**.

---

## Backup file format

```json
{
  "format": "shakthi-journal-backup",
  "version": "1",
  "appVersion": "0.4.0",
  "exportedAt": "2026-06-29T09:00:00.000Z",
  "dbVersion": 5,
  "stores": {
    "workouts": [ ... ],
    "health_metrics": [ ... ]
  },
  "summary": {
    "workouts": 42,
    "health_metrics": 3200
  }
}
```

The file is plain JSON — you can open it in any text editor to inspect or edit individual records before importing.
