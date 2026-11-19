import { useEffect, useState } from 'react'
import { getSyncHistory } from '../db'

/** The timestamp of the most recent HealthKit sync, kept live. Covers two
    sources: a returning user who's completed an Apple Health XML import
    before (the only writer of sync_history, read once on mount), and a
    real-time native sync — the native iOS layer injects HealthKit data
    directly into IndexedDB and fires `native-health-sync-complete` when
    done (same event useDashboardData.ts listens for), never touching
    sync_history at all, so that path only ever shows up live here. */
export function useLastSynced() {
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)

  useEffect(() => {
    getSyncHistory(1).then(h => setLastSyncedAt(h[0]?.completedAt ?? null))
  }, [])

  useEffect(() => {
    function onNativeSync() { setLastSyncedAt(new Date().toISOString()) }
    window.addEventListener('native-health-sync-complete', onNativeSync)
    return () => window.removeEventListener('native-health-sync-complete', onNativeSync)
  }, [])

  return lastSyncedAt
}
