# Sync Audit — Shakthi Journal
*Phase 16 — Sync Reliability*  
*Updated: 2026-06-29*

---

## Architecture Summary

**Storage model:** Local-first IndexedDB (idb v8) — data is always readable offline.  
**Cloud backend:** Supabase (Postgres + Row Level Security).  
**Sync model:** Queue-based incremental sync with 30-second pull interval.  
**Conflict resolution:** `updated_at` timestamp wins. Cloud changes only overwrite local if cloud record is newer.

---

## What Syncs Today

| Store (IndexedDB) | Supabase Table | Syncs | Direction | Notes |
|---|---|---|---|---|
| `workouts` | `workouts` | ✅ Yes | Both | After Phase 16: every save/update/delete queues immediately |
| `nutrition_entries` | `nutrition_entries` | ✅ Yes | Both | After Phase 16: every save/update/delete queues immediately |
| `daily_logs` | `daily_logs` | ✅ Yes | Both | After Phase 16: every save/delete queues immediately |
| `profile` | `profiles` | ✅ Yes | Both | After Phase 16: every save queues immediately |
| `health_metrics` | `health_metrics` | ✅ Full upload | Upload on merge | Apple Health imports are large (100k+ records). Not auto-queued per-record (too expensive). Uploaded in bulk on initial merge. |
| `settings` | `user_settings` | ✅ Full upload | Upload on merge | Per-key settings included in bulk upload. Not per-write queued. |
| `training_profile` | `training_profiles` | ✅ Full upload | Upload on merge | Singleton record. Not per-write queued. |
| `workout_plans` | `workout_plans` | ✅ Full upload | Upload on merge | Queue wiring not yet added to planStore. |
| `exercise_library` | `exercise_library` | ✅ Full upload | Upload on merge | Queue wiring not yet added. |
| `workout_templates` | `workout_templates` | ✅ Full upload | Upload on merge | Queue wiring not yet added. |
| `sync_history` | `sync_history_cloud` | ✅ Full upload | Upload on merge | Import audit log. |

---

## What Does NOT Sync (and Why)

| Item | Reason |
|---|---|
| Apple Health imported data (incremental) | Imports can be 100k+ records. Queuing each record would create massive queue. Use bulk uploadAll instead. |
| Settings per-key writes | Low value, high volume. Covered by bulk upload at sign-in. |
| Strava token (localStorage) | OAuth token — intentionally local only. Not a data record. |
| Mock data | Mock data is never stored in IndexedDB, never synced. |
| `sync_queue` itself | This is the local-only transport buffer. Never synced. |

---

## Sync Mechanism — Step by Step

### On every local write (workouts, nutrition, daily_logs, profile)
1. Store calls `syncEngine.queueWrite(store, 'upsert', id, data)`
2. If user is not signed in → no-op (guest mode)
3. If user is signed in → `enqueue()` writes to `sync_queue` IndexedDB store
4. `_scheduleSoon()` fires after 2-second debounce → calls `_runSync()`

### `_runSync()` (also fires every 30 seconds + on network reconnect)
1. **Drain queue** — reads `sync_queue` entries for current user with `< 5` attempts
2. For each entry → upsert or delete in Supabase via `STORE_TABLE_MAP` lookup
3. Success → `markSuccess()` deletes the queue entry
4. Failure → `markFailure()` increments attempts counter; retried next cycle
5. After 5 failures → entry stays in queue as `permanently failed`, triggers `needs_attention` state
6. **Pull changes** — queries each Supabase table for records with `updated_at > lastSyncAt`
7. For each cloud record: if local record exists and is newer → skip; otherwise write to IndexedDB
8. Updates `lastSyncAt` setting
9. Sets status → `synced` or `needs_attention`

### Initial sign-in with local data
- If local data exists and differs from cloud → **MergeDialog** shown to user
- User chooses: Merge (keep both), Replace Cloud (local wins), Replace Local (cloud wins)
- All choices call `uploadAll`/`downloadAll`/`mergeFromCloud` which do full bulk sync

### Offline behavior
- All writes go to IndexedDB immediately (app works fully offline)
- `sync_queue` accumulates entries
- When back online → `online` event fires → `_runSync()` drains queue and pulls

---

