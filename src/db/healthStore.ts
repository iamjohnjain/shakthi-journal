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

// ─── Build snapshot ───────────────────────────────────────────────────────────

export function buildSnapshot(date: string, metrics: DBMetric[]): DailySnapshot {
  const get = (type: string) => metrics.find(m => m.type === type)

  const weight       = get('weight')
  const bodyFatPct   = get('bodyFatPct')
  const leanBodyMass = get('leanBodyMass')
  const steps        = get('steps')
  const activeCal    = get('activeCalories')
  const restingHR    = get('restingHeartRate')
  const hrv          = get('hrv')
  const sleep        = get('sleepHours')
  const protein      = get('protein')
  const caloriesIn   = get('caloriesIn')
  const water        = get('water')

  return {
    date,
    weight:           weight       ? Number(weight.value)       : undefined,
    bodyFatPct:       bodyFatPct   ? Number(bodyFatPct.value)   : undefined,
    muscleMassKg:     leanBodyMass ? Number(leanBodyMass.value) : undefined,
    steps:            steps        ? Number(steps.value)        : undefined,
    activeCalories:   activeCal    ? Number(activeCal.value)    : undefined,
    restingHeartRate: restingHR    ? Number(restingHR.value)    : undefined,
    hrv:              hrv          ? Number(hrv.value)          : undefined,
    sleepHours:       sleep        ? Number(sleep.value)        : undefined,
    proteinG:         protein      ? Number(protein.value)      : undefined,
    caloriesIn:       caloriesIn   ? Number(caloriesIn.value)   : undefined,
    waterMl:          water        ? Number(water.value)        : undefined,
  }
}
