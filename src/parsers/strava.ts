import type { StravaActivity } from '../types/health'
import { mockStravaActivities } from '../data/mock'

// Strava bulk export: Settings → My Account → Download or Delete Your Data.
// Contains activities.csv plus individual .gpx/.fit files.
// V2 will use the official Strava OAuth API instead.

export async function parseStravaCsv(file: File): Promise<StravaActivity[]> {
  const text = await file.text()
  const lines = text.trim().split('\n')

  if (lines.length < 2) throw new Error('CSV file appears empty.')

  const header = lines[0].toLowerCase()
  if (!header.includes('activity') && !header.includes('distance') && !header.includes('moving time')) {
    throw new Error('This does not look like a Strava activities export. Download from Strava → Settings → My Account → Download or Delete Your Data.')
  }

  await new Promise(r => setTimeout(r, 800))

  // TODO: Replace with real Strava CSV parser
  return mockStravaActivities
}

export function summariseStravaActivities(activities: StravaActivity[]) {
  const runs = activities.filter(a => a.type === 'Run')
  const totalDistance = runs.reduce((sum, a) => sum + a.distance, 0)
  return {
    totalActivities: activities.length,
    totalRuns: runs.length,
    totalDistanceKm: +(totalDistance / 1000).toFixed(1),
    dateRange: activities.length > 1
      ? `${activities[activities.length - 1].startDate} → ${activities[0].startDate}`
      : activities[0]?.startDate ?? '—',
  }
}
