import { getDB } from './index'
import type { Achievement, CoachMemory } from './index'

// ─── Achievements ──────────────────────────────────────────────────────────────

export async function saveAchievement(achievement: Achievement): Promise<void> {
  const db = await getDB()
  await db.put('achievements', achievement)
}

export async function getAllAchievements(): Promise<Achievement[]> {
  const db = await getDB()
  const all = await db.getAll('achievements')
  return all.sort((a, b) => b.unlockedAt.localeCompare(a.unlockedAt))
}

export async function getRecentAchievements(days = 30): Promise<Achievement[]> {
  const all = await getAllAchievements()
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffStr = cutoff.toISOString()
  return all.filter(a => a.unlockedAt >= cutoffStr)
}

// ─── Coach Memory ──────────────────────────────────────────────────────────────

export async function saveCoachMemory(memory: CoachMemory): Promise<void> {
  const db = await getDB()
  await db.put('coach_memory', memory)
}

export async function getCoachMemory(): Promise<CoachMemory | null> {
  const db = await getDB()
  return (await db.get('coach_memory', 'main')) ?? null
}

/** Build/update coach memory from recent workout history. */
export async function refreshCoachMemory(): Promise<void> {
  try {
    const { getRecentWorkouts } = await import('./workoutStore')
    const { getLatestSnapshots } = await import('../db/healthStore')
    const { getDailyTotals } = await import('./nutritionStore')
    const { getSetting } = await import('./index')
    const { getWorkoutsCount } = await import('./workoutStore')
    type NutritionGoals = { calories: number; proteinG: number; carbsG: number; fatG: number; waterMl: number; macroFirstMode: boolean }
    const goals = await getSetting<NutritionGoals>('nutrition-goals', {
      calories: 2300, proteinG: 180, carbsG: 200, fatG: 60, waterMl: 3785, macroFirstMode: false,
    })

    const [workouts, snapshots, totalWorkouts] = await Promise.all([
      getRecentWorkouts(50),
      getLatestSnapshots(30),
      getWorkoutsCount(),
    ])

    // Preferred workout days (most common DOW)
    const dowCounts: number[] = Array(7).fill(0)
    for (const w of workouts) {
      const dow = new Date(w.date + 'T12:00:00').getDay()
      dowCounts[dow]++
    }
    const preferredWorkoutDays = dowCounts
      .map((count, day) => ({ day, count }))
      .filter(d => d.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map(d => d.day)

    // Averages from snapshots
    const hrvVals   = snapshots.filter(s => s.hrv != null).map(s => s.hrv!)
    const sleepVals = snapshots.filter(s => s.sleepHours != null).map(s => s.sleepHours!)
    const avg = (arr: number[]) => arr.length > 0 ? +(arr.reduce((a, b) => a + b) / arr.length).toFixed(1) : null
    const avgHrv        = hrvVals.length  >= 3 ? Math.round(avg(hrvVals)!)   : null
    const avgSleepHours = sleepVals.length >= 3 ? avg(sleepVals)              : null

    // Protein average
    const today = new Date()
    const proteinVals: number[] = []
    for (let i = 0; i < 14; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const totals = await getDailyTotals(d.toISOString().slice(0, 10)).catch(() => null)
      if (totals && totals.proteinG > 0) proteinVals.push(totals.proteinG)
    }
    const avgProteinG = proteinVals.length >= 3 ? Math.round(avg(proteinVals)!) : null

    // Struggles and wins
    const proteinGoal = goals.proteinG
    const lowProteinDays = (await Promise.all(
      Array.from({ length: 14 }, (_, i) => {
        const d = new Date(today); d.setDate(d.getDate() - i); return d.toISOString().slice(0, 10)
      }).map(day => getDailyTotals(day).catch(() => null))
    )).filter(t => t && t.proteinG > 0 && t.proteinG < proteinGoal * 0.85).length

    const recurringStruggles = []
    const recurringWins = []

    if (lowProteinDays >= 5)
      recurringStruggles.push({ type: 'low_protein', lastSeen: new Date().toISOString().slice(0, 10), count: lowProteinDays })
    if (workouts.length === 0)
      recurringStruggles.push({ type: 'no_workouts', lastSeen: new Date().toISOString().slice(0, 10), count: 7 })

    if (avgProteinG !== null && avgProteinG >= proteinGoal * 0.9)
      recurringWins.push({ type: 'hitting_protein', lastSeen: new Date().toISOString().slice(0, 10), count: proteinVals.length })
    if (workouts.length >= 3)
      recurringWins.push({ type: 'consistent_workouts', lastSeen: new Date().toISOString().slice(0, 10), count: workouts.length })

    const existing = await getCoachMemory()
    const memory: CoachMemory = {
      id: 'main',
      updatedAt: new Date().toISOString(),
      preferredWorkoutDays,
      avgSleepHours,
      avgHrvMs: avgHrv,
      avgProteinG,
      totalWorkouts,
      longestWorkoutStreak: existing?.longestWorkoutStreak ?? 0,
      longestProteinStreak: existing?.longestProteinStreak ?? 0,
      recurringStruggles,
      recurringWins,
    }

    await saveCoachMemory(memory)
  } catch { /* non-critical */ }
}
