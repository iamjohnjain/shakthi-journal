import { Cloud, CloudOff, RefreshCw, CloudCheck, WifiOff, AlertTriangle, HardDrive } from 'lucide-react'
import { useSync, syncStatusLabel } from '../hooks/useSync'
import type { SyncStatus } from '../hooks/useSync'
import './SyncStatus.css'

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

  return (
    <button
      className={`sync-row sync-row--${status.type}`}
      onClick={syncNow}
      title={titleFor(status, label)}
      disabled={isDisabled(status)}
    >
      <SyncIcon status={status} size={14} />
      <span className="sync-row-label">{label}</span>
      {status.type === 'synced' && (
        <span className="sync-row-action">Tap to sync now</span>
      )}
      {status.type === 'needs_attention' && (
        <span className="sync-row-action sync-row-action--warn">Retry</span>
      )}
    </button>
  )
}
