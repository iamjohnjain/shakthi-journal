import { getDB, getSetting, setSetting } from './index'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { getPending, markSuccess, markFailure, clearQueueForUser } from './syncQueue'

// ─── Types ────────────────────────────────────────────────────────────────────

export type SyncStatus =
  | { type: 'idle' }
  | { type: 'syncing'; detail?: string }
  | { type: 'synced'; at: number }
  | { type: 'offline' }
  | { type: 'error'; message: string }
  | { type: 'unauthenticated' }

// Maps every IndexedDB store to its Supabase table name
const STORE_TABLE_MAP: Record<string, string> = {
  workouts:           'workouts',
  nutrition_entries:  'nutrition_entries',
  daily_logs:         'daily_logs',
  health_metrics:     'health_metrics',
  profile:            'profiles',
  settings:           'user_settings',
  training_profile:   'training_profiles',
  workout_plans:      'workout_plans',
  exercise_library:   'exercise_library',
  workout_templates:  'workout_templates',
  sync_history:       'sync_history_cloud',
}

// Stores that use (user_id) as the only PK (single row per user)
const SINGLETON_STORES = new Set(['profile', 'training_profile'])

// ─── Sync Engine ──────────────────────────────────────────────────────────────

type StatusListener = (s: SyncStatus) => void

class SyncEngine {
  private _status: SyncStatus = { type: 'unauthenticated' }
  private _listeners: Set<StatusListener> = new Set()
  private _userId: string | null = null
  private _timer: ReturnType<typeof setInterval> | null = null
  private _draining = false

  // ── Public API ──────────────────────────────────────────────────────────────

  setUser(userId: string | null): void {
    this._userId = userId
    if (!userId) {
      this._setStatus({ type: 'unauthenticated' })
      this._stop()
      return
    }
    this._start()
  }

  getStatus(): SyncStatus {
    return this._status
  }

  subscribe(cb: StatusListener): () => void {
    this._listeners.add(cb)
    return () => this._listeners.delete(cb)
  }

  async syncNow(): Promise<void> {
    if (!this._userId || !isSupabaseConfigured) return
    await this._runSync()
  }

  // ── Bulk operations (merge dialog) ──────────────────────────────────────────

  /** Upload every local record to Supabase (initial sync or "replace cloud with local") */
  async uploadAll(userId: string): Promise<{ uploaded: number; errors: string[] }> {
    if (!supabase) return { uploaded: 0, errors: ['Supabase not configured'] }
    let uploaded = 0
    const errors: string[] = []

    this._setStatus({ type: 'syncing', detail: 'Uploading…' })

    for (const [store, table] of Object.entries(STORE_TABLE_MAP)) {
      try {
        const db = await getDB()
        const records = await db.getAll(store as Parameters<typeof db.getAll>[0])
        if (records.length === 0) continue

        this._setStatus({ type: 'syncing', detail: `Uploading ${store}…` })

        const rows = records.map(r => this._toCloudRow(store, r, userId))
        const { error } = await supabase.from(table).upsert(rows)
        if (error) {
          errors.push(`${store}: ${error.message}`)
        } else {
          uploaded += records.length
        }
      } catch (e) {
        errors.push(`${store}: ${e}`)
      }
    }

    await setSetting('lastSyncAt', new Date().toISOString())
    this._setStatus(errors.length > 0
      ? { type: 'error', message: `${errors.length} store(s) failed` }
      : { type: 'synced', at: Date.now() })

    return { uploaded, errors }
  }

  /** Download all cloud records for user → write to local IndexedDB */
  async downloadAll(userId: string): Promise<{ downloaded: number; errors: string[] }> {
    if (!supabase) return { downloaded: 0, errors: ['Supabase not configured'] }
    let downloaded = 0
    const errors: string[] = []

    this._setStatus({ type: 'syncing', detail: 'Downloading…' })

    for (const [store, table] of Object.entries(STORE_TABLE_MAP)) {
      try {
        this._setStatus({ type: 'syncing', detail: `Downloading ${store}…` })

        const { data, error } = await supabase
          .from(table)
          .select('*')
          .eq('user_id', userId)

        if (error) {
          errors.push(`${store}: ${error.message}`)
          continue
        }
        if (!data || data.length === 0) continue

        const db = await getDB()
        await db.clear(store as Parameters<typeof db.getAll>[0])
        for (const row of data) {
          const local = row.data as Record<string, unknown>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await db.put(store as Parameters<typeof db.getAll>[0], local as any)
          downloaded++
        }
      } catch (e) {
        errors.push(`${store}: ${e}`)
      }
    }

    await setSetting('lastSyncAt', new Date().toISOString())
    this._setStatus(errors.length > 0
      ? { type: 'error', message: `${errors.length} store(s) failed` }
      : { type: 'synced', at: Date.now() })

    return { downloaded, errors }
  }

