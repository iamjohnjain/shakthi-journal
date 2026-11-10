import { useEffect, useState } from 'react'
import { getWorkoutsByDateRange } from '../db/workoutStore'
import {
  classifyExercise, REGION_MUSCLES, regionTarget,
  type MuscleGroup, type VisualRegion,
} from '../lib/muscleMap'

export type RegionStatus = 'none' | 'under' | 'onTarget' | 'over'

export interface RegionLoad {
  trained: number
  target: number
  pct: number
  status: RegionStatus
}

export interface MuscleLoadResult {
  fine: Record<MuscleGroup, number>
  regions: Record<VisualRegion, RegionLoad>
  loading: boolean
}

function daysInRange(start: string, end: string): number {
  const a = new Date(start + 'T12:00:00').getTime()
  const b = new Date(end + 'T12:00:00').getTime()
  return Math.max(1, Math.round((b - a) / 86400000) + 1)
}

function statusFor(trained: number, target: number): RegionStatus {
  if (trained <= 0) return 'none'
  const pct = trained / target
  if (pct < 0.5) return 'under'
  if (pct <= 1.5) return 'onTarget'
  return 'over'
}

const EMPTY_FINE = {} as Record<MuscleGroup, number>
const EMPTY_REGIONS = {} as Record<VisualRegion, RegionLoad>

export function useMuscleLoad(range: { start: string; end: string }): MuscleLoadResult {
  const [fine, setFine] = useState<Record<MuscleGroup, number>>(EMPTY_FINE)
  const [regions, setRegions] = useState<Record<VisualRegion, RegionLoad>>(EMPTY_REGIONS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    getWorkoutsByDateRange(range.start, range.end).then(workouts => {
      if (cancelled) return

      const fineCounts: Partial<Record<MuscleGroup, number>> = {}
      const classifyCache = new Map<string, MuscleGroup[]>()

      for (const w of workouts) {
        if (w.type !== 'lifting') continue
        for (const ex of w.exercises ?? []) {
          if (ex.isBreak || !ex.name.trim()) continue
          let muscles = classifyCache.get(ex.name)
          if (!muscles) {
            muscles = classifyExercise(ex.name)
            classifyCache.set(ex.name, muscles)
          }
          if (muscles.length === 0) continue
          for (const set of ex.sets) {
            if (set.isWarmup) continue
            for (const m of muscles) {
              fineCounts[m] = (fineCounts[m] ?? 0) + 1
            }
          }
        }
      }

      const days = daysInRange(range.start, range.end)
      const scale = days / 7

      const fineResult = fineCounts as Record<MuscleGroup, number>
      const regionResult = {} as Record<VisualRegion, RegionLoad>
      for (const region of Object.keys(REGION_MUSCLES) as VisualRegion[]) {
        const trained = REGION_MUSCLES[region].reduce((sum, m) => sum + (fineCounts[m] ?? 0), 0)
        const target = Math.max(1, regionTarget(region) * scale)
        regionResult[region] = { trained, target, pct: trained / target, status: statusFor(trained, target) }
      }

      setFine(fineResult)
      setRegions(regionResult)
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [range.start, range.end])

  return { fine, regions, loading }
}
