import { useEffect, useState } from 'react'
import { getWorkoutsByDateRange } from '../db/workoutStore'
import {
  classifyExercise, REGION_MUSCLES,
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

// A single universal weekly-set framework (10-20 sets/muscle/week, the same
// "most lifters" range muscleMap.ts's own WEEKLY_SET_TARGET comment already
// cites) applied the same way to every region, replacing the old per-region
// 50%/150%-of-target math. That older version produced a different, very
// wide threshold per muscle (a region with a target of 18 had an "on
// target" band of 9-27 sets) — accurate to the literature, but impossible
// to describe with one simple, non-overlapping legend. This trades a little
// per-muscle nuance for numbers a user can actually read and remember.
const UNDER_TRAINED_WEEKLY = 10
const OVER_TRAINED_WEEKLY = 20

function daysInRange(start: string, end: string): number {
  const a = new Date(start + 'T12:00:00').getTime()
  const b = new Date(end + 'T12:00:00').getTime()
  return Math.max(1, Math.round((b - a) / 86400000) + 1)
}

function statusFor(trained: number, underMax: number, overMax: number): RegionStatus {
  if (trained <= 0) return 'none'
  if (trained < underMax) return 'under'
  if (trained <= overMax) return 'onTarget'
  return 'over'
}

const EMPTY_FINE = {} as Record<MuscleGroup, number>
const EMPTY_REGIONS = {} as Record<VisualRegion, RegionLoad>

/** The actual calculation, with no React state/lifecycle attached — shared
    by the heatmap UI (`useMuscleLoad` below) and the Coach's
    `get_health_context` tool (`coachTools.ts`, a plain async function that
    can't call a hook), so there's exactly one place that knows what
    "under-trained" really means instead of the hook being the only copy. */
export async function computeMuscleLoad(start: string, end: string): Promise<Omit<MuscleLoadResult, 'loading'>> {
  const workouts = await getWorkoutsByDateRange(start, end)

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

  const days = daysInRange(start, end)
  const scale = days / 7
  const underMax = Math.max(1, UNDER_TRAINED_WEEKLY * scale)
  const overMax = Math.max(1, OVER_TRAINED_WEEKLY * scale)

  const fineResult = fineCounts as Record<MuscleGroup, number>
  const regionResult = {} as Record<VisualRegion, RegionLoad>
  for (const region of Object.keys(REGION_MUSCLES) as VisualRegion[]) {
    const trained = REGION_MUSCLES[region].reduce((sum, m) => sum + (fineCounts[m] ?? 0), 0)
    regionResult[region] = { trained, target: overMax, pct: trained / overMax, status: statusFor(trained, underMax, overMax) }
  }

  return { fine: fineResult, regions: regionResult }
}

export function useMuscleLoad(range: { start: string; end: string }): MuscleLoadResult {
  const [fine, setFine] = useState<Record<MuscleGroup, number>>(EMPTY_FINE)
  const [regions, setRegions] = useState<Record<VisualRegion, RegionLoad>>(EMPTY_REGIONS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    computeMuscleLoad(range.start, range.end).then(result => {
      if (cancelled) return
      setFine(result.fine)
      setRegions(result.regions)
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [range.start, range.end])

  return { fine, regions, loading }
}
