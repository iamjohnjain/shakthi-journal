import { useState, useEffect } from 'react'
import { type TodaysStory } from '../engine/storyEngine'
import { useHealthInsights } from './useHealthInsights'

const EMPTY: TodaysStory = {
  text: '',
  confidence: 'low',
  dataUsed: [],
}

export function useCoachStory(mockMode: boolean): { story: TodaysStory; loading: boolean } {
  const { insights: _insights, loading, todayProgress: _prog } = useHealthInsights(mockMode)
  const [story, setStory] = useState<TodaysStory>(EMPTY)

  // We re-use the same underlying EngineInput by importing the engine directly
  // to avoid duplicating the data fetch. Instead, we run a lightweight parallel
  // fetch and call generateTodaysStory with the same input.
  useEffect(() => {
    if (mockMode || loading) return

    async function buildStory() {
      const [
        { getLatestSnapshots }  ,
        { getRecentWorkouts }   ,
        { getDailyTotals }      ,
        { getProfile }          ,
        { getSetting }          ,
      ] = await Promise.all([
        import('../db/healthStore'),
        import('../db/workoutStore'),
        import('../db/nutritionStore'),
        import('../db/profileStore'),
        import('../db/index'),
      ])

      type NutritionGoals = { calories: number; proteinG: number; carbsG: number; fatG: number; macroFirstMode: boolean }
      const DEFAULT_GOALS: NutritionGoals = {
        calories: 2300, proteinG: 180, carbsG: 200, fatG: 60, macroFirstMode: false,
      }

      const today = new Date().toISOString().slice(0, 10)
      const now   = new Date()

      const [snapshots, sessions, dailyTotals, profile, nutritionGoals, goalTypes] = await Promise.all([
        getLatestSnapshots(14).catch(() => []),
        getRecentWorkouts(14).catch(() => []),
        getDailyTotals(today).catch(() => null),
        getProfile().catch(() => null),
        getSetting<NutritionGoals>('nutrition-goals', DEFAULT_GOALS),
        getSetting<string[]>('onboarding.goals', []),
      ])

      const todaySnap = snapshots.find(s => s.date === today)
      const todaySession = sessions.find(s => s.date === today) ?? null

      const recentOther = snapshots.filter(s => s.date !== today).slice(0, 7)
      const hrvVals   = recentOther.filter(s => s.hrv != null).map(s => s.hrv!)
      const sleepVals = recentOther.filter(s => s.sleepHours != null).map(s => s.sleepHours!)
      const avgHrv        = hrvVals.length   >= 2 ? Math.round(hrvVals.reduce((a, b) => a + b) / hrvVals.length) : null
      const avgSleepHours = sleepVals.length >= 2 ? +(sleepVals.reduce((a, b) => a + b) / sleepVals.length).toFixed(1) : null

      const hrValues = snapshots.filter(s => s.restingHeartRate != null && s.date !== today).map(s => s.restingHeartRate!)
      const hrBaseline = hrValues.length >= 3 ? hrValues.reduce((a, b) => a + b) / hrValues.length : null

      const weeklyProteinG: number[] = []
      const weeklyCaloriesIn: number[] = []
      for (let i = 0; i < 7; i++) {
        const d = new Date(now)
        d.setDate(d.getDate() - i)
        const ds = d.toISOString().slice(0, 10)
        const snap = snapshots.find(s => s.date === ds)
        weeklyProteinG.push(snap?.proteinG ?? 0)
        weeklyCaloriesIn.push(snap?.caloriesIn ?? 0)
      }

      const weightHistory = snapshots
        .filter(s => s.weight != null)
        .map(s => ({ date: s.date, weightKg: s.weight! }))
        .sort((a, b) => b.date.localeCompare(a.date))

      const { generateTodaysStory: gen } = await import('../engine/storyEngine')
      const result = gen({
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
        proteinG: dailyTotals?.proteinG ?? todaySnap?.proteinG ?? 0,
        caloriesIn: dailyTotals?.calories ?? todaySnap?.caloriesIn ?? 0,
        proteinGoal: nutritionGoals.proteinG,
        caloriesGoal: nutritionGoals.calories,
        weightHistory,
        goalWeightKg: profile?.goalWeightKg ?? null,
        goalTypes,
        todayWorkout: todaySession ? {
          date: todaySession.date,
          type: todaySession.type,
          bodyAreas: todaySession.bodyAreas,
          durationMin: todaySession.durationMin,
          exercises: todaySession.exercises.map(e => ({
            name: e.name,
            sets: e.sets.map(s => ({ weightLbs: s.weightLbs, reps: s.reps })),
          })),
        } : null,
        recentWorkouts: sessions.filter(s => s.date !== today).map(s => ({
          date: s.date,
          type: s.type,
          bodyAreas: s.bodyAreas,
          durationMin: s.durationMin,
          exercises: s.exercises.map(e => ({
            name: e.name,
            sets: e.sets.map(set => ({ weightLbs: set.weightLbs, reps: set.reps })),
          })),
        })),
        weeklyProteinG,
        weeklyCaloriesIn,
        hasAppleHealthData: snapshots.some(s => s.hrv != null || s.sleepHours != null),
        isMockMode: false,
      })

      setStory(result)
    }

    void buildStory()
  }, [mockMode, loading])

  return { story, loading }
}
