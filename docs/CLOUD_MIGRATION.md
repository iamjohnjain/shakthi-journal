# Future Cloud Migration Path

This document explains how Shakthi Journal will eventually support cloud sync — and how no local data will be lost in the transition.

**Current state:** Local-first. All data in IndexedDB. No accounts. No cloud.

**Future state:** Optional cloud sync with a user account, backed by a hosted database. Local IndexedDB remains the primary source of truth while offline.

---

## Why local-first is the right starting point

1. **No infrastructure to maintain** — no database bills, no auth servers, no API latency.
2. **Privacy by default** — health data never leaves the device unless you explicitly choose cloud sync.
3. **Works offline** — the app functions fully without an internet connection.
4. **Fast** — IndexedDB reads are synchronous-fast; no network round-trips.
5. **Simple** — the entire data model lives in one place (the browser).

Local-first is not a compromise. It's the correct default for a personal health app.

---

## What cloud sync adds

| Feature | Local-only | With cloud sync |
|---|---|---|
| Access from any device | ❌ (Backup & Restore) | ✅ Auto-sync |
| Share with family | ❌ | ✅ (future) |
| Automatic backup | ❌ (manual export) | ✅ Continuous |
| Data survives clearing browser | ❌ | ✅ |
| Works offline | ✅ | ✅ (with sync on reconnect) |

---

## Planned migration architecture

### Option A — Supabase (recommended)

[Supabase](https://supabase.com) provides a hosted Postgres database + Auth + realtime sync on a generous free tier.

**Why Supabase:**
- Free up to 500 MB database, 50,000 MAU
- Row-level security — each user's data is isolated at the database level
- Auth supports email/password, Google, Apple Sign-In
- Realtime subscriptions for cross-device sync
- TypeScript SDK compatible with the existing idb patterns

**Schema mapping:**

Each IndexedDB store maps directly to a Postgres table:

| IndexedDB store | Postgres table | Primary key |
|---|---|---|
| `workouts` | `workouts` | `id` (uuid) |
| `nutrition_entries` | `nutrition_entries` | `id` (uuid) |
| `health_metrics` | `health_metrics` | `type_date` (text) |
| `daily_logs` | `daily_logs` | `date` (text) |
| `profile` | `profiles` | `user_id` |
| `settings` | `user_settings` | `key` |
| etc. | etc. | |

Every row has a `user_id` column enforced by row-level security.

### Option B — Custom API

A lightweight Node.js or Deno API in front of a database. More control, more maintenance.

### Recommended: Supabase.

---

## Migration strategy — zero data loss

This is the critical constraint: **no one loses their local data when cloud sync is introduced.**

### Phase A — Introduce accounts (no sync yet)

1. Add Supabase Auth (email/password + Google).
2. `profile.user_id` is set to the Supabase user UUID on first sign-in.
3. Local data is still the primary source. Cloud is empty.
4. Users who don't sign in notice no difference.

### Phase B — Initial upload

1. Add a "Sync to cloud" button in Settings.
2. On first sync: export all IndexedDB stores → upload to Supabase → mark records as `synced: true`.
3. The Backup & Restore JSON export is literally the upload payload — same format.
4. Conflict resolution: local wins on first upload (server is empty).

### Phase C — Continuous sync

1. Every write to IndexedDB also writes to Supabase (with retry queue for offline).
2. On app load: pull any changes from Supabase made on other devices since last sync.
3. Conflict resolution policy: last-write-wins by `updatedAt` timestamp.

### Phase D — Multi-device

1. User opens app on a second device.
2. Signs in → app pulls all cloud records → populates local IndexedDB.
3. Both devices now sync continuously.

---

## Backup & Restore as the migration bridge

The existing Backup & Restore system (`docs/BACKUP_RESTORE.md`) is the fallback for every migration scenario:

| Scenario | Solution |
|---|---|
| Moving to a new device before cloud sync exists | Export → Import on new device |
| Moving to cloud and starting fresh | Export → Sign in → Upload (Phase B) |
| Reverting from cloud to local-only | Export from cloud → Import to local |
| Migrating between Supabase projects | Export → Import |

The JSON backup format is stable and version-tagged. Future migrations can include a converter if the schema changes.

---

## What does NOT change

- The IndexedDB stores remain the primary read path — cloud sync writes to both simultaneously.
- The data model (`WorkoutSession`, `DailyLog`, etc.) does not change.
- Existing backups remain importable.
- The app continues to work fully offline.
- No data is deleted from local storage when cloud sync is enabled.
- Users who choose not to create an account see no change.

---

## Implementation estimate

| Phase | Effort | Complexity |
|---|---|---|
| A — Auth | 1–2 days | Low |
| B — Initial upload | 2–3 days | Medium |
| C — Continuous sync | 3–5 days | Medium-high (offline queue) |
| D — Multi-device | Included in C | — |

Total: ~1–2 sprints. The local-first architecture makes this straightforward — the hard work is already done.

---

## Decision trigger

Start cloud migration when at least one of these is true:

- [ ] Multiple devices needed in daily use
- [ ] Sharing data with a family member or coach
- [ ] Consistent frustration with manual Backup & Restore
- [ ] Desire to not lose data if the iPhone is lost

Until then, local-first with regular exports is the right choice.
