/**
 * Tests for the real Apple Health XML parser.
 * Run with: npm test
 */

import { describe, it, expect } from 'vitest'
import {
  parseAppleHealthFile,
  hkDate,
  hkTimestamp,
  normalizeSourceId,
} from './appleHealthParser'

// ─── Minimal fixture that covers all supported record types ───────────────────

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<HealthData locale="en_US">
  <ExportDate value="2024-01-16 09:00:00 -0700"/>
  <Me HKCharacteristicTypeIdentifierDateOfBirth="1998-01-01"
      HKCharacteristicTypeIdentifierBiologicalSex="HKBiologicalSexMale"/>

  <!-- Weight (lbs from iPhone) -->
  <Record type="HKQuantityTypeIdentifierBodyMass"
          sourceName="John's iPhone" unit="lb"
          startDate="2024-01-15 08:30:00 -0700"
          endDate="2024-01-15 08:30:00 -0700" value="199.1"/>

  <!-- Body Fat -->
  <Record type="HKQuantityTypeIdentifierBodyFatPercentage"
          sourceName="RENPHO" unit="%"
          startDate="2024-01-15 08:30:00 -0700"
          endDate="2024-01-15 08:30:00 -0700" value="17.2"/>

  <!-- Lean Body Mass (kg) -->
  <Record type="HKQuantityTypeIdentifierLeanBodyMass"
          sourceName="RENPHO" unit="kg"
          startDate="2024-01-15 08:30:00 -0700"
          endDate="2024-01-15 08:30:00 -0700" value="74.8"/>

  <!-- Steps — two intervals on the same day (should sum) -->
  <Record type="HKQuantityTypeIdentifierStepCount"
          sourceName="John's Apple Watch" unit="count"
          startDate="2024-01-15 09:00:00 -0700"
          endDate="2024-01-15 09:15:00 -0700" value="423"/>
  <Record type="HKQuantityTypeIdentifierStepCount"
          sourceName="John's Apple Watch" unit="count"
          startDate="2024-01-15 09:15:00 -0700"
          endDate="2024-01-15 09:30:00 -0700" value="156"/>

  <!-- Active calories -->
  <Record type="HKQuantityTypeIdentifierActiveEnergyBurned"
          sourceName="John's Apple Watch" unit="kcal"
          startDate="2024-01-15 00:00:00 -0700"
          endDate="2024-01-15 23:59:59 -0700" value="612"/>

  <!-- Resting HR -->
  <Record type="HKQuantityTypeIdentifierRestingHeartRate"
          sourceName="John's Apple Watch" unit="count/min"
          startDate="2024-01-15 07:00:00 -0700"
          endDate="2024-01-15 07:00:00 -0700" value="52"/>

  <!-- HRV — two readings, should average -->
  <Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN"
          sourceName="John's Apple Watch" unit="ms"
          startDate="2024-01-15 03:00:00 -0700"
          endDate="2024-01-15 03:00:00 -0700" value="70"/>
  <Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN"
          sourceName="John's Apple Watch" unit="ms"
          startDate="2024-01-15 04:00:00 -0700"
          endDate="2024-01-15 04:00:00 -0700" value="66"/>

  <!-- Sleep — 3 intervals, all "Asleep", assigned to wake-up date (Jan 15) -->
  <Record type="HKCategoryTypeIdentifierSleepAnalysis"
          sourceName="RingConn" value="HKCategoryValueSleepAnalysisAsleepCore"
          startDate="2024-01-14 23:00:00 -0700"
          endDate="2024-01-15 01:00:00 -0700"/>
  <Record type="HKCategoryTypeIdentifierSleepAnalysis"
          sourceName="RingConn" value="HKCategoryValueSleepAnalysisAsleepDeep"
          startDate="2024-01-15 01:00:00 -0700"
          endDate="2024-01-15 02:00:00 -0700"/>
  <Record type="HKCategoryTypeIdentifierSleepAnalysis"
          sourceName="RingConn" value="HKCategoryValueSleepAnalysisAsleepREM"
          startDate="2024-01-15 05:00:00 -0700"
          endDate="2024-01-15 07:00:00 -0700"/>
  <!-- In-bed interval — should NOT be counted as sleep -->
  <Record type="HKCategoryTypeIdentifierSleepAnalysis"
          sourceName="RingConn" value="HKCategoryValueSleepAnalysisInBed"
          startDate="2024-01-14 22:30:00 -0700"
          endDate="2024-01-15 07:15:00 -0700"/>

  <!-- Workout -->
  <Workout workoutActivityType="HKWorkoutActivityTypeRunning"
           duration="45.0" durationUnit="min"
           totalDistance="5.0" totalDistanceUnit="mi"
           totalEnergyBurned="450" totalEnergyBurnedUnit="Cal"
           sourceName="John's Apple Watch"
           startDate="2024-01-15 06:00:00 -0700"
           endDate="2024-01-15 06:45:00 -0700"/>

  <!-- Record on a different day -->
  <Record type="HKQuantityTypeIdentifierBodyMass"
          sourceName="John's iPhone" unit="lb"
          startDate="2024-01-14 08:00:00 -0700"
          endDate="2024-01-14 08:00:00 -0700" value="200.0"/>
