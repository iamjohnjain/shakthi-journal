import type { MFPDayLog } from '../types/health'
import { mockMFPLogs } from '../data/mock'

// MFP export: Diary → Nutrition Report → Export to CSV (web only).
// Preferred path: enable MFP → Apple Health sync so data flows through AH export instead.

export async function parseMFPCsv(file: File): Promise<MFPDayLog[]> {
  const text = await file.text()
  const lines = text.trim().split('\n')

  if (lines.length < 2) throw new Error('CSV file appears empty.')

  const header = lines[0].toLowerCase()
  if (!header.includes('calories') && !header.includes('protein') && !header.includes('carbohydrates')) {
    throw new Error('This does not look like a MyFitnessPal nutrition export. Export from myfitnesspal.com → Reports → Export.')
  }

  await new Promise(r => setTimeout(r, 700))

  // TODO: Replace with real MFP CSV parser
  return mockMFPLogs
}

export function summariseMFPLogs(logs: MFPDayLog[]) {
  const avgProtein = logs.reduce((s, l) => s + l.proteinG, 0) / logs.length
  const avgCalories = logs.reduce((s, l) => s + l.calories, 0) / logs.length
  return {
    totalDays: logs.length,
    avgProteinG: +avgProtein.toFixed(0),
    avgCalories: +avgCalories.toFixed(0),
    dateRange: logs.length > 1
      ? `${logs[logs.length - 1].date} → ${logs[0].date}`
      : logs[0]?.date ?? '—',
  }
}
