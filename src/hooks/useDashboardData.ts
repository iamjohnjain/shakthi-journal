import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { getSnapshotForDate, getImportedSources, getLatestWeightRecord, getLatestBodyFatRecord, getLatestSleepRecord } from '../db/healthStore'
import { getLog } from '../db/logStore'
import { mockDailySnapshots } from '../data/mock'
import type { DailySnapshot } from '../types/health'
import type { DailyLog } from '../db/logStore'

export type DataSource = 'mock' | 'imported' | 'manual' | 'merged'

export interface LatestWeightInfo {
  valueKg: number
  date: string
  sourceId: string
  sourceName: string
}

export interface LatestBodyFatInfo {
  valuePct: number
  date: string
  sourceId: string
  sourceName: string
}

export interface LatestSleepInfo {
  valueH: number
  date: string
  sourceId: string
  sourceName: string
}

interface DashboardData {
  /** The snapshot for the requested date — never silently backfilled from an
      older date, so anything labeled "Today" is only ever actually today's. */
  today: DailySnapshot
  yesterday: DailySnapshot
  dataSource: DataSource
  nutritionSource: 'mock' | 'manual' | 'imported'
  hasNutritionLog: boolean
  sources: string[]
  /** Most recent weight/body-fat/sleep on record, each with its own date —
      for UI that wants to show a dated "last known" value explicitly rather
      than pretending it's current. */
  latestWeight: LatestWeightInfo | null
  latestBodyFat: LatestBodyFatInfo | null
  latestSleep: LatestSleepInfo | null
  loading: boolean
  refresh: () => void
  /** The date this hook actually loaded — equals todayStr() unless a past date was requested. */
  date: string
  isToday: boolean
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function offsetDate(dateStr: string, deltaDays: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + deltaDays)
  return d.toISOString().split('T')[0]
}

function mergeLogIntoSnapshot(snap: DailySnapshot, log: DailyLog | null): DailySnapshot {
  if (!log) return snap
  return {
    ...snap,
    weight:           log.weightKg         ?? snap.weight,
    caloriesIn:       log.caloriesIn        ?? snap.caloriesIn,
    proteinG:         log.proteinG          ?? snap.proteinG,
    carbsG:           log.carbsG            ?? snap.carbsG,
    fatG:             log.fatG              ?? snap.fatG,
    waterMl:          log.waterMl           ?? snap.waterMl,
    // Self-reportable without any wearable — fills the gap for phone-only users.
    sleepHours:       log.sleepHours        ?? snap.sleepHours,
    restingHeartRate: log.restingHeartRate  ?? snap.restingHeartRate,
  }
}

function logHasNutrition(log: DailyLog | null): boolean {
  if (!log) return false
  return !!(log.caloriesIn || log.proteinG || log.carbsG || log.fatG || log.waterMl)
}

/**
 * @param targetDate Defaults to today. Pass a past 'YYYY-MM-DD' to look back
 * at that day's dashboard instead — used by the Dashboard's history nav.
 */
