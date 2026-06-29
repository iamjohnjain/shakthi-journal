import type { AppleHealthExport } from '../types/health'
import { mockAppleHealthExport } from '../data/mock'

// Real implementation will parse the XML from iPhone Health → Export All Health Data.
// The export.xml contains <Record> and <Workout> elements.
// For now: validate the file looks like an Apple Health export, then return mock data.

export async function parseAppleHealthExport(file: File): Promise<AppleHealthExport> {
  const text = await file.text()

  if (!text.includes('HealthData') && !text.includes('HKQuantityType')) {
    throw new Error('This does not look like an Apple Health export file. Export from iPhone → Health app → profile icon → Export All Health Data.')
  }

  // Simulate parse delay
  await new Promise(r => setTimeout(r, 1200))

  // TODO: Replace with real XML parser (DOMParser or fast-xml-parser)
  return {
    ...mockAppleHealthExport,
    exportDate: new Date().toISOString(),
    deviceName: extractDeviceName(text) ?? "Apple Watch",
  }
}

function extractDeviceName(xml: string): string | null {
  const match = xml.match(/name="([^"]+Apple[^"]+)"/)
  return match?.[1] ?? null
}

export function summariseAppleHealthExport(data: AppleHealthExport) {
  const typeSet = new Set(data.records.map(r => r.type))
  return {
    totalRecords: data.records.length + data.workouts.length,
    workouts: data.workouts.length,
    dataTypes: typeSet.size,
    exportDate: data.exportDate,
    device: data.deviceName,
  }
}
