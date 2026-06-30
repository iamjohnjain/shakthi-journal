/**
 * Review Engine — generates WeeklyReview and MonthlyReview from stored data.
 * All reads from IndexedDB; no fake data.
 */

import type { WeeklyReview, MonthlyReview } from '../db/index'
import { getLatestSnapshots } from '../db/healthStore'
import { getWorkoutsByDateRange, getWorkoutsCount } from '../db/workoutStore'
import { getDailyTotals } from '../db/nutritionStore'
import { getProfile } from '../db/profileStore'
import { getSetting } from '../db/index'
import type { NutritionGoals } from '../db/index'
import { calcWeightTrend, kgToLbs } from './healthIntelligence'

// ─── Date helpers ─────────────────────────────────────────────────────────────

export function getMondayOfWeek(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = (day === 0 ? -6 : 1 - day)
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function avg(nums: number[]): number | null {
  const valid = nums.filter(v => v > 0 && isFinite(v))
  if (valid.length === 0) return null
  return +(valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(1)
}

function avgInt(nums: number[]): number | null {
  const a = avg(nums)
  return a !== null ? Math.round(a) : null
}

function confidenceFromCount(n: number): 'high' | 'medium' | 'low' {
  if (n >= 5) return 'high'
  if (n >= 3) return 'medium'
  return 'low'
}

const DEFAULT_GOALS: NutritionGoals = {
  calories: 2300, proteinG: 180, carbsG: 200, fatG: 60, waterMl: 3785, macroFirstMode: false,
}

// ─── Weekly Review ─────────────────────────────────────────────────────────────

export async function generateWeeklyReview(weekStart: string): Promise<WeeklyReview> {
  const weekEnd = addDays(weekStart, 6)

  const [snapshots90, workouts, _profile, nutritionGoals] = await Promise.all([
    getLatestSnapshots(90),
    getWorkoutsByDateRange(weekStart, weekEnd),
    getProfile(),
    getSetting<NutritionGoals>('nutrition-goals', DEFAULT_GOALS),
  ])

  // Filter snapshots to this week
  const weekSnaps = snapshots90.filter(s => s.date >= weekStart && s.date <= weekEnd)

  // Build daily date list
  const days: string[] = []
  for (let i = 0; i < 7; i++) days.push(addDays(weekStart, i))

  // Nutrition: load daily totals for each day of the week
  const nutritionTotals = await Promise.all(days.map(d => getDailyTotals(d).catch(() => null)))

  // ── Stats ──
  const sleepValues  = weekSnaps.filter(s => s.sleepHours  != null).map(s => s.sleepHours!)
  const hrvValues    = weekSnaps.filter(s => s.hrv         != null).map(s => s.hrv!)
  const proteinVals  = nutritionTotals.filter(t => t != null && t.proteinG > 0).map(t => t!.proteinG)
  const calVals      = nutritionTotals.filter(t => t != null && t.calories > 0).map(t => t!.calories)
  const weightSnaps  = weekSnaps.filter(s => s.weight != null)

  const workoutCount = workouts.length
  const workoutDays  = new Set(workouts.map(w => w.date)).size
  const workoutConsistencyPct = Math.round((workoutDays / 7) * 100)

  // Nutrition consistency = days where protein >= 85% of goal
  const proteinGoal = nutritionGoals.proteinG
  const nutritionDays = nutritionTotals.filter(t => t != null && t.proteinG >= proteinGoal * 0.85).length
  const nutritionConsistencyPct = Math.round((nutritionDays / 7) * 100)

  // Recovery consistency = days with HRV or sleep data (not specifically "good")
  const recoveryDays = weekSnaps.filter(s => s.hrv != null || s.sleepHours != null).length
  const recoveryConsistencyPct = Math.round((recoveryDays / 7) * 100)

  // Weight
  const weightStart = weightSnaps.length > 0 ? weightSnaps[weightSnaps.length - 1].weight! : null
  const weightEnd   = weightSnaps.length > 0 ? weightSnaps[0].weight! : null
  const weightChangeLbs = (weightStart != null && weightEnd != null)
    ? +((weightEnd - weightStart) * 2.20462).toFixed(1)
    : null

  // ── Narrative ──
  const parts: string[] = []
  const allWorkoutCount = await getWorkoutsCount()

  if (workoutCount === 0) {
    parts.push('No workouts were logged this week.')
  } else {
    parts.push(`You trained ${workoutCount} time${workoutCount > 1 ? 's' : ''} this week across ${workoutDays} day${workoutDays > 1 ? 's' : ''}.`)
  }

  const avgProtein = avgInt(proteinVals)
  if (avgProtein !== null) {
    const gap = proteinGoal - avgProtein
    if (gap <= 0) {
      parts.push(`Protein averaging ${avgProtein}g — above your ${proteinGoal}g goal.`)
    } else {
      parts.push(`Protein averaged ${avgProtein}g, ${gap}g below your ${proteinGoal}g daily target.`)
    }
  }

  const avgSleep = avg(sleepValues)
  if (avgSleep !== null) {
    parts.push(`Sleep averaged ${avgSleep}h for the ${sleepValues.length} night${sleepValues.length > 1 ? 's' : ''} tracked.`)
  }

  // ── Wins / challenges ──
  let biggestWin: string | null = null
  let biggestChallenge: string | null = null

  if (workoutConsistencyPct >= 70) biggestWin = `${workoutCount} workout${workoutCount > 1 ? 's' : ''} this week — strong consistency`
  else if (nutritionDays >= 5) biggestWin = `Protein goal hit ${nutritionDays} of 7 days`
  else if (avgProtein !== null && avgProtein >= proteinGoal * 0.9) biggestWin = 'Protein intake close to goal all week'
  else if (allWorkoutCount >= 1 && workoutCount >= 1) biggestWin = 'Showed up and trained'

  if (avgProtein !== null && avgProtein < proteinGoal * 0.7) biggestChallenge = `Protein averaged only ${avgProtein}g — ${proteinGoal - avgProtein}g below goal`
  else if (workoutCount === 0) biggestChallenge = 'No workouts logged this week'
  else if (weightChangeLbs !== null && Math.abs(weightChangeLbs) > 3) biggestChallenge = `Large weight swing of ${weightChangeLbs > 0 ? '+' : ''}${weightChangeLbs} lbs — likely water fluctuation`

  // ── Recommendations ──
  const recommendations: string[] = []
  if (workoutCount === 0)
    recommendations.push('Log at least one session next week to keep momentum.')
  else if (workoutConsistencyPct < 50)
    recommendations.push(`Aim for ${Math.ceil(7 * 0.5)} training days next week.`)

  if (avgProtein !== null && avgProtein < proteinGoal * 0.85)
    recommendations.push(`Increase daily protein by ${proteinGoal - avgProtein}g — try adding a high-protein snack or shake.`)

  if (avgSleep !== null && avgSleep < 7)
    recommendations.push('Sleep averaged under 7h — prioritise an earlier bedtime this week.')

  if (recommendations.length === 0)
    recommendations.push('Maintain current consistency — it is working.')

  const dataPointCount = sleepValues.length + hrvValues.length + proteinVals.length + workoutCount
  const confidence = confidenceFromCount(dataPointCount)

  const review: WeeklyReview = {
    id: `week_${weekStart}`,
    weekStart,
    weekEnd,
    generatedAt: new Date().toISOString(),
    summary: parts.join(' '),
    stats: {
      workoutCount,
      avgSleepHours: avg(sleepValues),
      avgHrvMs: avgInt(hrvValues),
      avgProteinG: avgInt(proteinVals),
      avgCaloriesIn: avgInt(calVals),
      weightStartKg: weightStart,
      weightEndKg: weightEnd,
      weightChangeLbs,
    },
    workoutConsistencyPct,
    nutritionConsistencyPct,
    recoveryConsistencyPct,
    biggestWin,
    biggestChallenge,
    recommendations,
    confidence,
  }

  return review
}

// ─── Monthly Review ────────────────────────────────────────────────────────────

export async function generateMonthlyReview(month: string): Promise<MonthlyReview> {
  // month = YYYY-MM
  const [year, mo] = month.split('-').map(Number)
  const monthStart = `${month}-01`
  const lastDay = new Date(year, mo, 0).getDate()
  const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`

  const [snapshots90, workouts, _profile, nutritionGoals] = await Promise.all([
    getLatestSnapshots(90),
    getWorkoutsByDateRange(monthStart, monthEnd),
    getProfile(),
    getSetting<NutritionGoals>('nutrition-goals', DEFAULT_GOALS),
  ])

  const monthSnaps = snapshots90.filter(s => s.date >= monthStart && s.date <= monthEnd)

  const sleepValues = monthSnaps.filter(s => s.sleepHours != null).map(s => s.sleepHours!)
  const hrvValues   = monthSnaps.filter(s => s.hrv        != null).map(s => s.hrv!)
  const weightSnaps = monthSnaps.filter(s => s.weight     != null).sort((a, b) => a.date.localeCompare(b.date))

  // Nutrition totals for all days
  const days: string[] = []
  const d = new Date(monthStart)
  while (d.toISOString().slice(0, 10) <= monthEnd) {
    days.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
  }
  const nutTotals = await Promise.all(days.map(day => getDailyTotals(day).catch(() => null)))
  const proteinVals = nutTotals.filter(t => t?.proteinG && t.proteinG > 0).map(t => t!.proteinG)
  const calVals     = nutTotals.filter(t => t?.calories && t.calories > 0).map(t => t!.calories)

  // Weight trend
  const weightHistory = weightSnaps.map(s => ({ date: s.date, weightKg: s.weight! }))
  const trend = calcWeightTrend(weightHistory)

  const weightStart = weightSnaps[0]?.weight ?? null
  const weightEnd   = weightSnaps[weightSnaps.length - 1]?.weight ?? null
  const weightChangeLbs = (weightStart != null && weightEnd != null)
    ? +((weightEnd - weightStart) * 2.20462).toFixed(1)
    : null

  // Best lift PR this month
  let bestLiftPR: { exercise: string; weightLbs: number } | null = null
  for (const w of workouts) {
    for (const ex of w.exercises) {
      for (const set of ex.sets) {
        if (set.isPR && set.e1rm) {
          if (!bestLiftPR || set.e1rm > bestLiftPR.weightLbs) {
            bestLiftPR = { exercise: ex.name, weightLbs: set.e1rm }
          }
        }
      }
    }
  }

  // Milestones
  const milestones: string[] = []
  const totalWorkouts = await getWorkoutsCount()
  if (totalWorkouts >= 10 && totalWorkouts - workouts.length < 10) milestones.push('Reached 10 total workouts')
  if (totalWorkouts >= 50 && totalWorkouts - workouts.length < 50) milestones.push('Reached 50 total workouts')
  if (totalWorkouts >= 100 && totalWorkouts - workouts.length < 100) milestones.push('Reached 100 total workouts')
  if (bestLiftPR) milestones.push(`New PR: ${bestLiftPR.exercise} at ${bestLiftPR.weightLbs} lbs (estimated 1RM)`)
  if (trend?.direction === 'down' && weightChangeLbs !== null && weightChangeLbs <= -3)
    milestones.push(`Lost ${Math.abs(weightChangeLbs)} lbs this month`)
  if (trend?.direction === 'up' && weightChangeLbs !== null && weightChangeLbs >= 2)
    milestones.push(`Gained ${weightChangeLbs} lbs this month (bulk)`)

  // Consistency score: weighted average of workout/nutrition/recovery
  const workoutDays = new Set(workouts.map(w => w.date)).size
  const proteinGoal = nutritionGoals.proteinG
  const proteinDays = nutTotals.filter(t => t?.proteinG && t.proteinG >= proteinGoal * 0.85).length
  const workoutScore = Math.round((workoutDays / lastDay) * 100)
  const proteinScore = Math.round((proteinDays / lastDay) * 100)
  const consistencyScore = Math.round(workoutScore * 0.5 + proteinScore * 0.5)

  // Narrative
  const summaryParts: string[] = []
  if (workouts.length > 0) {
    summaryParts.push(`You completed ${workouts.length} workout${workouts.length > 1 ? 's' : ''} this month.`)
  } else {
    summaryParts.push('No workouts were logged this month.')
  }
  const avgProtein = avgInt(proteinVals)
  if (avgProtein !== null) {
    const gap = proteinGoal - avgProtein
    summaryParts.push(gap > 0
      ? `Protein averaged ${avgProtein}g, ${gap}g below the ${proteinGoal}g goal.`
      : `Protein averaged ${avgProtein}g — above goal.`)
  }
  if (weightChangeLbs !== null) {
    summaryParts.push(`Body weight changed by ${weightChangeLbs > 0 ? '+' : ''}${weightChangeLbs} lbs over the month.`)
  }
  if (bestLiftPR) {
    summaryParts.push(`Highlight: new PR on ${bestLiftPR.exercise} at ${bestLiftPR.weightLbs} lbs.`)
  }

  const dataCount = sleepValues.length + workouts.length + proteinVals.length
  const confidence = confidenceFromCount(dataCount)

  const review: MonthlyReview = {
    id: `month_${month}`,
    month,
    generatedAt: new Date().toISOString(),
    summary: summaryParts.join(' '),
    stats: {
      workoutCount: workouts.length,
      avgSleepHours: avg(sleepValues),
      avgHrvMs: avgInt(hrvValues),
      avgProteinG: avgInt(proteinVals),
      avgCaloriesIn: avgInt(calVals),
      weightStartKg: weightStart,
      weightEndKg: weightEnd,
      weightChangeLbs,
      bestLiftPR: bestLiftPR
        ? { exercise: bestLiftPR.exercise, weightLbs: Math.round(bestLiftPR.weightLbs) }
        : null,
    },
    consistencyScore,
    milestones,
    streaks: [],  // populated by achievementEngine
    confidence,
  }

  return review
}

// ─── Helper: lbs conversion ───────────────────────────────────────────────────
// re-export for UI consumers
export { kgToLbs }