</HealthData>`

async function parseSampleXML(): Promise<Awaited<ReturnType<typeof parseAppleHealthFile>>> {
  const blob = new Blob([SAMPLE_XML], { type: 'text/xml' })
  const file = new File([blob], 'export.xml', { type: 'text/xml' })
  return parseAppleHealthFile(file)
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('hkDate', () => {
  it('extracts YYYY-MM-DD without timezone conversion', () => {
    expect(hkDate('2024-01-15 08:30:00 -0700')).toBe('2024-01-15')
    expect(hkDate('2024-12-31 23:59:59 +0000')).toBe('2024-12-31')
  })
})

describe('hkTimestamp', () => {
  it('parses Apple Health date strings to numbers', () => {
    const ts = hkTimestamp('2024-01-15 00:00:00 +0000')
    expect(ts).toBe(new Date('2024-01-15T00:00:00+00:00').getTime())
  })
  it('respects timezone offset', () => {
    const utc   = hkTimestamp('2024-01-15 07:00:00 +0000')
    const local = hkTimestamp('2024-01-15 00:00:00 -0700')
    expect(utc).toBe(local)
  })
})

describe('normalizeSourceId', () => {
  it('maps Apple Watch names', () => {
    expect(normalizeSourceId("John's Apple Watch")).toBe('apple_watch')
    expect(normalizeSourceId("Apple Watch Ultra")).toBe('apple_watch')
  })
  it('maps RENPHO', () => {
    expect(normalizeSourceId('RENPHO')).toBe('renpho')
    expect(normalizeSourceId('Renpho Health')).toBe('renpho')
  })
  it('maps RingConn', () => {
    expect(normalizeSourceId('RingConn')).toBe('ringconn')
  })
  it('defaults to apple_health', () => {
    expect(normalizeSourceId("John's iPhone")).toBe('apple_health')
    expect(normalizeSourceId('Health')).toBe('apple_health')
  })
})

describe('parseAppleHealthFile', () => {
  it('returns export metadata', async () => {
    const result = await parseSampleXML()
    expect(result.exportDate).toBe('2024-01-16 09:00:00 -0700')
    expect(result.fileName).toBe('export.xml')
  })

  it('detects correct date range', async () => {
    const result = await parseSampleXML()
    expect(result.dateRange?.start).toBe('2024-01-14')
    expect(result.dateRange?.end).toBe('2024-01-15')
  })

  it('counts raw records correctly', async () => {
    const result = await parseSampleXML()
    // 1 weight (Jan15) + 1 fat + 1 lean + 2 steps + 1 activeCal + 1 restingHR
    // + 2 HRV + 4 sleep + 1 weight (Jan14) = 14
    expect(result.totalRawRecords).toBe(14)
  })

  it('counts workouts', async () => {
    const result = await parseSampleXML()
    expect(result.totalWorkouts).toBe(1)
  })

  it('sums steps correctly for one day', async () => {
    const result = await parseSampleXML()
    const stepsMetric = result.metrics.find(m => m.type === 'steps' && m.date === '2024-01-15')
    expect(stepsMetric).toBeDefined()
    expect(stepsMetric!.value).toBe(423 + 156) // 579
  })

  it('converts lbs to kg for weight', async () => {
    const result = await parseSampleXML()
    const weightMetric = result.metrics.find(m => m.type === 'weight' && m.date === '2024-01-15')
    expect(weightMetric).toBeDefined()
    // 199.1 lbs → 90.31 kg
    expect(Number(weightMetric!.value)).toBeCloseTo(199.1 / 2.20462, 1)
    expect(weightMetric!.unit).toBe('kg')
  })

  it('averages HRV readings', async () => {
    const result = await parseSampleXML()
    const hrv = result.metrics.find(m => m.type === 'hrv' && m.date === '2024-01-15')
    expect(hrv).toBeDefined()
    expect(Number(hrv!.value)).toBe(68) // Math.round((70+66)/2)
  })

  it('sums sleep ONLY for asleep intervals (not in-bed)', async () => {
    const result = await parseSampleXML()
    // Core (2h) + Deep (1h) + REM (2h) = 5h. Assigned to Jan 15 (end date)
    const sleep = result.metrics.find(m => m.type === 'sleepHours' && m.date === '2024-01-15')
    expect(sleep).toBeDefined()
    expect(Number(sleep!.value)).toBeCloseTo(5.0, 0)
  })

  it('assigns sleep to wake-up date (end date), not start date', async () => {
    const result = await parseSampleXML()
    // Sleep spans from Jan 14 23:00 → Jan 15 07:00, should be on Jan 15
    const sleep14 = result.metrics.find(m => m.type === 'sleepHours' && m.date === '2024-01-14')
    const sleep15 = result.metrics.find(m => m.type === 'sleepHours' && m.date === '2024-01-15')
    expect(sleep14).toBeUndefined()
    expect(sleep15).toBeDefined()
  })

  it('generates metrics with correct dataMode', async () => {
    const result = await parseSampleXML()
    for (const m of result.metrics) {
      expect(m.dataMode).toBe('imported')
    }
  })

  it('normalizes RENPHO source correctly', async () => {
    const result = await parseSampleXML()
    const fat = result.metrics.find(m => m.type === 'bodyFatPct')
    expect(fat?.sourceId).toBe('renpho')
  })

  it('has unique metric IDs (no duplicates)', async () => {
    const result = await parseSampleXML()
    const ids = result.metrics.map(m => m.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it('produces snapshots for each day', async () => {
    const result = await parseSampleXML()
    const dates = result.snapshots.map(s => s.date)
    expect(dates).toContain('2024-01-15')
    expect(dates).toContain('2024-01-14')
  })

  it('snapshot has correct values for Jan 15', async () => {
    const result = await parseSampleXML()
    const snap = result.snapshots.find(s => s.date === '2024-01-15')
    expect(snap).toBeDefined()
    expect(snap!.steps).toBe(579)
    expect(snap!.hrv).toBe(68)
    expect(snap!.bodyFatPct).toBe(17.2)
    expect(snap!.restingHeartRate).toBe(52)
  })

  it('workout is stored as a separate metric with encoded value', async () => {
    const result = await parseSampleXML()
    const workout = result.metrics.find(m => m.type === 'workout')
    expect(workout).toBeDefined()
    expect(workout!.value).toContain('Running')
  })

  it('byType contains all record types found', async () => {
    const result = await parseSampleXML()
    const labels = result.byType.map(t => t.label)
    expect(labels).toContain('Weight')
    expect(labels).toContain('Body Fat %')
    expect(labels).toContain('Step Count')
    expect(labels).toContain('Resting Heart Rate')
    expect(labels).toContain('HRV (SDNN)')
    expect(labels).toContain('Sleep Analysis')
  })
})
