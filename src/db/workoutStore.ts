import { getDB } from './index'
import type { WorkoutSession, WorkoutExerciseEntry, ExerciseSet } from './index'
import { syncEngine } from './syncEngine'
import { showToast } from '../utils/toast'
import { localDateStr, addLocalDays } from '../data/config'

export type { WorkoutSession, WorkoutExerciseEntry, ExerciseSet }

// ─── Epley 1RM formula ────────────────────────────────────────────────────────

export function estimateOneRM(weightLbs: number, reps: number): number {
  if (reps <= 0 || weightLbs <= 0) return 0
  if (reps === 1) return weightLbs
  return Math.round(weightLbs * (1 + reps / 30))
}

export function totalVolume(sets: ExerciseSet[]): number {
  return sets.reduce((n, s) => n + s.weightLbs * s.reps, 0)
}

// ─── PR detection ─────────────────────────────────────────────────────────────

/** Returns a Map<exerciseName, bestE1RM> across all saved workouts. */
export async function getAllTimePRs(): Promise<Map<string, number>> {
  const db = await getDB()
  const all = await db.getAll('workouts')
  const prs = new Map<string, number>()
  for (const w of all) {
    for (const ex of w.exercises) {
      const maxE1RM = Math.max(0, ...ex.sets.filter(s => !s.isWarmup).map(s => s.e1rm ?? estimateOneRM(s.weightLbs, s.reps)))
      const prev = prs.get(ex.name) ?? 0
      if (maxE1RM > prev) prs.set(ex.name, maxE1RM)
    }
  }
  return prs
}

/** Annotate sets with e1rm and isPR relative to existing all-time PRs. */
export async function annotateExercises(exercises: WorkoutExerciseEntry[]): Promise<WorkoutExerciseEntry[]> {
  const prs = await getAllTimePRs()
  return exercises.map(ex => {
    let sessionBest = 0
    const annotated = ex.sets.map(s => {
      const e1rm = estimateOneRM(s.weightLbs, s.reps)
      if (s.isWarmup) return { ...s, e1rm, isPR: false }
      const isPR = e1rm > (prs.get(ex.name) ?? 0) && e1rm > sessionBest
      if (isPR || e1rm > sessionBest) sessionBest = e1rm
      return { ...s, e1rm, isPR: e1rm > (prs.get(ex.name) ?? 0) }
    })
    return { ...ex, sets: annotated }
  })
}

// ─── Write ────────────────────────────────────────────────────────────────────

