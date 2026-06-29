/**
 * Real Apple Health XML parser.
 *
 * Parses the export.xml from the iPhone Health app:
 *   Health → Profile photo → Export All Health Data → unzip → export.xml
 *
 * Apple Health XML format:
 *   <Record type="HKQuantityTypeIdentifier..." sourceName="..." unit="..."
 *           startDate="YYYY-MM-DD HH:MM:SS ±HHMM" endDate="..." value="..."/>
 *   <Workout workoutActivityType="..." duration="..." durationUnit="min" .../>
 *   <Record type="HKCategoryTypeIdentifierSleepAnalysis"
 *           value="HKCategoryValueSleepAnalysisAsleepCore"
 *           startDate="..." endDate="..."/>
 */

import type { DailySnapshot } from '../types/health'
import type { ShakthiDB } from '../db'

export type DBMetric = ShakthiDB['health_metrics']['value']

// ─── HK type identifiers ──────────────────────────────────────────────────────

export const HK = {
  BODY_MASS:      'HKQuantityTypeIdentifierBodyMass',
  BODY_FAT:       'HKQuantityTypeIdentifierBodyFatPercentage',
  LEAN_BODY_MASS: 'HKQuantityTypeIdentifierLeanBodyMass',
  STEP_COUNT:     'HKQuantityTypeIdentifierStepCount',
  ACTIVE_ENERGY:  'HKQuantityTypeIdentifierActiveEnergyBurned',
  BASAL_ENERGY:   'HKQuantityTypeIdentifierBasalEnergyBurned',
  RESTING_HR:     'HKQuantityTypeIdentifierRestingHeartRate',
  HRV_SDNN:       'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  SLEEP:          'HKCategoryTypeIdentifierSleepAnalysis',
  HEART_RATE:     'HKQuantityTypeIdentifierHeartRate',
  VO2_MAX:        'HKQuantityTypeIdentifierVO2Max',
} as const

// Human-readable labels for record types
export const HK_LABELS: Record<string, string> = {
  [HK.BODY_MASS]:      'Weight',
  [HK.BODY_FAT]:       'Body Fat %',
  [HK.LEAN_BODY_MASS]: 'Lean Body Mass',
  [HK.STEP_COUNT]:     'Step Count',
  [HK.ACTIVE_ENERGY]:  'Active Calories',
  [HK.BASAL_ENERGY]:   'Resting Calories',
  [HK.RESTING_HR]:     'Resting Heart Rate',
  [HK.HRV_SDNN]:       'HRV (SDNN)',
  [HK.SLEEP]:          'Sleep Analysis',
  [HK.HEART_RATE]:     'Heart Rate',
  [HK.VO2_MAX]:        'VO2 Max',
}

const SUPPORTED_TYPES: Set<string> = new Set(Object.values(HK))

// Sleep values that count as "asleep" (not in-bed, not awake)
const SLEEP_ASLEEP = new Set([
  'HKCategoryValueSleepAnalysisAsleep',           // legacy combined value
  'HKCategoryValueSleepAnalysisAsleepUnspecified',
  'HKCategoryValueSleepAnalysisAsleepCore',       // light sleep
  'HKCategoryValueSleepAnalysisAsleepDeep',       // deep sleep
  'HKCategoryValueSleepAnalysisAsleepREM',        // REM sleep
])

const WORKOUT_LABELS: Record<string, string> = {
  HKWorkoutActivityTypeRunning:                      'Running',
  HKWorkoutActivityTypeWalking:                      'Walking',
  HKWorkoutActivityTypeCycling:                      'Cycling',
  HKWorkoutActivityTypeTraditionalStrengthTraining:  'Strength Training',
  HKWorkoutActivityTypeFunctionalStrengthTraining:   'Functional Strength',
  HKWorkoutActivityTypeHighIntensityIntervalTraining: 'HIIT',
  HKWorkoutActivityTypeYoga:                         'Yoga',
  HKWorkoutActivityTypeSwimming:                     'Swimming',
  HKWorkoutActivityTypeElliptical:                   'Elliptical',
  HKWorkoutActivityTypeCoreTraining:                 'Core Training',
}