  /** Merge: add cloud records that don't exist locally, keep local records */
  async mergeFromCloud(userId: string): Promise<{ merged: number; errors: string[] }> {
    if (!supabase) return { merged: 0, errors: ['Supabase not configured'] }
    let merged = 0
    const errors: string[] = []

    this._setStatus({ type: 'syncing', detail: 'Merging…' })

    for (const [store, table] of Object.entries(STORE_TABLE_MAP)) {
      try {
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .eq('user_id', userId)

        if (error || !data || data.length === 0) continue

        const db = await getDB()
        const localKeys = new Set(
          (await db.getAllKeys(store as Parameters<typeof db.getAll>[0])).map(String)
        )

        for (const row of data) {
          const local = row.data as Record<string, unknown>
          const key = String(local.id ?? local.date ?? local.key ?? '')
          if (!localKeys.has(key)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await db.put(store as Parameters<typeof db.getAll>[0], local as any)
            merged++
          }
        }
      } catch (e) {
        errors.push(`${store}: ${e}`)
      }
    }

    // After merge, upload all local data so cloud is complete
    await this.uploadAll(userId)

    this._setStatus({ type: 'synced', at: Date.now() })
    return { merged, errors }
  }

  // ── Internal ─────────────────────────────────────────────────────────────────

  private _start(): void {
    this._onlineHandler()
    window.addEventListener('online', this._onlineHandler)
    window.addEventListener('offline', this._offlineHandler)

    this._timer = setInterval(() => {
      if (navigator.onLine) void this._runSync()
    }, 30_000)
  }

  private _stop(): void {
    if (this._timer) clearInterval(this._timer)
    window.removeEventListener('online', this._onlineHandler)
    window.removeEventListener('offline', this._offlineHandler)
  }

  private _onlineHandler = (): void => {
    if (this._userId) void this._runSync()
  }

  private _offlineHandler = (): void => {
    this._setStatus({ type: 'offline' })
  }

  private async _runSync(): Promise<void> {
    if (this._draining || !this._userId || !supabase || !navigator.onLine) return
    this._draining = true
    this._setStatus({ type: 'syncing' })

    try {
      // 1. Drain queue (incremental writes since last sync)
      await this._drainQueue(this._userId)

      // 2. Pull cloud changes newer than last sync
      await this._pullChanges(this._userId)

      await setSetting('lastSyncAt', new Date().toISOString())
      this._setStatus({ type: 'synced', at: Date.now() })
    } catch (e) {
      this._setStatus({ type: 'error', message: String(e) })
    } finally {
      this._draining = false
    }
  }

  private async _drainQueue(userId: string): Promise<void> {
    if (!supabase) return
    const pending = await getPending(userId)
    for (const entry of pending) {
      const table = STORE_TABLE_MAP[entry.store]
      if (!table) { await markSuccess(entry.id); continue }

      try {
        if (entry.operation === 'delete') {
          const { error } = await supabase
            .from(table)
            .delete()
            .eq('user_id', userId)
            .eq('id', entry.recordId)
          if (error) throw error
        } else {
          const row = this._toCloudRow(entry.store, entry.data as Record<string, unknown>, userId)
          const { error } = await supabase.from(table).upsert(row)
          if (error) throw error
        }
        await markSuccess(entry.id)
      } catch (e) {
        await markFailure(entry.id, String(e))
      }
    }
  }

  private async _pullChanges(userId: string): Promise<void> {
    if (!supabase) return
    const lastSyncAt = await getSetting<string | null>('lastSyncAt', null)

    for (const [store, table] of Object.entries(STORE_TABLE_MAP)) {
      try {
        let query = supabase
          .from(table)
          .select('id, updated_at, data')
          .eq('user_id', userId)

        if (lastSyncAt) {
          query = query.gt('updated_at', lastSyncAt)
        }

        const { data, error } = await query
        if (error || !data || data.length === 0) continue

        const db = await getDB()
        for (const row of data) {
          const localRecord = row.data as Record<string, unknown>
          const localKey = localRecord.id ?? localRecord.date ?? localRecord.key

          // Conflict resolution: cloud wins only if cloud updated_at is newer
          const existingLocal = localKey
            ? await db.get(store as Parameters<typeof db.get>[0], String(localKey)).catch(() => null)
            : null

          if (existingLocal) {
            const localTs = (existingLocal as Record<string, unknown>).updatedAt as string | undefined
            const cloudTs = row.updated_at as string
            if (localTs && new Date(cloudTs) <= new Date(localTs)) continue
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await db.put(store as Parameters<typeof db.get>[0], localRecord as any)
        }
      } catch {
        // Non-fatal — continue with other stores
      }
    }
  }

  private _toCloudRow(store: string, record: unknown, userId: string): Record<string, unknown> {
    const r = record as Record<string, unknown>
    const updatedAt =
      (r.updatedAt as string | undefined) ??
      (r.importedAt as string | undefined) ??
      (r.createdAt as string | undefined) ??
      new Date().toISOString()

    if (SINGLETON_STORES.has(store)) {
      return { user_id: userId, updated_at: updatedAt, data: record }
    }

    const id = r.id ?? r.date ?? r.key ?? crypto.randomUUID()
    return { id, user_id: userId, updated_at: updatedAt, data: record }
  }

  private _setStatus(s: SyncStatus): void {
    this._status = s
    this._listeners.forEach(cb => cb(s))
  }
}

export const syncEngine = new SyncEngine()

// ── Clear queue helper (exposed for auth sign-out) ────────────────────────────

export { clearQueueForUser }
