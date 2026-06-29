import { useEffect, useState } from 'react'
import { syncEngine } from '../db/syncEngine'
import type { SyncStatus } from '../db/syncEngine'

export type { SyncStatus }

export function useSync() {
  const [status, setStatus] = useState<SyncStatus>(syncEngine.getStatus())

  useEffect(() => {
    return syncEngine.subscribe(setStatus)
  }, [])

  return {
    status,
    syncNow: () => syncEngine.syncNow(),
  }
}

export function syncStatusLabel(s: SyncStatus): string {
  switch (s.type) {
    case 'idle':            return 'Not synced'
    case 'syncing':         return s.detail ?? 'Syncing…'
    case 'synced':          return `Synced ${fmtRelative(s.at)}`
    case 'offline':         return 'Offline'
    case 'error':           return `Sync failed`
    case 'unauthenticated': return 'Sign in to sync'
  }
}

function fmtRelative(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000)
  if (secs < 5)   return 'just now'
  if (secs < 60)  return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60)  return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}