export function useDashboardData(targetDate?: string): DashboardData {
  const { mockMode } = useApp()
  const date = targetDate ?? todayStr()
  const prevDate = offsetDate(date, -1)
  const isToday = date === todayStr()

  const [snapshot,     setSnapshot]     = useState<DailySnapshot | null>(null)
  const [prevSnapshot, setPrevSnapshot] = useState<DailySnapshot | null>(null)
  const [dayLog,       setDayLog]       = useState<DailyLog | null>(null)
  const [prevLog,      setPrevLog]      = useState<DailyLog | null>(null)
  const [sources,      setSources]      = useState<string[]>([])
  const [latestWeightInfo,   setLatestWeightInfo]   = useState<LatestWeightInfo | null>(null)
  const [latestBodyFatInfo,  setLatestBodyFatInfo]  = useState<LatestBodyFatInfo | null>(null)
  const [latestSleepInfo,    setLatestSleepInfo]    = useState<LatestSleepInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    async function load() {
      try {
        const [snap, prevSnap, srcs, dayL, prevL, latestWt, latestBf, latestSl] = await Promise.all([
          getSnapshotForDate(date),
          getSnapshotForDate(prevDate),
          getImportedSources(),
          getLog(date),
          getLog(prevDate),
          getLatestWeightRecord(),
          getLatestBodyFatRecord(),
          getLatestSleepRecord(),
        ])
        if (!cancelled) {
          setSnapshot(snap)
          setPrevSnapshot(prevSnap)
          setSources(srcs)
          setDayLog(dayL)
          setPrevLog(prevL)
          setLatestWeightInfo(latestWt)
          setLatestBodyFatInfo(latestBf)
          setLatestSleepInfo(latestSl)
          setLoading(false)
        }
      } catch {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [date, prevDate, tick])

  useEffect(() => {
    function onDataCleared() { setTick(t => t + 1) }
    window.addEventListener('health-data-cleared', onDataCleared)
    return () => window.removeEventListener('health-data-cleared', onDataCleared)
  }, [])

  // After native HealthKit sync, the iOS layer injects records into IndexedDB
  // and fires this event. Re-read so the dashboard updates without a reload.
  useEffect(() => {
    function onNativeSync() { setTick(t => t + 1) }
    window.addEventListener('native-health-sync-complete', onNativeSync)
    return () => window.removeEventListener('native-health-sync-complete', onNativeSync)
  }, [])

  // Fired by saveLog() — covers inline saves (e.g. the dashboard's quick
  // weight modal) that don't navigate away and back, so there'd otherwise
  // be no natural refetch.
  useEffect(() => {
    function onLogUpdated() { setTick(t => t + 1) }
    window.addEventListener('daily-log-updated', onLogUpdated)
    return () => window.removeEventListener('daily-log-updated', onLogUpdated)
  }, [])

  const hasAH  = snapshot !== null
  const hasLog = dayLog !== null

  // Developer mock mode: show synthetic data (only toggled from DevDiagnostics)
  if (mockMode) {
    return {
      today:           mockDailySnapshots[0],
      yesterday:       mockDailySnapshots[1],
      dataSource:      'mock',
      nutritionSource: 'mock',
      hasNutritionLog: false,
      sources:         [],
      latestWeight:    null,
      latestBodyFat:   null,
      latestSleep:     null,
      loading,
      refresh:         () => setTick(t => t + 1),
      date, isToday,
    }
  }

  // No real data for this date — return an empty snapshot so the UI shows empty states
  // rather than inventing a day that never happened.
  if (!hasAH && !hasLog) {
    return {
      today:           { date } as DailySnapshot,
      yesterday:       { date: prevDate } as DailySnapshot,
      dataSource:      'mock',
      nutritionSource: 'mock',
      hasNutritionLog: false,
      sources:         [],
      latestWeight:    latestWeightInfo,
      latestBodyFat:   latestBodyFatInfo,
      latestSleep:     latestSleepInfo,
      loading,
      refresh:         () => setTick(t => t + 1),
      date, isToday,
    }
  }

  const baseToday     = snapshot     ?? ({ date } as DailySnapshot)
  const baseYesterday = prevSnapshot ?? ({ date: prevDate } as DailySnapshot)

  const mergedToday     = mergeLogIntoSnapshot(baseToday, dayLog)
  const mergedYesterday = mergeLogIntoSnapshot(baseYesterday, prevLog)

  const dataSource: DataSource = hasAH && hasLog ? 'merged' : hasAH ? 'imported' : 'manual'
  const nutritionLogged = logHasNutrition(dayLog)

  return {
    today:           mergedToday,
    yesterday:       mergedYesterday,
    dataSource,
    nutritionSource: nutritionLogged ? 'manual' : hasAH ? 'imported' : 'mock',
    hasNutritionLog: nutritionLogged,
    sources:         sources,
    latestWeight:    latestWeightInfo,
    latestBodyFat:   latestBodyFatInfo,
    latestSleep:     latestSleepInfo,
    loading,
    refresh:         () => setTick(t => t + 1),
    date, isToday,
  }
}
