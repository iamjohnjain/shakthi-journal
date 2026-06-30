/**
 * /dev/sync-test — developer-only page for diagnosing cross-device sync.
 * Not linked from navigation. Access via direct URL.
 */

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, CheckCircle, XCircle, AlertCircle, Clock, Trash2, Dumbbell, Apple, Download, Zap } from 'lucide-react'
import { getDB, getSetting } from '../db'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useSync, syncStatusLabel } from '../hooks/useSync'
import { syncEngine } from '../db/syncEngine'
import { saveWorkout } from '../db/workoutStore'
import { addNutritionEntry } from '../db/nutritionStore'
import './SyncTestPage.css'

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

interface StoreCounts {
  store: string
  table: string
  local: number
  cloud: number | null  // null = not checked or not configured
}

interface QueueStats {
  pending: number
  failed: number
  total: number
  lastError?: string
}

interface PageState {
  loading: boolean
  lastRefreshed: string | null
  lastSyncAt: string | null
  storeCounts: StoreCounts[]
  queue: QueueStats
  actionLog: string[]
}

function StatusDot({ ok, warn }: { ok: boolean; warn?: boolean }) {
  const color = ok ? 'var(--green)' : warn ? 'var(--yellow)' : 'var(--red)'
  const Icon  = ok ? CheckCircle : warn ? AlertCircle : XCircle
  return <Icon size={13} style={{ color, flexShrink: 0 }} />
}

function Row({ label, value, ok, warn, mono }: {
  label: string; value: string; ok?: boolean; warn?: boolean; mono?: boolean
}) {
  return (
    <div className="st-row">
      <span className="st-label">{label}</span>
      <span className={`st-value ${mono ? 'mono' : ''}`} style={{
        color: ok === true ? 'var(--green)' : ok === false ? 'var(--red)' : warn ? 'var(--yellow)' : undefined,
      }}>
        {ok !== undefined && <StatusDot ok={ok} warn={warn} />}
        {value}
      </span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="st-section">
      <h2 className="st-section-title">{title}</h2>
      <div className="st-section-body">{children}</div>
    </div>
  )
}

