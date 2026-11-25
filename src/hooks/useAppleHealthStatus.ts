import { useEffect, useState } from 'react'
import { getSetting, getSyncHistory } from '../db'
import { getImportedSources } from '../db/healthStore'
import { isInsideNativeApp } from '../layout/BottomNav'

/** Saved by Layout every time a native HealthKit sync finishes, so "last
    synced" survives a relaunch (native syncs never write sync_history). */
export const APPLE_HEALTH_LAST_SYNC_KEY = 'apple-health.lastSyncedAt'

export interface AppleHealthStatus {
  inNativeApp: boolean
  connected: boolean
  lastSyncedAt: string | null
  loading: boolean
}

/** One source of truth for "is Apple Health connected?" — every other
    device (Watch, scale, ring, other apps) arrives through Apple Health,
    so this is the only connection the app tracks. Connected = Apple Health
    data has reached this app at least once (a native sync, or an XML
    import on the web). */
export function useAppleHealthStatus(): AppleHealthStatus {
  const inNativeApp = isInsideNativeApp()
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [hasData, setHasData] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    function load() {
      Promise.all([
        getSetting<string | null>(APPLE_HEALTH_LAST_SYNC_KEY, null),
        getSyncHistory(1),
        getImportedSources(),
      ]).then(([saved, history, sources]) => {
        if (!alive) return
        const fromHistory = history[0]?.completedAt ?? null
        const newest = [saved, fromHistory].filter(Boolean).sort().pop() ?? null
        setLastSyncedAt(newest)
        setHasData(sources.length > 0)
        setLoading(false)
      }).catch(() => alive && setLoading(false))
    }
    load()
    function onSync() { setLastSyncedAt(new Date().toISOString()); setHasData(true) }
    window.addEventListener('native-health-sync-complete', onSync)
    window.addEventListener('health-data-cleared', load)
    return () => {
      alive = false
      window.removeEventListener('native-health-sync-complete', onSync)
      window.removeEventListener('health-data-cleared', load)
    }
  }, [])

  return { inNativeApp, connected: lastSyncedAt != null || hasData, lastSyncedAt, loading }
}

export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'Yesterday' : `${days} days ago`
}
