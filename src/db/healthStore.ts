import { getDB } from './index'
import type { ShakthiDB } from './index'
import type { DailySnapshot } from '../types/health'

type DBMetric = ShakthiDB['health_metrics']['value']

// ─── Write ────────────────────────────────────────────────────────────────────

/** Batch-write metrics to IndexedDB. Overwrites existing records with same id. */
export async function storeMetrics(records: DBMetric[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('health_metrics', 'readwrite')
  await Promise.all([
    ...records.map(r => tx.store.put(r)),
    tx.done,
  ])
}

/** Delete all imported (non-mock) health metrics. Returns number deleted. */
export async function clearImportedMetrics(): Promise<number> {
  const db = await getDB()
  const all = await db.getAll('health_metrics')
  const toDelete = all.filter(m => m.dataMode === 'imported' || m.dataMode === 'live')
  const tx = db.transaction('health_metrics', 'readwrite')
  await Promise.all([
    ...toDelete.map(m => tx.store.delete(m.id)),
    tx.done,
  ])
  return toDelete.length
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/** True if any imported/live metrics exist in the DB. */
export async function hasImportedData(): Promise<boolean> {
  const db = await getDB()
  const all = await db.getAll('health_metrics')
  return all.some(m => m.dataMode === 'imported' || m.dataMode === 'live')
}

/** Count imported metrics. */
export async function importedMetricCount(): Promise<number> {
  const db = await getDB()
  const all = await db.getAll('health_metrics')
  return all.filter(m => m.dataMode === 'imported' || m.dataMode === 'live').length
}

/** Return the N most recent DailySnapshots built from imported data. */
export async function getLatestSnapshots(days = 7): Promise<DailySnapshot[]> {
  const db = await getDB()
  const all = await db.getAll('health_metrics')
  if (all.length === 0) return []

  // Only include non-mock records
  const real = all.filter(m => m.dataMode !== 'mock')
  if (real.length === 0) return []

  // Get unique dates, newest first
  const dates = [...new Set(real.map(m => m.date))].sort().reverse().slice(0, days)

  return dates.map(date => buildSnapshot(date, real.filter(m => m.date === date)))
}

/** Get all unique dates that have real (non-mock) data, newest first. */
export async function getImportedDates(): Promise<string[]> {
  const db = await getDB()
  const all = await db.getAll('health_metrics')
  const real = all.filter(m => m.dataMode !== 'mock')
  return [...new Set(real.map(m => m.date))].sort().reverse()
}

/** Return a single DailySnapshot for an exact date from imported data, or null if no data. */
export async function getSnapshotForDate(date: string): Promise<DailySnapshot | null> {
  const db = await getDB()
  const all = await db.getAll('health_metrics')
  const real = all.filter(m => m.date === date && m.dataMode !== 'mock')
  if (real.length === 0) return null
  return buildSnapshot(date, real)
}

/** Get source IDs that contributed real data. */
export async function getImportedSources(): Promise<string[]> {
  const db = await getDB()
  const all = await db.getAll('health_metrics')
  const real = all.filter(m => m.dataMode !== 'mock')
  return [...new Set(real.map(m => m.sourceId))]
}

/** Returns the most recent weight metric across ALL stored records, regardless of date range. */
export async function getLatestWeightRecord(): Promise<{
  valueKg: number
  date: string
  sourceId: string
  sourceName: string
} | null> {
  const db = await getDB()
  const all = await db.getAll('health_metrics')
  const weights = all
    .filter(m => m.type === 'weight' && m.dataMode !== 'mock')
    .sort((a, b) => b.date.localeCompare(a.date))
  if (weights.length === 0) return null
  const w = weights[0]
  return { valueKg: Number(w.value), date: w.date, sourceId: w.sourceId, sourceName: w.sourceName }
}

/** Returns the most recent sleep metric across ALL stored records, regardless of date range. */
export async function getLatestSleepRecord(): Promise<{
  valueH: number
  date: string
  sourceId: string
  sourceName: string
} | null> {
  const db = await getDB()
  const all = await db.getAll('health_metrics')
  const records = all
    .filter(m => m.type === 'sleepHours' && m.dataMode !== 'mock')
    .sort((a, b) => b.date.localeCompare(a.date))
  if (records.length === 0) return null
  const r = records[0]
  return { valueH: Number(r.value), date: r.date, sourceId: r.sourceId, sourceName: r.sourceName }
}

/** Returns the most recent body fat metric across ALL stored records, regardless of date range. */
export async function getLatestBodyFatRecord(): Promise<{
  valuePct: number
  date: string
  sourceId: string
  sourceName: string
} | null> {
  const db = await getDB()
  const all = await db.getAll('health_metrics')
  const records = all
    .filter(m => m.type === 'bodyFatPct' && m.dataMode !== 'mock')
    .sort((a, b) => b.date.localeCompare(a.date))
  if (records.length === 0) return null
  const r = records[0]
  return { valuePct: Number(r.value), date: r.date, sourceId: r.sourceId, sourceName: r.sourceName }
}

// ─── Health diagnostics ───────────────────────────────────────────────────────

export interface HealthDiagnosticEntry {
  typeId: string
  displayName: string
  recordCount: number
  latestDate: string | null
  daysAgo: number | null
}

const DIAGNOSTIC_TYPES: Array<{ typeId: string; displayName: string }> = [
  { typeId: 'weight',           displayName: 'Weight' },
  { typeId: 'bodyFatPct',       displayName: 'Body Fat %' },
  { typeId: 'leanBodyMass',     displayName: 'Lean Body Mass' },
  { typeId: 'steps',            displayName: 'Steps' },
  { typeId: 'activeCalories',   displayName: 'Active Calories' },
  { typeId: 'restingHeartRate', displayName: 'Resting Heart Rate' },
  { typeId: 'hrv',              displayName: 'HRV' },
  { typeId: 'spO2',             displayName: 'Blood Oxygen (SpO2)' },
  { typeId: 'respiratoryRate',  displayName: 'Respiratory Rate' },
  { typeId: 'sleepHours',       displayName: 'Sleep' },
]

/** Per-type health data freshness report, reading from IndexedDB (non-mock only). */
export async function getHealthDiagnostics(): Promise<HealthDiagnosticEntry[]> {
  const db = await getDB()
  const all = await db.getAll('health_metrics')
  const real = all.filter(m => m.dataMode !== 'mock')
  const today = new Date().toISOString().slice(0, 10)

  return DIAGNOSTIC_TYPES.map(({ typeId, displayName }) => {
    const records = real.filter(m => m.type === typeId)
    const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date))
    const latestDate = sorted[0]?.date ?? null
    let daysAgo: number | null = null
    if (latestDate) {
      const diff = new Date(today).getTime() - new Date(latestDate).getTime()
      daysAgo = Math.floor(diff / (1000 * 60 * 60 * 24))
    }
    return { typeId, displayName, recordCount: records.length, latestDate, daysAgo }
  })
}