export default function SyncTestPage() {
  const { mode: authMode, user } = useAuth()
  const { status: syncStatus } = useSync()

  const [state, setState] = useState<PageState>({
    loading: true,
    lastRefreshed: null,
    lastSyncAt: null,
    storeCounts: [],
    queue: { pending: 0, failed: 0, total: 0 },
    actionLog: [],
  })
  const [actionBusy, setActionBusy] = useState(false)

  const log = useCallback((msg: string) => {
    setState(s => ({ ...s, actionLog: [`[${new Date().toLocaleTimeString()}] ${msg}`, ...s.actionLog].slice(0, 50) }))
  }, [])

  const refresh = useCallback(async () => {
    setState(s => ({ ...s, loading: true }))
    try {
      const db = await getDB()
      const lastSyncAt = await getSetting<string | null>('lastSyncAt', null)

      // Local counts
      const localCounts = await Promise.all(
        Object.keys(STORE_TABLE_MAP).map(async store => {
          const count = await db.count(store as Parameters<typeof db.count>[0]).catch(() => 0)
          return { store, count }
        })
      )

      // Cloud counts (only if configured and authenticated)
      const cloudCounts: Record<string, number | null> = {}
      if (isSupabaseConfigured && supabase && user?.id) {
        await Promise.all(
          Object.entries(STORE_TABLE_MAP).map(async ([store, table]) => {
            try {
              const { count } = await supabase!
                .from(table)
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.id)
              cloudCounts[store] = count ?? 0
            } catch {
              cloudCounts[store] = null
            }
          })
        )
      }

      // Queue stats
      const queueAll = user?.id
        ? await db.getAllFromIndex('sync_queue', 'by-user', user.id)
        : []
      const failed  = queueAll.filter(e => e.attempts >= 5).length
      const pending = queueAll.filter(e => e.attempts < 5).length
      const lastError = queueAll.find(e => e.lastError)?.lastError

      setState(s => ({
        ...s,
        loading: false,
        lastRefreshed: new Date().toLocaleTimeString(),
        lastSyncAt,
        storeCounts: Object.keys(STORE_TABLE_MAP).map(store => {
          const local = localCounts.find(l => l.store === store)?.count ?? 0
          const cloud = cloudCounts[store] ?? null
          return { store, table: STORE_TABLE_MAP[store], local, cloud }
        }),
        queue: { pending, failed, total: queueAll.length, lastError },
      }))
    } catch (e) {
      log(`Refresh error: ${e}`)
      setState(s => ({ ...s, loading: false }))
    }
  }, [user?.id, log])

  useEffect(() => { void refresh() }, [refresh])

  // ── Action handlers ──────────────────────────────────────────────────────────

  async function createTestWorkout() {
    setActionBusy(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const w = await saveWorkout({
        date: today,
        type: 'lifting',
        title: `Sync Test ${new Date().toLocaleTimeString()}`,
        durationMin: 30,
        notes: 'Created by sync-test page',
        exercises: [],
      })
      log(`Created workout: ${w.id}`)
      await refresh()
    } catch (e) {
      log(`Create workout error: ${e}`)
    }
    setActionBusy(false)
  }

  async function createTestNutrition() {
    setActionBusy(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const e = await addNutritionEntry({
        date: today,
        mealType: 'snack',
        food: `Sync Test ${new Date().toLocaleTimeString()}`,
        calories: 100,
        proteinG: 10,
        carbsG: 10,
        fatG: 3,
        quantity: '1 serving',
      })
      log(`Created nutrition entry: ${e.id}`)
      await refresh()
    } catch (e) {
      log(`Create nutrition error: ${e}`)
    }
    setActionBusy(false)
  }

  async function forceSync() {
    setActionBusy(true)
    log('Force sync started…')
    try {
      await syncEngine.syncNow()
      log('Force sync complete')
      await refresh()
    } catch (e) {
      log(`Force sync error: ${e}`)
    }
    setActionBusy(false)
  }

  async function pullFromCloud() {
    if (!user?.id) { log('Not signed in'); return }
    setActionBusy(true)
    log('Pulling from cloud…')
    try {
      const { downloaded, errors } = await syncEngine.downloadAll(user.id)
      log(`Pull complete: ${downloaded} records downloaded, ${errors.length} errors`)
      if (errors.length) log(`Errors: ${errors.join('; ')}`)
      await refresh()
    } catch (e) {
      log(`Pull error: ${e}`)
    }
    setActionBusy(false)
  }

  async function clearTestData() {
    setActionBusy(true)
    log('Clearing test data…')
    try {
      const db = await getDB()
      const workouts = await db.getAll('workouts')
      const testWorkouts = workouts.filter(w => w.notes === 'Created by sync-test page')
      await Promise.all(testWorkouts.map(w => db.delete('workouts', w.id)))
      log(`Cleared ${testWorkouts.length} test workout(s)`)
      await refresh()
    } catch (e) {
      log(`Clear error: ${e}`)
    }
    setActionBusy(false)
  }

  const { storeCounts, queue, lastSyncAt, lastRefreshed, loading, actionLog } = state

  return (
    <div className="st-page">
      <header className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Sync Diagnostics</h1>
          <p className="page-subtitle">Developer tool — not visible to normal users</p>
        </div>
        <button className="btn-refresh" onClick={refresh} disabled={loading}>
          <RefreshCw size={13} className={loading ? 'spin' : ''} />
          {lastRefreshed ? `Updated ${lastRefreshed}` : 'Refresh'}
        </button>
      </header>

      {/* ── Auth / Sync state ── */}
      <Section title="Auth & Sync State">
        <Row label="Auth mode"    value={authMode}                              ok={authMode === 'authenticated'} />
        <Row label="User ID"      value={user?.id ?? 'none'}                    mono />
        <Row label="Email"        value={user?.email ?? 'guest'}                />
        <Row label="Supabase"     value={isSupabaseConfigured ? 'Configured' : 'Not configured'} ok={isSupabaseConfigured} />
        <Row label="Sync status"  value={syncStatusLabel(syncStatus)}            ok={syncStatus.type === 'synced'} warn={syncStatus.type === 'needs_attention'} />
        <Row label="Last sync"    value={lastSyncAt ? new Date(lastSyncAt).toLocaleString() : 'Never'} ok={!!lastSyncAt} />
      </Section>

      {/* ── Queue ── */}
      <Section title="Sync Queue">
        <Row label="Total entries"   value={String(queue.total)}   />
        <Row label="Pending"         value={String(queue.pending)} ok={queue.pending === 0} />
        <Row label="Permanently failed (≥5 attempts)" value={String(queue.failed)} ok={queue.failed === 0} warn={queue.failed > 0} />
        {queue.lastError && <Row label="Last error" value={queue.lastError} ok={false} mono />}
      </Section>

      {/* ── Record counts ── */}
      <Section title="Local vs Cloud Record Counts">
        {!isSupabaseConfigured && (
          <p className="st-notice">Supabase not configured — cloud counts unavailable.</p>
        )}
        {!user?.id && isSupabaseConfigured && (
          <p className="st-notice">Sign in to see cloud counts.</p>
        )}
        <div className="st-counts-header">
          <span className="st-label">Store</span>
          <span className="st-count-col">Local</span>
          <span className="st-count-col">Cloud</span>
          <span className="st-count-col">Match</span>
        </div>
        {storeCounts.map(({ store, local, cloud }) => {
          const match = cloud === null ? null : local === cloud
          return (
            <div key={store} className="st-counts-row">
              <span className="st-label mono">{store}</span>
              <span className="st-count-col">{local}</span>
              <span className="st-count-col">{cloud === null ? '–' : cloud}</span>
              <span className="st-count-col">
                {match === null ? '–' : match
                  ? <CheckCircle size={12} style={{ color: 'var(--green)' }} />
                  : <AlertCircle size={12} style={{ color: 'var(--yellow)' }} />}
              </span>
            </div>
          )
        })}
      </Section>

      {/* ── Actions ── */}
      <Section title="Test Actions">
        <div className="st-actions">
          <button className="btn btn-secondary" onClick={createTestWorkout} disabled={actionBusy}>
            <Dumbbell size={13} /> Create Test Workout
          </button>
          <button className="btn btn-secondary" onClick={createTestNutrition} disabled={actionBusy}>
            <Apple size={13} /> Create Test Nutrition Entry
          </button>
          <button className="btn btn-primary" onClick={forceSync} disabled={actionBusy || !user?.id}>
            <Zap size={13} /> Force Sync Now
          </button>
          <button className="btn btn-secondary" onClick={pullFromCloud} disabled={actionBusy || !user?.id}>
            <Download size={13} /> Pull from Cloud
          </button>
          <button className="btn btn-danger" onClick={clearTestData} disabled={actionBusy}>
            <Trash2 size={13} /> Clear Test Data
          </button>
        </div>
      </Section>

      {/* ── Action log ── */}
      {actionLog.length > 0 && (
        <Section title="Action Log">
          <div className="st-log">
            {actionLog.map((line, i) => (
              <div key={i} className="st-log-line mono">{line}</div>
            ))}
          </div>
        </Section>
      )}

      {/* ── How to use ── */}
      <Section title="Cross-Device Test Guide">
        <ol className="st-guide">
          <li>Sign in on both devices with the same account.</li>
          <li>On Device A, tap <strong>Create Test Workout</strong>. The queue pending count should briefly show 1.</li>
          <li>Wait ~5 seconds, then tap <strong>Force Sync</strong> on Device A.</li>
          <li>On Device B, tap <strong>Force Sync</strong> (or wait 30 seconds for auto-pull).</li>
          <li>Tap <strong>Refresh</strong> on Device B — local and cloud workout counts should match.</li>
          <li>When done, tap <strong>Clear Test Data</strong> on Device A.</li>
        </ol>
        <p className="st-notice">
          <Clock size={11} /> The sync engine pulls cloud changes every 30 seconds automatically.
          Force sync drains the queue immediately.
        </p>
      </Section>
    </div>
  )
}
