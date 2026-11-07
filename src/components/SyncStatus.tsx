import { useState, useEffect } from 'react'
import { Cloud, CloudOff, RefreshCw, CloudCheck, WifiOff, AlertTriangle, HardDrive, X } from 'lucide-react'
import { useSync, syncStatusLabel } from '../hooks/useSync'
import type { SyncStatus } from '../hooks/useSync'
import { syncEngine } from '../db/syncEngine'
import type { SyncQueueEntry } from '../db'
import './SyncStatus.css'

const STORE_LABELS: Record<string, string> = {
  workouts:           'Workouts',
  nutrition_entries:  'Meal entries',
  daily_logs:         'Daily logs',
  health_metrics:     'Health data',
  profile:            'Profile',
  settings:           'Settings',
  training_profile:   'Training profile',
  workout_plans:      'Workout plans',
  exercise_library:   'Exercise library',
  workout_templates:  'Workout templates',
  sync_history:       'Sync history',
}

function SyncIcon({ status, size = 12 }: { status: SyncStatus; size?: number }) {
  switch (status.type) {
    case 'syncing':          return <RefreshCw size={size} className="sync-icon sync-icon--spin" />
    case 'synced':           return <CloudCheck size={size} className="sync-icon sync-icon--ok" />
    case 'offline':          return <WifiOff size={size} className="sync-icon sync-icon--offline" />
    case 'error':            return <CloudOff size={size} className="sync-icon sync-icon--error" />
    case 'needs_attention':  return <AlertTriangle size={size} className="sync-icon sync-icon--warn" />
    case 'local_only':       return <HardDrive size={size} className="sync-icon sync-icon--muted" />
    case 'unauthenticated':  return <Cloud size={size} className="sync-icon sync-icon--muted" />
    default:                 return <Cloud size={size} className="sync-icon sync-icon--muted" />
  }
}

function titleFor(s: SyncStatus, label: string): string {
  if (s.type === 'error' && 'message' in s) return s.message
  if (s.type === 'needs_attention') return `${s.failed} sync entries failed permanently. Tap to retry.`
  return label
}

function isDisabled(s: SyncStatus): boolean {
  return s.type === 'syncing' || s.type === 'unauthenticated' || s.type === 'local_only'
}

/** Compact pill used in the sidebar (desktop). */
export default function SyncStatusPill() {
  const { status, syncNow } = useSync()
  const label = syncStatusLabel(status)

  return (
    <button
      className={`sync-status sync-status--${status.type}`}
      onClick={syncNow}
      title={titleFor(status, label)}
      disabled={isDisabled(status)}
    >
      <SyncIcon status={status} />
      <span className="sync-status-label">{label}</span>
    </button>
  )
}

/** Inline row used in Settings / Profile (mobile-friendly). */
export function SyncStatusRow() {
  const { status, syncNow } = useSync()
  const label = syncStatusLabel(status)
  const [showDetails, setShowDetails] = useState(false)

  return (
    <>
      <button
        className={`sync-row sync-row--${status.type}`}
        onClick={() => { if (status.type === 'needs_attention') setShowDetails(s => !s); else syncNow() }}
        title={titleFor(status, label)}
        disabled={isDisabled(status)}
      >
        <SyncIcon status={status} size={14} />
        <span className="sync-row-label">{label}</span>
        {status.type === 'synced' && (
          <span className="sync-row-action">Tap to sync now</span>
        )}
        {status.type === 'needs_attention' && (
          <span className="sync-row-action sync-row-action--warn">{showDetails ? 'Hide' : 'Details'}</span>
        )}
      </button>
      {status.type === 'needs_attention' && showDetails && (
        <FailedSyncDetails onRetryAll={syncNow} />
      )}
    </>
  )
}

function friendlyStoreLabel(store: string): string {
  return STORE_LABELS[store] ?? store
}

/** Supabase/network errors are technical — translate the common ones so the
    user can tell "this will clear up on its own" from "this needs action". */
function friendlyError(raw: string | undefined): string {
  if (!raw) return 'Unknown error'
  const m = raw.toLowerCase()
  if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('load failed')) {
    return 'No network connection at the time — will retry automatically'
  }
  if (m.includes('jwt') || m.includes('401') || m.includes('unauthorized') || m.includes('permission denied') || m.includes('row-level security')) {
    return 'Not authorized to write this record — try signing out and back in'
  }
  if (m.includes('duplicate key') || m.includes('conflict')) {
    return 'Conflicts with a record already in the cloud'
  }
  if (m.includes('timeout')) {
    return 'The request timed out — will retry automatically'
  }
  return raw
}

function FailedSyncDetails({ onRetryAll }: { onRetryAll: () => void }) {
  const [entries, setEntries] = useState<SyncQueueEntry[] | null>(null)

  useEffect(() => {
    syncEngine.getFailedEntryDetails().then(setEntries)
  }, [])

  async function discard(id: string) {
    await syncEngine.discardFailedEntry(id)
    setEntries(prev => prev?.filter(e => e.id !== id) ?? null)
  }

  if (entries === null) return <div className="sync-details-loading">Loading…</div>
  if (entries.length === 0) return null

  return (
    <div className="sync-details">
      {entries.map(e => (
        <div key={e.id} className="sync-details-row">
          <div className="sync-details-main">
            <span className="sync-details-store">{friendlyStoreLabel(e.store)}</span>
            <span className="sync-details-reason">{friendlyError(e.lastError)}</span>
          </div>
          <button className="sync-details-discard" onClick={() => discard(e.id)} aria-label="Discard this entry">
            <X size={13} />
          </button>
        </div>
      ))}
      <button className="sync-details-retry-all" onClick={onRetryAll}>Retry all</button>
    </div>
  )
}
