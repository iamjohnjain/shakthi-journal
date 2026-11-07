import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { getLatestSnapshots, getImportedSources, getLatestWeightRecord, getLatestBodyFatRecord, getLatestSleepRecord } from '../db/healthStore'
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
  today: DailySnapshot
  yesterday: DailySnapshot
  snapshots: DailySnapshot[]
  dataSource: DataSource
  nutritionSource: 'mock' | 'manual' | 'imported'
  hasNutritionLog: boolean
  sources: string[]
  latestWeight: LatestWeightInfo | null
  latestBodyFat: LatestBodyFatInfo | null
  latestSleep: LatestSleepInfo | null
  loading: boolean
  refresh: () => void
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function yesterdayStr() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
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

export function useDashboardData(): DashboardData {
  const { mockMode } = useApp()
  const [realSnapshots, setRealSnapshots] = useState<DailySnapshot[]>([])
  const [todayLog, setTodayLog] = useState<DailyLog | null>(null)
  const [yesterdayLog, setYesterdayLog] = useState<DailyLog | null>(null)
  const [sources, setSources] = useState<string[]>([])
  const [latestWeightInfo, setLatestWeightInfo] = useState<LatestWeightInfo | null>(null)
  const [latestBodyFatInfo, setLatestBodyFatInfo] = useState<LatestBodyFatInfo | null>(null)
  const [latestSleepInfo, setLatestSleepInfo] = useState<LatestSleepInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    async function load() {
      try {
        const [snaps, srcs, todayL, yestL, latestWt, latestBf, latestSl] = await Promise.all([
          getLatestSnapshots(7),
          getImportedSources(),
          getLog(todayStr()),
          getLog(yesterdayStr()),
          getLatestWeightRecord(),
          getLatestBodyFatRecord(),
          getLatestSleepRecord(),
        ])
        if (!cancelled) {
          setRealSnapshots(snaps)
          setSources(srcs)
          setTodayLog(todayL)
          setYesterdayLog(yestL)
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
  }, [tick])

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

  const hasAH  = realSnapshots.length > 0
  const hasLog = todayLog !== null

  // Developer mock mode: show synthetic data (only toggled from DevDiagnostics)
  if (mockMode) {
    return {
      today:           mockDailySnapshots[0],
      yesterday:       mockDailySnapshots[1],
      snapshots:       mockDailySnapshots,
      dataSource:      'mock',
      nutritionSource: 'mock',
      hasNutritionLog: false,
      sources:         [],
      latestWeight:    null,
      latestBodyFat:   null,
      latestSleep:     null,
      loading,
      refresh:         () => setTick(t => t + 1),
    }
  }

  // No real data yet — return empty snapshots so Dashboard shows empty states
  if (!hasAH && !hasLog) {
    return {
      today:           { date: todayStr() } as DailySnapshot,
      yesterday:       { date: yesterdayStr() } as DailySnapshot,
      snapshots:       [],
      dataSource:      'mock',
      nutritionSource: 'mock',
      hasNutritionLog: false,
      sources:         [],
      latestWeight:    null,
      latestBodyFat:   null,
      latestSleep:     null,
      loading,
      refresh:         () => setTick(t => t + 1),
    }
  }

  const baseToday     = hasAH ? realSnapshots[0] : { date: todayStr() }
  const baseYesterday = hasAH && realSnapshots.length > 1 ? realSnapshots[1] : { date: yesterdayStr() }

  const mergedToday     = mergeLogIntoSnapshot(baseToday, todayLog)
  const mergedYesterday = mergeLogIntoSnapshot(baseYesterday, yesterdayLog)

  const dataSource: DataSource = hasAH && hasLog ? 'merged' : hasAH ? 'imported' : 'manual'
  const nutritionLogged = logHasNutrition(todayLog)

  // Backfill composition + sleep when today's snapshot lacks them.
  // Weight/bodyFat: RENPHO measures weekly; sleepHours: RingConn writes to yesterday's wakeup date
  // if today's sync captured steps but not sleep yet.
  const withWeight: DailySnapshot = mergedToday.weight == null && latestWeightInfo
    ? { ...mergedToday, weight: latestWeightInfo.valueKg }
    : mergedToday
  const withBodyFat: DailySnapshot = withWeight.bodyFatPct == null && latestBodyFatInfo
    ? { ...withWeight, bodyFatPct: latestBodyFatInfo.valuePct }
    : withWeight
  const finalToday: DailySnapshot = withBodyFat.sleepHours == null && latestSleepInfo
    ? { ...withBodyFat, sleepHours: latestSleepInfo.valueH }
    : withBodyFat

  return {
    today:           finalToday,
    yesterday:       mergedYesterday,
    snapshots:       hasAH ? realSnapshots : [],
    dataSource,
    nutritionSource: nutritionLogged ? 'manual' : hasAH ? 'imported' : 'mock',
    hasNutritionLog: nutritionLogged,
    sources:         sources,
    latestWeight:    latestWeightInfo,
    latestBodyFat:   latestBodyFatInfo,
    latestSleep:     latestSleepInfo,
    loading,
    refresh:         () => setTick(t => t + 1),
  }
}
