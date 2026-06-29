import type { RenphoRecord } from '../types/health'
import { mockRenphoRecords } from '../data/mock'

// Renpho exports CSV from the app: Profile → Export Data.
// Columns: Date, Weight(kg), BMI, Body Fat%, Fat Free Mass(kg), etc.

export async function parseRenphoCsv(file: File): Promise<RenphoRecord[]> {
  const text = await file.text()
  const lines = text.trim().split('\n')

  if (lines.length < 2) throw new Error('CSV file appears empty.')

  const header = lines[0].toLowerCase()
  if (!header.includes('weight') && !header.includes('bmi') && !header.includes('body fat')) {
    throw new Error('This does not look like a Renpho export. Export from the Renpho app → Profile → Export Data.')
  }

  await new Promise(r => setTimeout(r, 600))

  // TODO: Replace with real CSV-to-RenphoRecord mapper
  return mockRenphoRecords
}

export function summariseRenphoRecords(records: RenphoRecord[]) {
  const latest = records[0]
  return {
    totalRecords: records.length,
    latestWeight: latest?.weight,
    latestBodyFat: latest?.bodyFatPct,
    latestMuscleMass: latest?.muscleMassKg,
    dateRange: records.length > 1
      ? `${records[records.length - 1].date} → ${records[0].date}`
      : records[0]?.date ?? '—',
  }
}
