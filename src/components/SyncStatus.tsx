import { Cloud, CloudOff, RefreshCw, CloudCheck, WifiOff } from 'lucide-react'
import { useSync, syncStatusLabel } from '../hooks/useSync'
import type { SyncStatus } from '../hooks/useSync'
import './SyncStatus.css'

function SyncIcon({ status }: { status: SyncStatus }) {
  switch (status.type) {
    case 'syncing':         return <RefreshCw size={12} className="sync-icon sync-icon--spin" />
    case 'synced':          return <CloudCheck size={12} className="sync-icon sync-icon--ok" />
    case 'offline':         return <WifiOff size={12} className="sync-icon sync-icon--offline" />
    case 'error':           return <CloudOff size={12} className="sync-icon sync-icon--error" />
    case 'unauthenticated': return <Cloud size={12} className="sync-icon sync-icon--muted" />
    default:                return <Cloud size={12} className="sync-icon sync-icon--muted" />
  }
}

export default function SyncStatus() {
  const { status, syncNow } = useSync()
  const label = syncStatusLabel(status)

  return (
    <button
      className={`sync-status sync-status--${status.type}`}
      onClick={syncNow}
      title={status.type === 'error' && 'message' in status ? status.message : label}
      disabled={status.type === 'syncing' || status.type === 'unauthenticated'}
    >
      <SyncIcon status={status} />
      <span className="sync-status-label">{label}</span>
    </button>
  )
}
