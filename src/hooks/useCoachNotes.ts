import { useEffect, useState } from 'react'
import { GOALS } from '../data/config'
import { getWorkoutsForDate } from '../db/workoutStore'
import { getDailyTotals } from '../db/nutritionStore'
import { getLogsForRange } from '../db/logStore'
import type { DailySnapshot } from '../types/health'
import type { DataSource } from './useDashboardData'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CoachNote {
  id: string
  severity: 'positive' | 'action' | 'warning' | 'tip'
  confidence: 'high' | 'medium' | 'low'
  icon: string
  title: string
  body: string
  sources: string[]
  missing?: string[]
}

export interface TodayStatus {
  proteinTotal: number
  proteinRemaining: number
  caloriesToday: number
  caloriesRemaining: number
  stepsToday: number
  stepsRemaining: number
  workoutLogged: boolean
  workoutType: string | null
  workoutDuration: number | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr() { return new Date().toISOString().split('T')[0] }

function daysAgoStr(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

// ─── Rule engine ──────────────────────────────────────────────────────────────

function buildNotes(
  snap: DailySnapshot,
  dataSource: DataSource,
  workoutLogged: boolean,
  workoutType: string | null,
  nutTotals: { calories: number; proteinG: number },
  weightHistory: number[],
): CoachNote[] {
  const notes: CoachNote[] = []
  const isMock = dataSource === 'mock'
  const ahSource = isMock ? 'Mock' : 'Apple Health'
  const logSource = isMock ? 'Mock' : 'Manual Log'

  // Combine nutrition from both sources (daily_log + nutrition_entries)
  const protein   = (snap.proteinG ?? 0) + nutTotals.proteinG
  const calories  = (snap.caloriesIn ?? 0) + nutTotals.calories
  const steps     = snap.steps ?? 0
  const hrv       = snap.hrv
  const sleep     = snap.sleepHours

  // ── Recovery ──
  if (hrv != null) {
    if (hrv < 40 || (sleep != null && sleep < 5.5)) {
      notes.push({
        id: 'recovery-low',
        severity: 'warning',
        confidence: 'medium',
        icon: '😴',
        title: 'Recovery looks low — lighter day recommended',
        body: `HRV at ${hrv}ms${sleep ? ` and ${sleep.toFixed(1)}h sleep` : ''} are below your optimal range. High-intensity training on low-recovery days increases injury risk. Stick to mobility, a short walk, or a deload session.`,
        sources: [ahSource],
      })
    } else if (hrv > 65 && (sleep == null || sleep >= 7)) {
      notes.push({
        id: 'recovery-peak',
        severity: 'positive',
        confidence: 'medium',
        icon: '⚡️',
        title: `Recovery optimal — great day to push hard`,
        body: `HRV at ${hrv}ms${sleep ? ` and ${sleep.toFixed(1)}h sleep` : ''} indicate your nervous system is well-recovered. Research links higher HRV to better neuromuscular performance. Go for a PR on a compound lift.`,
        sources: [ahSource],
      })
    }
  } else if (!isMock) {
    notes.push({
      id: 'hrv-missing',
      severity: 'tip',
      confidence: 'high',
      icon: '📊',
      title: 'No HRV data — recovery-based coaching unavailable',
      body: 'Import Apple Health data to unlock recovery-adjusted training recommendations based on your HRV and sleep.',
      sources: [],
      missing: ['HRV', 'Sleep data'],
    })
  }

  // ── Protein ──
  if (protein > 0) {
    const remaining = GOALS.proteinG - protein
    if (remaining > 20) {
      const isLow = remaining > 80
      notes.push({
        id: 'protein-low',
        severity: isLow ? 'action' : 'tip',
        confidence: 'high',
        icon: '🥩',
        title: `${Math.round(remaining)}g protein remaining`,
        body: isLow
          ? `At ${Math.round(protein)}g of ${GOALS.proteinG}g. Muscle protein synthesis requires consistent intake across the day. A chicken breast (~50g), protein shake (~25g), and Greek yogurt (~17g) closes the gap.`
          : `${Math.round(protein)}g logged so far. A shake or 3 eggs (~18g) gets you to your ${GOALS.proteinG}g target. Protein within 2h of training supports recovery.`,
        sources: [logSource],
      })
    } else if (remaining <= 0) {
      notes.push({
        id: 'protein-hit',
        severity: 'positive',
        confidence: 'high',
        icon: '✅',
        title: `Protein goal hit — ${Math.round(protein)}g logged`,
        body: `You've reached your ${GOALS.proteinG}g target. This intake supports muscle protein synthesis and recovery from training. Strong day.`,
        sources: [logSource],
      })
    }
  } else if (!isMock) {
    notes.push({
      id: 'nutrition-missing',
      severity: 'tip',
      confidence: 'high',
      icon: '🍽️',
      title: 'No nutrition logged today',
      body: 'Log your meals to track your protein goal. Without tracking, it\'s easy to fall short — even 40g below your target slows muscle building meaningfully.',
      sources: [],
      missing: ['Nutrition data'],
    })
  }

  // ── Calories ──
  if (calories > 0) {
    const calRemaining = GOALS.caloriesIn - calories
    const hour = new Date().getHours()
    if (calRemaining > 600 && hour >= 14) {
      notes.push({
        id: 'calories-behind',
        severity: 'tip',
        confidence: 'medium',
        icon: '🍽️',
        title: `${calRemaining.toLocaleString()} kcal remaining after ${hour > 12 ? hour - 12 : hour}${hour >= 12 ? 'pm' : 'am'}`,
        body: `At ${calories.toLocaleString()} kcal. If you're cutting, this may be intentional. If maintaining or building, your body will use muscle for fuel without adequate intake.`,
        sources: [logSource],
      })
    }
  }

  // ── Water ──
  if ((snap.waterMl ?? 0) > 0 && (snap.waterMl ?? 0) < GOALS.waterMl * 0.45) {
    const waterL = ((snap.waterMl ?? 0) / 1000).toFixed(1)
    notes.push({
      id: 'water-low',
      severity: 'warning',
      confidence: 'medium',
      icon: '💧',
      title: `Hydration low — ${waterL}L of ${(GOALS.waterMl / 1000).toFixed(0)}L goal`,
      body: `Even mild dehydration (~1–2%) reduces strength, endurance, and focus. Drink 500ml now and keep a water bottle visible — visibility is the strongest predictor of intake.`,
      sources: [logSource],
    })
  }

  // ── Steps ──
  if (steps > 0 && steps < 5000) {
    notes.push({
      id: 'steps-low',
      severity: 'tip',
      confidence: 'medium',
      icon: '🚶',
      title: `${(GOALS.steps - steps).toLocaleString()} steps remaining`,
      body: `At ${steps.toLocaleString()} steps. NEAT (non-exercise activity thermogenesis) from daily walking contributes significantly to total calorie burn. A 25-min walk after dinner adds ~2,500 steps.`,
      sources: [ahSource],
    })
  }

  // ── Workout ──
  if (!workoutLogged) {
    notes.push({
      id: 'no-workout',
      severity: 'tip',
      confidence: 'high',
      icon: '🏋️',
      title: 'No workout logged today',
      body: 'Log your training session to track volume and progress. If it\'s a rest day, that\'s intentional recovery — just mark it.',
      sources: ['Manual Log'],
      missing: ['Workout log'],
    })
  } else if (workoutType) {
    const typeName = workoutType.charAt(0).toUpperCase() + workoutType.slice(1).replace(/-/g, ' ')
    notes.push({
      id: 'workout-done',
      severity: 'positive',
      confidence: 'high',
      icon: '🔥',
      title: `${typeName} done`,
      body: 'Workout logged. The most important recovery variable now is protein — aim to hit your target within the next few hours.',
      sources: ['Manual Log'],
    })
  }

  // ── Weight plateau (last 14 days) ──
  if (weightHistory.length >= 14) {
    const oldest = weightHistory[weightHistory.length - 1]
    const newest = weightHistory[0]
    const change = Math.abs(newest - oldest)
    if (change < 0.5) {
      notes.push({
        id: 'weight-plateau',
        severity: 'warning',
        confidence: 'medium',
        icon: '📉',
        title: 'Weight unchanged for 14 days',
        body: `Less than 0.5kg change over 2 weeks. If cutting: reduce intake by 150–200 kcal/day or add a 30-min cardio session. If bulking: increase intake. If maintaining: this is exactly right.`,
        sources: ['Apple Health'],
      })
    }
  }

  return notes.slice(0, 5) // max 5 notes shown at once
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCoachNotes(today: DailySnapshot, dataSource: DataSource) {
  const [notes, setNotes] = useState<CoachNote[]>([])
  const [status, setStatus] = useState<TodayStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const date = todayStr()
      const [workouts, nutTotals, logs] = await Promise.all([
        getWorkoutsForDate(date),
        getDailyTotals(date),
        getLogsForRange(daysAgoStr(14), date),
      ])

      if (cancelled) return

      const workout = workouts[0] ?? null
      const weightHistory = logs
        .filter(l => l.weightKg != null)
        .map(l => l.weightKg!)
        .slice(0, 14)

      const protein   = (today.proteinG ?? 0) + nutTotals.proteinG
      const calories  = (today.caloriesIn ?? 0) + nutTotals.calories
      const steps     = today.steps ?? 0

      const newNotes = buildNotes(today, dataSource, !!workout, workout?.type ?? null, nutTotals, weightHistory)

      setNotes(newNotes)
      setStatus({
        proteinTotal:       Math.round(protein),
        proteinRemaining:   Math.max(0, Math.round(GOALS.proteinG - protein)),
        caloriesToday:      Math.round(calories),
        caloriesRemaining:  Math.max(0, Math.round(GOALS.caloriesIn - calories)),
        stepsToday:         steps,
        stepsRemaining:     Math.max(0, GOALS.steps - steps),
        workoutLogged:      !!workout,
        workoutType:        workout
          ? (workout.cardioSubtype ?? (workout.type !== 'cardio' ? workout.type : null) ?? workout.type)
          : null,
        workoutDuration:    workout?.durationMin ?? null,
      })
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [today, dataSource])

  return { notes, status, loading }
}
