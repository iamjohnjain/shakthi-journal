import { useState, useEffect } from 'react'
import { generateDailyInsights, type EngineInput, type HealthInsight, type WeightPoint, type WorkoutSummary } from '../engine/healthIntelligence'
import { getLatestSnapshots } from '../db/healthStore'
import { getRecentWorkouts } from '../db/workoutStore'
import { getDailyTotals } from '../db/nutritionStore'
import { getProfile } from '../db/profileStore'
import { getSetting } from '../db/index'
import type { NutritionGoals, WorkoutSession } from '../db/index'

export interface TodayProgress {
  proteinTotal: number
  proteinRemaining: number
  caloriesToday: number
  caloriesRemaining: number
  workoutLogged: boolean
  workoutType: string | null
  workoutDuration: number | null
}

interface UseHealthInsightsResult {
  insights: HealthInsight[]
  todayProgress: TodayProgress
  loading: boolean
}

const DEFAULT_GOALS: NutritionGoals = {
  calories: 2300,
  proteinG: 180,
  carbsG: 200,
  fatG: 60,
  waterMl: 3785,
  macroFirstMode: false,
}

const DEFAULT_PROGRESS: TodayProgress = {
  proteinTotal: 0,
  proteinRemaining: 0,
  caloriesToday: 0,
  caloriesRemaining: 0,
  workoutLogged: false,
  workoutType: null,
  workoutDuration: null,
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function sessionToSummary(s: WorkoutSession): WorkoutSummary {
  return {
    date: s.date,
    type: s.type,
    bodyAreas: s.bodyAreas,
    durationMin: s.durationMin,
    exercises: (s.exercises ?? []).map(e => ({
      name: e.name,
      sets: (e.sets ?? []).map(set => ({
        weightLbs: set.weightLbs,
        reps: set.reps,
      })),
    })),
  }
}

export function useHealthInsights(mockMode: boolean): UseHealthInsightsResult {
  const [insights, setInsights] = useState<HealthInsight[]>([])
  const [todayProgress, setTodayProgress] = useState<TodayProgress>(DEFAULT_PROGRESS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (mockMode) {
      setInsights([])
      setTodayProgress(DEFAULT_PROGRESS)
      setLoading(false)
      return
    }

    let cancelled = false

    async function load() {
      const today = toDateStr(new Date())
      const now = new Date()

      const [
        snapshots,
        recentSessionsRaw,
        dailyTotals,
        profile,
        nutritionGoals,
        intendedGoals,
      ] = await Promise.all([
        getLatestSnapshots(14).catch(() => []),
        getRecentWorkouts(20).catch(() => []),
        getDailyTotals(today).catch(() => null),
        getProfile().catch(() => null),
        getSetting<NutritionGoals>('nutrition-goals', DEFAULT_GOALS),
        getSetting<string[]>('onboarding.goals', []),
      ])

      if (cancelled) return

      const todaySnap = snapshots.find(s => s.date === today)

      // Weight history (most recent first) — DailySnapshot uses `weight` for kg
      const weightHistory: WeightPoint[] = snapshots
        .filter(s => s.weight != null)
        .map(s => ({ date: s.date, weightKg: s.weight! }))
        .sort((a, b) => b.date.localeCompare(a.date))

      // Goal weight in kg from profile (profileStore uses goalWeightKg)
      const goalWeightKg = profile?.goalWeightKg ?? null

      // Today's workout
      const todayWorkoutRaw = recentSessionsRaw.find(s => s.date === today) ?? null
      const recentWorkouts: WorkoutSummary[] = recentSessionsRaw
        .filter(s => s.date !== today)
        .map(sessionToSummary)

      // Nutrition — nutrition store's getDailyTotals returns { calories, proteinG }
      const proteinG = dailyTotals?.proteinG ?? todaySnap?.proteinG ?? 0
      const caloriesIn = dailyTotals?.calories ?? todaySnap?.caloriesIn ?? 0

      // Weekly arrays (index 0 = today)
      const weeklyProteinG: number[] = []
      const weeklyCaloriesIn: number[] = []
      for (let i = 0; i < 7; i++) {
        const d = new Date(now)
        d.setDate(d.getDate() - i)
        const ds = toDateStr(d)
        const snap = snapshots.find(s => s.date === ds)
        weeklyProteinG.push(snap?.proteinG ?? 0)
        weeklyCaloriesIn.push(snap?.caloriesIn ?? 0)
      }

      // HR baseline from last 14 days (DailySnapshot uses `restingHeartRate`)
      const hrValues = snapshots
        .filter(s => s.restingHeartRate != null && s.date !== today)
        .map(s => s.restingHeartRate!)
      const hrBaseline = hrValues.length >= 3
        ? hrValues.reduce((a, b) => a + b, 0) / hrValues.length
        : null

      // 7-day avg HRV + sleep (excluding today) for story narrative
      const recentOther = snapshots.filter(s => s.date !== today).slice(0, 7)
      const hrvValues = recentOther.filter(s => s.hrv != null).map(s => s.hrv!)
      const avgHrv = hrvValues.length >= 2
        ? Math.round(hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length)
        : null
      const sleepValues = recentOther.filter(s => s.sleepHours != null).map(s => s.sleepHours!)
      const avgSleepHours = sleepValues.length >= 2
        ? +(sleepValues.reduce((a, b) => a + b, 0) / sleepValues.length).toFixed(1)
        : null

      const hasAppleHealthData = snapshots.some(
        s => s.hrv != null || s.sleepHours != null || s.steps != null
      )

      const input: EngineInput = {
        dateStr: today,
        hourOfDay: now.getHours(),
        hrv: todaySnap?.hrv ?? null,
        sleepHours: todaySnap?.sleepHours ?? null,
        sleepScore: todaySnap?.sleepScore ?? null,
        restingHR: todaySnap?.restingHeartRate ?? null,
        hrBaseline,
        avgHrv,
        avgSleepHours,
        steps: todaySnap?.steps ?? null,
        proteinG,
        caloriesIn,
        proteinGoal: nutritionGoals.proteinG,
        caloriesGoal: nutritionGoals.calories,
        weightHistory,
        goalWeightKg,
        goalTypes: intendedGoals,
        todayWorkout: todayWorkoutRaw ? sessionToSummary(todayWorkoutRaw) : null,
        recentWorkouts,
        weeklyProteinG,
        weeklyCaloriesIn,
        hasAppleHealthData,
        isMockMode: false,
      }

      const generated = generateDailyInsights(input)

      const progress: TodayProgress = {
        proteinTotal: proteinG,
        proteinRemaining: Math.max(0, nutritionGoals.proteinG - proteinG),
        caloriesToday: caloriesIn,
        caloriesRemaining: Math.max(0, nutritionGoals.calories - caloriesIn),
        workoutLogged: todayWorkoutRaw !== null,
        workoutType: todayWorkoutRaw?.type ?? null,
        workoutDuration: todayWorkoutRaw?.durationMin ?? null,
      }

      if (!cancelled) {
        setInsights(generated)
        setTodayProgress(progress)
        setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [mockMode])

  return { insights, todayProgress, loading }
}