// ─── Source normalisation ─────────────────────────────────────────────────────

/** Map Apple Health sourceName strings to our provider IDs */
export function normalizeSourceId(sourceName: string): string {
  const s = sourceName.toLowerCase()
  if (s.includes('watch'))        return 'apple_watch'
  if (s.includes('renpho'))       return 'renpho'
  if (s.includes('ringconn'))     return 'ringconn'
  if (s.includes('myfitnesspal')) return 'myfitnesspal'
  if (s.includes('strava'))       return 'strava'
  return 'apple_health'
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/**
 * Extract YYYY-MM-DD from Apple Health date string without timezone conversion.
 * "2024-01-15 08:30:00 -0700" → "2024-01-15"
 */
export function hkDate(s: string): string {
  return s.slice(0, 10)
}

/**
 * Parse Apple Health date string to millisecond timestamp.
 * "2024-01-15 08:30:00 -0700" → milliseconds since epoch
 *
 * Apple Health format has a SPACE before the timezone offset, which is not
 * valid ISO 8601. We must replace the whole pattern at once.
 */
export function hkTimestamp(s: string): number {
  // "2024-01-15 08:30:00 -0700" → "2024-01-15T08:30:00-07:00"
  const iso = s.replace(
    /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/,
    '$1T$2$3:$4',
  )
  return new Date(iso).getTime()
}

// ─── Unit conversion helpers ──────────────────────────────────────────────────

function toKg(value: number, unit: string): number {
  if (unit === 'lb') return +(value / 2.20462).toFixed(2)
  return +value.toFixed(2)
}

function toPercent(value: number, unit: string): number {
  // Apple Health stores body fat as a decimal (0.172) or percent (17.2%)
  if (unit === '%') return +value.toFixed(1)
  if (value <= 1.0) return +(value * 100).toFixed(1)  // decimal → percent
  return +value.toFixed(1)
}

function toMs(value: number, unit: string): number {
  if (unit === 'ms') return Math.round(value)
  if (unit === 's')  return Math.round(value * 1000)
  return Math.round(value)
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface SampleRow {
  label: string
  date: string
  value: string
  source: string
}

export interface TypeStat {
  hkType: string
  label: string
  rawCount: number
  dailyCount: number
}

export interface ParsePreview {
  fileName: string
  fileSizeMB: number
  exportDate: string | null
  ownerName: string | null
  dateRange: { start: string; end: string } | null
  totalRawRecords: number
  totalWorkouts: number
  byType: TypeStat[]
  sampleRows: SampleRow[]
  warnings: string[]
  errors: string[]
  /** Ready-to-store records — written to IndexedDB on user confirmation */
  metrics: DBMetric[]
  /** Pre-built daily snapshots for dashboard preview */
  snapshots: DailySnapshot[]
}

// ─── Accumulators ─────────────────────────────────────────────────────────────

interface DayAcc {
  // sum fields
  steps: number
  activeCalories: number
  basalCalories: number
  // latest-value fields (stored as {value, ts})
  weight?: { v: number; ts: number; src: string }
  bodyFat?: { v: number; ts: number; src: string }
  leanMass?: { v: number; ts: number; src: string }
  restingHR?: { v: number; ts: number; src: string }
  hrvSamples: number[]
  hrSamples: number[]
  // sleep duration in ms
  sleepMs: number
}

function emptyAcc(): DayAcc {
  return { steps: 0, activeCalories: 0, basalCalories: 0, hrvSamples: [], hrSamples: [], sleepMs: 0 }
}

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parse an Apple Health export.xml file.
 * Returns a preview (stats + sample rows) AND the ready-to-store metric records.
 *
 * Large files (50MB+) will block the main thread for a few seconds during
 * DOMParser.parseFromString(). This is unavoidable without a Web Worker.
 * Show a loading indicator before calling this function.
 */
export async function parseAppleHealthFile(
  file: File,
  onStage?: (stage: string) => void
): Promise<ParsePreview> {
  const warnings: string[] = []
  const errors: string[] = []

  // ── Read file ──────────────────────────────────────────────────────────────
  onStage?.('Reading file…')
  const text = await file.text()

  if (file.size > 200 * 1024 * 1024) {
    warnings.push(`Large file (${(file.size / 1024 / 1024).toFixed(0)} MB) — parsing may take 30+ seconds.`)
  }

  // ── Parse XML ─────────────────────────────────────────────────────────────
  onStage?.('Parsing XML… (this may take up to 30 seconds for large exports)')

  // Yield to let loading state render before the synchronous DOMParser call
  await new Promise(r => setTimeout(r, 80))

  const parser = new DOMParser()
  const doc = parser.parseFromString(text, 'text/xml')

  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    const msg = parseError.textContent?.slice(0, 200) ?? 'Unknown XML parse error'
    throw new Error(`XML parse error: ${msg}`)
  }

  // ── Extract metadata ──────────────────────────────────────────────────────
  onStage?.('Extracting records…')

  const exportDateAttr = doc.querySelector('ExportDate')?.getAttribute('value') ?? null
  const meEl = doc.querySelector('Me')
  let ownerName: string | null = null
  if (meEl) {
    const dob = meEl.getAttribute('HKCharacteristicTypeIdentifierDateOfBirth')
    if (dob) ownerName = null // Apple doesn't include name in the export
  }

  // ── Process Record elements ───────────────────────────────────────────────
  const recordEls = doc.querySelectorAll('Record')
  const workoutEls = doc.querySelectorAll('Workout')

  // Per-type raw counts and per-day accumulators
  const rawCounts: Record<string, number> = {}
  const dayMap = new Map<string, DayAcc>()  // key = YYYY-MM-DD
  const sourcesUsed = new Set<string>()

  // For sample rows (up to 3 per supported type)
  const sampleMap: Record<string, SampleRow[]> = {}

  let minDate = '9999-12-31'
  let maxDate = '0000-01-01'

  for (const el of recordEls) {
    const type  = el.getAttribute('type') ?? ''
    const value = el.getAttribute('value') ?? ''
    const unit  = el.getAttribute('unit') ?? ''
    const start = el.getAttribute('startDate') ?? ''
    const end   = el.getAttribute('endDate') ?? ''
    const src   = el.getAttribute('sourceName') ?? 'Apple Health'

    if (!SUPPORTED_TYPES.has(type)) continue

    rawCounts[type] = (rawCounts[type] ?? 0) + 1
    sourcesUsed.add(src)

    const date = hkDate(start)
    if (date < minDate) minDate = date
    if (date > maxDate) maxDate = date

    if (!dayMap.has(date)) dayMap.set(date, emptyAcc())
    const acc = dayMap.get(date)!

    // ── Handle sleep separately (uses end date as "night") ─────────────────
    if (type === HK.SLEEP) {
      if (SLEEP_ASLEEP.has(value)) {
        const sleepDate = hkDate(end)  // assign to wake-up date
        if (!dayMap.has(sleepDate)) dayMap.set(sleepDate, emptyAcc())
        const startMs = hkTimestamp(start)
        const endMs   = hkTimestamp(end)
        const durationMs = endMs - startMs
        if (durationMs > 0 && durationMs < 14 * 60 * 60 * 1000) {  // sanity: < 14h
          dayMap.get(sleepDate)!.sleepMs += durationMs
        }
      }
      addSample(sampleMap, type, {
        label: 'Sleep',
        date,
        value: value.replace('HKCategoryValueSleepAnalysis', '').replace('Asleep', 'Asleep·'),
        source: src,
      })
      continue
    }

    const numVal = parseFloat(value)
    if (isNaN(numVal)) continue

    const ts = hkTimestamp(start)

    switch (type) {
      case HK.BODY_MASS: {
        const kg = toKg(numVal, unit)
        if (!acc.weight || ts > acc.weight.ts) acc.weight = { v: kg, ts, src }
        addSample(sampleMap, type, { label: 'Weight', date, value: `${numVal} ${unit}`, source: src })
        break
      }
      case HK.BODY_FAT: {
        const pct = toPercent(numVal, unit)
        if (!acc.bodyFat || ts > acc.bodyFat.ts) acc.bodyFat = { v: pct, ts, src }
        addSample(sampleMap, type, { label: 'Body Fat', date, value: `${pct}%`, source: src })
        break
      }
      case HK.LEAN_BODY_MASS: {
        const kg = toKg(numVal, unit)
        if (!acc.leanMass || ts > acc.leanMass.ts) acc.leanMass = { v: kg, ts, src }
        addSample(sampleMap, type, { label: 'Lean Body Mass', date, value: `${numVal} ${unit}`, source: src })
        break
      }
      case HK.STEP_COUNT: {
        acc.steps += Math.round(numVal)
        if ((rawCounts[type] ?? 0) <= 3) {
          addSample(sampleMap, type, { label: 'Steps', date, value: `${Math.round(numVal).toLocaleString()} steps`, source: src })
        }
        break
      }
      case HK.ACTIVE_ENERGY: {
        acc.activeCalories += numVal
        break
      }
      case HK.BASAL_ENERGY: {
        acc.basalCalories += numVal
        break
      }
      case HK.RESTING_HR: {
        if (!acc.restingHR || ts > acc.restingHR.ts) acc.restingHR = { v: Math.round(numVal), ts, src }
        addSample(sampleMap, type, { label: 'Resting HR', date, value: `${Math.round(numVal)} bpm`, source: src })
        break
      }
      case HK.HRV_SDNN: {
        acc.hrvSamples.push(toMs(numVal, unit))
        addSample(sampleMap, type, { label: 'HRV', date, value: `${toMs(numVal, unit)} ms`, source: src })
        break
      }
      case HK.HEART_RATE: {
        acc.hrSamples.push(Math.round(numVal))
        break
      }
    }
  }

  // ── Process Workouts ──────────────────────────────────────────────────────
  const workoutMetrics: DBMetric[] = []
  for (const el of workoutEls) {
    const actType  = el.getAttribute('workoutActivityType') ?? ''
    const start    = el.getAttribute('startDate') ?? ''
    const duration = parseFloat(el.getAttribute('duration') ?? '0')
    const durUnit  = el.getAttribute('durationUnit') ?? 'min'
    const energy   = parseFloat(el.getAttribute('totalEnergyBurned') ?? '0')
    const dist     = parseFloat(el.getAttribute('totalDistance') ?? '0')
    const distUnit = el.getAttribute('totalDistanceUnit') ?? ''
    const src      = el.getAttribute('sourceName') ?? 'Apple Health'

    if (!start) continue

    const date     = hkDate(start)
    const durationMin = durUnit === 'min' ? duration : duration / 60
    const label    = WORKOUT_LABELS[actType] ?? actType.replace('HKWorkoutActivityType', '')
    const distM    = distUnit === 'mi' ? dist * 1609.34 : distUnit === 'km' ? dist * 1000 : dist

    const id = `workout_${hkTimestamp(start)}`
    workoutMetrics.push({
      id,
      date,
      type: 'workout',
      value: `${label}|${Math.round(durationMin)}|${Math.round(energy)}|${Math.round(distM)}`,
      unit: 'min|kcal|m',
      sourceId: normalizeSourceId(src),
      sourceName: src,
      dataMode: 'imported',
      importedAt: new Date().toISOString(),
    })
  }

  // ── Build daily DBMetrics ─────────────────────────────────────────────────
  onStage?.('Building daily summaries…')

  const now = new Date().toISOString()
  const metrics: DBMetric[] = []
  const snapshots: DailySnapshot[] = []

  for (const [date, acc] of dayMap.entries()) {
    const snap: DailySnapshot = { date }

    // Weight
    if (acc.weight) {
      snap.weight = acc.weight.v
      metrics.push(metric('weight', date, acc.weight.v, 'kg', acc.weight.src, now))
    }
    // Body fat
    if (acc.bodyFat) {
      snap.bodyFatPct = acc.bodyFat.v
      metrics.push(metric('bodyFatPct', date, acc.bodyFat.v, '%', acc.bodyFat.src, now))
    }
    // Lean body mass → used as muscleMassKg proxy
    if (acc.leanMass) {
      snap.muscleMassKg = acc.leanMass.v
      metrics.push(metric('leanBodyMass', date, acc.leanMass.v, 'kg', acc.leanMass.src, now))
    }
    // Steps
    if (acc.steps > 0) {
      snap.steps = acc.steps
      metrics.push(metric('steps', date, acc.steps, 'steps', 'apple_watch', now))
    }
    // Active calories
    if (acc.activeCalories > 0) {
      snap.activeCalories = Math.round(acc.activeCalories)
      metrics.push(metric('activeCalories', date, Math.round(acc.activeCalories), 'kcal', 'apple_watch', now))
    }
    // Resting HR
    if (acc.restingHR) {
      snap.restingHeartRate = acc.restingHR.v
      metrics.push(metric('restingHeartRate', date, acc.restingHR.v, 'bpm', acc.restingHR.src, now))
    }
    // HRV — average of all readings for the day
    if (acc.hrvSamples.length > 0) {
      const avg = Math.round(acc.hrvSamples.reduce((a, b) => a + b, 0) / acc.hrvSamples.length)
      snap.hrv = avg
      metrics.push(metric('hrv', date, avg, 'ms', 'apple_watch', now))
    }
    // Sleep — convert ms to hours, round to 1 decimal
    if (acc.sleepMs > 0) {
      const hours = +(acc.sleepMs / 3_600_000).toFixed(1)
      if (hours >= 1 && hours <= 14) {  // sanity range
        snap.sleepHours = hours
        metrics.push(metric('sleepHours', date, hours, 'h', 'ringconn', now))
      }
    }

    snapshots.push(snap)
  }

  // Sort snapshots newest first
  snapshots.sort((a, b) => b.date.localeCompare(a.date))

  // ── Daily counts ──────────────────────────────────────────────────────────
  const dailyCounts: Record<string, number> = {}
  for (const m of metrics) {
    dailyCounts[m.type] = (dailyCounts[m.type] ?? 0) + 1
  }

  const byType: TypeStat[] = Object.entries(rawCounts)
    .filter(([type]) => SUPPORTED_TYPES.has(type))
    .sort((a, b) => b[1] - a[1])
    .map(([hkType, rawCount]) => ({
      hkType,
      label: HK_LABELS[hkType] ?? hkType,
      rawCount,
      dailyCount: dailyCounts[hkToMetricType(hkType)] ?? 0,
    }))

  // ── Compile sample rows ───────────────────────────────────────────────────
  const sampleRows: SampleRow[] = Object.values(sampleMap).flat().slice(0, 20)

  return {
    fileName: file.name,
    fileSizeMB: +(file.size / 1024 / 1024).toFixed(1),
    exportDate: exportDateAttr,
    ownerName,
    dateRange: minDate !== '9999-12-31' ? { start: minDate, end: maxDate } : null,
    totalRawRecords: Object.values(rawCounts).reduce((a, b) => a + b, 0),
    totalWorkouts: workoutEls.length,
    byType,
    sampleRows,
    warnings,
    errors,
    metrics: [...metrics, ...workoutMetrics],
    snapshots,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function metric(
  type: string,
  date: string,
  value: number,
  unit: string,
  sourceId: string,
  importedAt: string,
): DBMetric {
  return {
    id: `${type}_${date}`,
    date,
    type,
    value,
    unit,
    sourceId: normalizeSourceId(sourceId),
    sourceName: sourceId,
    dataMode: 'imported',
    importedAt,
  }
}

function addSample(
  map: Record<string, SampleRow[]>,
  type: string,
  row: SampleRow,
): void {
  if (!map[type]) map[type] = []
  if (map[type].length < 3) map[type].push(row)
}

function hkToMetricType(hkType: string): string {
  const m: Record<string, string> = {
    [HK.BODY_MASS]:      'weight',
    [HK.BODY_FAT]:       'bodyFatPct',
    [HK.LEAN_BODY_MASS]: 'leanBodyMass',
    [HK.STEP_COUNT]:     'steps',
    [HK.ACTIVE_ENERGY]:  'activeCalories',
    [HK.RESTING_HR]:     'restingHeartRate',
    [HK.HRV_SDNN]:       'hrv',
    [HK.SLEEP]:          'sleepHours',
  }
  return m[hkType] ?? hkType
}