// ─── Build snapshot ───────────────────────────────────────────────────────────

export function buildSnapshot(date: string, metrics: DBMetric[]): DailySnapshot {
  const get = (type: string) => metrics.find(m => m.type === type)

  const weight         = get('weight')
  const bodyFatPct     = get('bodyFatPct')
  const leanBodyMass   = get('leanBodyMass')
  const steps          = get('steps')
  const activeCal      = get('activeCalories')
  const restingHR      = get('restingHeartRate')
  const hrv            = get('hrv')
  const spO2           = get('spO2')
  const respiratoryRt  = get('respiratoryRate')
  const sleep          = get('sleepHours')
  const protein        = get('protein')
  const caloriesIn     = get('caloriesIn')
  const water          = get('water')

  return {
    date,
    weight:           weight        ? Number(weight.value)        : undefined,
    bodyFatPct:       bodyFatPct    ? Number(bodyFatPct.value)    : undefined,
    muscleMassKg:     leanBodyMass  ? Number(leanBodyMass.value)  : undefined,
    steps:            steps         ? Number(steps.value)         : undefined,
    activeCalories:   activeCal     ? Number(activeCal.value)     : undefined,
    restingHeartRate: restingHR     ? Number(restingHR.value)     : undefined,
    hrv:              hrv           ? Number(hrv.value)           : undefined,
    spO2:             spO2          ? Number(spO2.value)          : undefined,
    respiratoryRate:  respiratoryRt ? Number(respiratoryRt.value) : undefined,
    sleepHours:       sleep         ? Number(sleep.value)         : undefined,
    proteinG:         protein       ? Number(protein.value)       : undefined,
    caloriesIn:       caloriesIn    ? Number(caloriesIn.value)    : undefined,
    waterMl:          water         ? Number(water.value)         : undefined,
  }
}