## Queue Failure Handling

| Scenario | Behavior |
|---|---|
| Temporary network error | Retry next cycle (up to 5 attempts) |
| Supabase table missing | Skipped (`STORE_TABLE_MAP` lookup fails gracefully) |
| Record too large | Will fail repeatedly → eventually `needs_attention` |
| 5 consecutive failures | Entry stays in queue, `needs_attention` status shown |
| Permanently failed entries | Visible in `/dev/sync-test` page, count shown in `SyncStatusRow` |

To manually clear failed queue entries: use "Pull from Cloud" on `/dev/sync-test` to re-download the canonical cloud state.

---

## Conflict Resolution Rules

**Winner:** `updated_at` timestamp (ISO 8601 string, compared with `new Date()`)

| Scenario | Resolution |
|---|---|
| Cloud record is newer than local | Cloud overwrites local |
| Local record is newer than cloud | Local is kept (cloud update skipped in `_pullChanges`) |
| Same timestamp | Local is kept (tie goes to local) |
| Record exists locally but not in cloud | Queued for upload (should go up within 2 seconds) |
| Record exists in cloud but not locally | Downloaded on next pull |
| Both sides deleted | Deletes always propagate via queue entries with `operation: 'delete'` |
| Silent conflict (same record, simultaneous edit) | Last-write wins by `updated_at`. No merge UI for simultaneous edits. |

**Conflicts are NOT logged** at the record level — only the Sync Diagnostics page shows queue stats. If you need conflict tracing, check Supabase logs.

---

## Sync Status States

| State | Meaning |
|---|---|
| `unauthenticated` | Supabase configured but not signed in |
| `local_only` | Supabase env vars not set — data is local forever until configured |
| `syncing` | Queue drain or pull in progress |
| `synced` | Last sync completed successfully. Shows relative time. |
| `offline` | Browser is offline |
| `error` | Last `_runSync` threw an exception |
| `needs_attention` | Sync succeeded but N queue entries have permanently failed (≥5 attempts) |

---

## What Still Needs Sync Wiring (Phase 17)

| Store | Why Not Yet |
|---|---|
| `workout_plans` | planStore.ts has write functions but no `queueWrite` calls yet |
| `exercise_library` | exerciseStore.ts exists but not written by user actions normally |
| `workout_templates` | templateStore.ts — add `queueWrite` when edit flow is built |
| `training_profile` | trainingStore.ts — singleton, add `queueWrite` to save function |
| `health_metrics` | Covered by bulk upload. Per-record queue would be 100k entries per import. |

---

## Can Backup/Restore Data Migrate to Cloud?

Yes. The backup format (`/settings/backup`) is a JSON snapshot of all IndexedDB stores. To migrate:
1. Restore backup to IndexedDB
2. Sign in (triggers MergeDialog)
3. Choose "Replace Cloud with Local"
4. `uploadAll()` uploads every restored record to Supabase

This is the manual migration path until a dedicated import-to-cloud flow is built.

---

## Row Level Security (Supabase)

All tables use `user_id` column. RLS policies (configured in Supabase dashboard) should enforce:
```sql
-- Example for workouts table
CREATE POLICY "Users can only access their own workouts"
ON workouts FOR ALL USING (auth.uid() = user_id);
```

If RLS is not configured, any authenticated user can read any row. RLS must be enabled per-table in Supabase dashboard.

---

## Beta Readiness

| Capability | Status |
|---|---|
| Incremental sync (workouts, nutrition, logs, profile) | ✅ Ready |
| First-sign-in merge dialog | ✅ Ready |
| Offline writes → queue → sync on reconnect | ✅ Ready |
| Pull-on-startup (auto-download recent cloud changes) | ✅ Ready (30s interval + online event) |
| Sync status visible to user | ✅ Sidebar (desktop), Settings page (mobile) |
| No silent data loss | ✅ Writes go to IndexedDB first, always |
| Conflict resolution | ✅ last-write-wins via updated_at |
| Developer diagnostics | ✅ /dev/sync-test |
| health_metrics cloud sync | ⚠️ Bulk only (upload at merge time) |
| workout_plans / templates sync | ⚠️ Bulk only |
| Background sync without browser open | ❌ Not possible on web — needs native app |