export async function saveWorkout(workout: Omit<WorkoutSession, 'id' | 'createdAt' | 'updatedAt'>): Promise<WorkoutSession> {
  const db = await getDB()
  const now = new Date().toISOString()
  const id = `workout_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  // Annotate exercises with PRs before saving
  const annotated = workout.exercises.length > 0
    ? await annotateExercises(workout.exercises)
    : []
  const full: WorkoutSession = { ...workout, exercises: annotated, id, createdAt: now, updatedAt: now }
  await db.put('workouts', full)
  void syncEngine.queueWrite('workouts', 'upsert', full.id, full)
  showToast('Workout saved')
  return full
}

export async function updateWorkout(id: string, updates: Partial<WorkoutSession>, opts?: { silent?: boolean }): Promise<void> {
  const db = await getDB()
  const existing = await db.get('workouts', id)
  if (!existing) return
  const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() }
  await db.put('workouts', updated)
  void syncEngine.queueWrite('workouts', 'upsert', id, updated)
  if (!opts?.silent) showToast('Workout updated')
}

export async function deleteWorkout(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('workouts', id)
  void syncEngine.queueWrite('workouts', 'delete', id, { id })
  showToast('Workout deleted', 'info')
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getWorkoutsForDate(date: string): Promise<WorkoutSession[]> {
  const db = await getDB()
  return db.getAllFromIndex('workouts', 'by-date', date)
}

export async function getRecentWorkouts(limit = 20): Promise<WorkoutSession[]> {
  const db = await getDB()
  const all = await db.getAll('workouts')
  return all.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, limit)
}

export async function getWorkoutsByDateRange(start: string, end: string): Promise<WorkoutSession[]> {
  const db = await getDB()
  const all = await db.getAll('workouts')
  return all.filter(w => w.date >= start && w.date <= end).sort((a, b) => b.date.localeCompare(a.date))
}

export async function getWorkoutsCount(): Promise<number> {
  const db = await getDB()
  return db.count('workouts')
}

/** Get days with workouts in the last N days (for calendar display). */
export async function getWorkoutDates(days = 30): Promise<string[]> {
  const db = await getDB()
  const all = await db.getAll('workouts')
  const cutoffStr = addLocalDays(localDateStr(), -days)
  return [...new Set(all.filter(w => w.date >= cutoffStr).map(w => w.date))]
}

/** Consecutive days ending today (or yesterday, if nothing's logged yet
    today) with a logged session — a deliberately-marked Rest Day counts
    too, since that's still showing up, just the same as the nutrition
    streak already treats any logged entry as keeping the streak alive. */
export async function getCurrentWorkoutStreak(): Promise<number> {
  const logged = new Set(await getWorkoutDates(90))
  const today = localDateStr()
  let streak = 0
  let cursor = logged.has(today) ? today : addLocalDays(today, -1)
  while (logged.has(cursor)) { streak++; cursor = addLocalDays(cursor, -1) }
  return streak
}

/** Same date range as `getWorkoutDates`, but resolved to which kind of
    training happened each day — drives the lift/cardio/both calendar dot
    colors (green/blue/split) instead of one flat "something happened"
    marker. */
export async function getWorkoutDateTypes(days = 400): Promise<Map<string, 'lift' | 'cardio' | 'both'>> {
  const db = await getDB()
  const all = await db.getAll('workouts')
  const cutoffStr = addLocalDays(localDateStr(), -days)
  const byDate = new Map<string, { lift: boolean; cardio: boolean }>()
  for (const w of all) {
    if (w.date < cutoffStr) continue
    const entry = byDate.get(w.date) ?? { lift: false, cardio: false }
    if (w.type === 'lifting') entry.lift = true
    else entry.cardio = true
    byDate.set(w.date, entry)
  }
  const result = new Map<string, 'lift' | 'cardio' | 'both'>()
  for (const [date, { lift, cardio }] of byDate) {
    result.set(date, lift && cardio ? 'both' : lift ? 'lift' : 'cardio')
  }
  return result
}

/** Get all workouts in a YYYY-MM-DD week (Mon–Sun). Returns map of date → workouts. */
export async function getWorkoutsForWeekDates(dates: string[]): Promise<Map<string, WorkoutSession[]>> {
  const db = await getDB()
  const all = await db.getAll('workouts')
  const map = new Map<string, WorkoutSession[]>()
  for (const d of dates) map.set(d, [])
  for (const w of all) {
    if (map.has(w.date)) map.get(w.date)!.push(w)
  }
  return map
}

export interface ExerciseLastPerf {
  weight: number
  reps: number
  date: string
  e1rm: number
  isAllTimePB: boolean
  suggestedWeight: number
}

/** Last time this exercise was performed (before today), plus all-time PB and suggested next weight. */
export async function getLastExercisePerformance(exerciseName: string): Promise<ExerciseLastPerf | null> {
  if (!exerciseName.trim()) return null
  const db = await getDB()
  const all = await db.getAll('workouts')
  const today = localDateStr()
  const nameLower = exerciseName.toLowerCase().trim()

  let allTimePB = 0
  let lastPerf: { weight: number; reps: number; date: string; e1rm: number } | null = null

  // Scan all workouts, accumulate PB, find most recent
  const sorted = all
    .filter(w => w.date <= today && w.exercises?.length)
    .sort((a, b) => b.date.localeCompare(a.date))

  for (const w of sorted) {
    for (const ex of (w.exercises ?? [])) {
      if (ex.name.toLowerCase().trim() !== nameLower) continue
      let bestInSession: { weight: number; reps: number; e1rm: number } | null = null
      for (const s of ex.sets) {
        if (!s.isWarmup && s.reps > 0 && s.weightLbs > 0) {
          const e1rm = s.weightLbs * (1 + s.reps / 30)
          if (!bestInSession || e1rm > bestInSession.e1rm) {
            bestInSession = { weight: s.weightLbs, reps: s.reps, e1rm }
          }
          if (e1rm > allTimePB) allTimePB = e1rm
        }
      }
      if (bestInSession && !lastPerf) {
        lastPerf = { ...bestInSession, date: w.date }
      }
    }
  }

  if (!lastPerf) return null

  // Suggest 5% progression if this session was easy (reps >= 5), else hold weight
  const suggested = lastPerf.reps >= 5
    ? Math.round(lastPerf.weight * 1.05 / 5) * 5
    : lastPerf.weight

  return {
    weight: lastPerf.weight,
    reps: lastPerf.reps,
    date: lastPerf.date,
    e1rm: lastPerf.e1rm,
    isAllTimePB: Math.abs(lastPerf.e1rm - allTimePB) < 0.1,
    suggestedWeight: suggested,
  }
}

export interface NextSetSuggestion {
  weightLbs: number
  reps: number
  reason: string
}

/** Structured progressive-overload suggestion for the NEXT set of this
    exercise — unlike `getLastExercisePerformance.suggestedWeight` (a bare
    number) this returns a ready-to-use {weight, reps} pair a "Use this" tap
    can drop straight into a new set, plus a one-line reason. Warm-up sets
    are ignored on both sides: finding the last real working set, and never
    suggested as the target. Same per-equipment increment table as
    trainingStore.ts's suggestNextSet (dumbbell +5, bodyweight +0, else
    +10) — kept as a separate function rather than sharing code, since that
    one is RPE-driven and only used by the Progress page. */
export async function suggestNextWorkingSet(exerciseName: string, equipment?: string): Promise<NextSetSuggestion | null> {
  if (!exerciseName.trim()) return null
  const db = await getDB()
  const all = await db.getAll('workouts')
  const today = localDateStr()
  const nameLower = exerciseName.toLowerCase().trim()

  const sorted = all
    .filter(w => w.date <= today && w.exercises?.length)
    .sort((a, b) => b.date.localeCompare(a.date))

  let best: { weightLbs: number; reps: number; e1rm: number } | null = null
  for (const w of sorted) {
    for (const ex of (w.exercises ?? [])) {
      if (ex.name.toLowerCase().trim() !== nameLower) continue
      for (const s of ex.sets) {
        if (s.isWarmup || s.reps <= 0 || s.weightLbs <= 0) continue
        const e1rm = s.weightLbs * (1 + s.reps / 30)
        if (!best || e1rm > best.e1rm) best = { weightLbs: s.weightLbs, reps: s.reps, e1rm }
      }
    }
    if (best) break // only look at the most recent session that has this exercise
  }

  if (best === null) return null
  const found: { weightLbs: number; reps: number; e1rm: number } = best

  const inc = equipment === 'dumbbell' ? 5 : equipment === 'bodyweight' ? 0 : 10
  // Comfortably hit 8+ reps last time — ready to add weight. Otherwise hold
  // the weight and aim for one more rep instead of pushing load too soon.
  if (found.reps >= 8 && inc > 0) {
    return { weightLbs: found.weightLbs + inc, reps: found.reps, reason: `Last time: ${found.weightLbs} lbs × ${found.reps}. Ready to add weight.` }
  }
  if (found.reps >= 8) {
    return { weightLbs: found.weightLbs, reps: found.reps + 1, reason: `Last time: ${found.weightLbs} lbs × ${found.reps}. Try one more rep.` }
  }
  return { weightLbs: found.weightLbs, reps: found.reps + 1, reason: `Last time: ${found.weightLbs} lbs × ${found.reps}. Hold the weight, aim for one more rep.` }
}

// ─── Constants ─────────────────────────────────────────────────────────────────

// Primary workout types — only 2. All cardio subtypes live under 'cardio'.
export const WORKOUT_TYPES = [
  { id: 'lifting', label: 'Lifting', color: 'var(--blue)',  calendarDot: 'blue'  },
  { id: 'cardio',  label: 'Cardio',  color: 'var(--green)', calendarDot: 'green' },
] as const

export const CARDIO_SUBTYPES = [
  { id: 'running',        label: 'Running' },
  { id: 'walking',        label: 'Walking' },
  { id: 'cycling',        label: 'Cycling' },
  { id: 'stairmaster',    label: 'StairMaster' },
  { id: 'basketball',     label: 'Basketball' },
  { id: 'volleyball',     label: 'Volleyball' },
  { id: 'sports',         label: 'Sports' },
  { id: 'mobility',       label: 'Mobility' },
  { id: 'recovery-walk',  label: 'Recovery Walk' },
  { id: 'hiit',           label: 'HIIT' },
  { id: 'other-cardio',   label: 'Other Cardio' },
] as const

export const EXERCISE_LIBRARY = [
  // Legs
  { name: 'Back Squat',           muscles: 'Quads, Glutes, Hamstrings' },
  { name: 'Front Squat',          muscles: 'Quads, Core' },
  { name: 'Romanian Deadlift',    muscles: 'Hamstrings, Glutes' },
  { name: 'Bulgarian Split Squat',muscles: 'Quads, Glutes' },
  { name: 'Leg Press',            muscles: 'Quads, Glutes' },
  { name: 'Hamstring Curl',       muscles: 'Hamstrings' },
  { name: 'Leg Extension',        muscles: 'Quads' },
  { name: 'Calf Raises',          muscles: 'Calves' },
  { name: 'Hip Thrust',           muscles: 'Glutes' },
  // Push
  { name: 'Bench Press',          muscles: 'Chest, Triceps, Shoulders' },
  { name: 'Incline DB Bench',     muscles: 'Upper Chest, Shoulders' },
  { name: 'Shoulder Press',       muscles: 'Shoulders, Triceps' },
  { name: 'Lateral Raises',       muscles: 'Shoulders' },
  { name: 'Dips',                 muscles: 'Triceps, Chest' },
  { name: 'Tricep Pushdown',      muscles: 'Triceps' },
  { name: 'Cable Fly',            muscles: 'Chest' },
  // Pull
  { name: 'Pull-ups',             muscles: 'Lats, Biceps' },
  { name: 'Lat Pulldown',         muscles: 'Lats, Biceps' },
  { name: 'Barbell Row',          muscles: 'Back, Biceps' },
  { name: 'Cable Row',            muscles: 'Back, Biceps' },
  { name: 'Deadlift',             muscles: 'Back, Glutes, Hamstrings' },
  { name: 'Face Pulls',           muscles: 'Rear Delts, Rotator Cuff' },
  { name: 'Barbell Curl',         muscles: 'Biceps' },
  // Core
  { name: 'Plank',                muscles: 'Core' },
  { name: 'Ab Wheel',             muscles: 'Core' },
  { name: 'Hanging Leg Raises',   muscles: 'Core, Hip Flexors' },
] as const

export const BODY_AREAS = ['Chest', 'Back', 'Shoulders', 'Arms', 'Core', 'Legs', 'Glutes', 'Full Body', 'Cardio']
