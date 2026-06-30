/**
 * Achievement Engine — detects meaningful milestones from real data.
 * Never awards achievements for fake/mock data.
 * All achievements are honest, clearly earned, and non-trivial.
 */

import type { Achievement } from '../db/index'
import { getWorkoutsCount, getWorkoutDates } from '../db/workoutStore'
import { getDailyTotals } from '../db/nutritionStore'
import { getProfile } from '../db/profileStore'
import { getSetting } from '../db/index'
import type { NutritionGoals } from '../db/index'
import { getAllAchievements, saveAchievement } from '../db/achievementStore'
import { showToast } from '../utils/toast'

// ─── Achievement definitions ──────────────────────────────────────────────────

interface AchievementDef {
  id: string
  type: string
  title: string
  description: string
  emoji: string
  check: () => Promise<{ earned: boolean; value?: number }>
}

function toDateStr(d: Date): string { return d.toISOString().slice(0, 10) }

async function getNutritionGoals(): Promise<NutritionGoals> {
  return getSetting<NutritionGoals>('nutrition-goals', {
    calories: 2300, proteinG: 180, carbsG: 200, fatG: 60, waterMl: 3785, macroFirstMode: false,
  })
}

/** Count consecutive days (ending today) where protein hit ≥ 85% of goal. */
async function proteinStreakDays(): Promise<number> {
  const goals = await getNutritionGoals()
  const minProtein = goals.proteinG * 0.85
  let streak = 0
  const today = new Date()
  for (let i = 0; i < 90; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const totals = await getDailyTotals(toDateStr(d)).catch(() => null)
    if (totals && totals.proteinG >= minProtein) streak++
    else break
  }
  return streak
}

/** Count consecutive workout days (each date in last N days has ≥1 workout). */
async function workoutStreakDays(): Promise<number> {
  const dates = await getWorkoutDates(90)
  const dateSet = new Set(dates)
  let streak = 0
  const today = new Date()
  for (let i = 0; i < 90; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    if (dateSet.has(toDateStr(d))) streak++
    else break
  }
  return streak
}

/** Check if current weight is within 2 lbs of goal weight. */
async function isAtWeightGoal(): Promise<boolean> {
  const profile = await getProfile()
  if (!profile?.goalWeightKg) return false
  const { getLatestSnapshots } = await import('../db/healthStore')
  const snaps = await getLatestSnapshots(7)
  const latest = snaps.find(s => s.weight != null)
  if (!latest?.weight) return false
  const diffLbs = Math.abs((latest.weight - profile.goalWeightKg) * 2.20462)
  return diffLbs <= 2
}

// ─── Definitions ──────────────────────────────────────────────────────────────

const ACHIEVEMENT_DEFS: AchievementDef[] = [
  // Workout milestones
  {
    id: 'first_workout', type: 'workout_milestone', emoji: '🏋️',
    title: 'First Step', description: 'Logged your very first workout',
    check: async () => ({ earned: (await getWorkoutsCount()) >= 1, value: 1 }),
  },
  {
    id: 'workout_10', type: 'workout_milestone', emoji: '🔥',
    title: '10 Workouts', description: 'Logged 10 total workouts',
    check: async () => { const n = await getWorkoutsCount(); return { earned: n >= 10, value: n } },
  },
  {
    id: 'workout_25', type: 'workout_milestone', emoji: '⚡',
    title: '25 Workouts', description: 'Logged 25 total workouts',
    check: async () => { const n = await getWorkoutsCount(); return { earned: n >= 25, value: n } },
  },
  {
    id: 'workout_50', type: 'workout_milestone', emoji: '🥈',
    title: '50 Workouts', description: 'Logged 50 total workouts',
    check: async () => { const n = await getWorkoutsCount(); return { earned: n >= 50, value: n } },
  },
  {
    id: 'workout_100', type: 'workout_milestone', emoji: '🥇',
    title: '100 Workouts', description: 'Reached 100 total workouts — elite consistency',
    check: async () => { const n = await getWorkoutsCount(); return { earned: n >= 100, value: n } },
  },

  // Workout streaks
  {
    id: 'workout_streak_7', type: 'workout_streak', emoji: '📅',
    title: '7-Day Training Streak', description: 'Trained every day for 7 days straight',
    check: async () => { const n = await workoutStreakDays(); return { earned: n >= 7, value: n } },
  },
  {
    id: 'workout_streak_14', type: 'workout_streak', emoji: '🗓️',
    title: '14-Day Training Streak', description: 'Trained every day for 14 consecutive days',
    check: async () => { const n = await workoutStreakDays(); return { earned: n >= 14, value: n } },
  },
  {
    id: 'workout_streak_30', type: 'workout_streak', emoji: '🏆',
    title: '30-Day Training Streak', description: '30 days of consecutive training — exceptional',
    check: async () => { const n = await workoutStreakDays(); return { earned: n >= 30, value: n } },
  },

  // Protein streaks
  {
    id: 'protein_streak_7', type: 'protein_streak', emoji: '🥩',
    title: 'Protein Week', description: 'Hit protein goal 7 days in a row',
    check: async () => { const n = await proteinStreakDays(); return { earned: n >= 7, value: n } },
  },
  {
    id: 'protein_streak_14', type: 'protein_streak', emoji: '💪',
    title: 'Protein Fortnight', description: 'Hit protein goal 14 days in a row',
    check: async () => { const n = await proteinStreakDays(); return { earned: n >= 14, value: n } },
  },
  {
    id: 'protein_streak_30', type: 'protein_streak', emoji: '🎯',
    title: 'Protein Month', description: '30 consecutive days hitting your protein goal',
    check: async () => { const n = await proteinStreakDays(); return { earned: n >= 30, value: n } },
  },

  // Goal milestones
  {
    id: 'weight_goal_reached', type: 'weight_goal', emoji: '🎯',
    title: 'Goal Weight Reached', description: 'Body weight is within 2 lbs of your target',
    check: async () => ({ earned: await isAtWeightGoal() }),
  },
]

// ─── Main check function ──────────────────────────────────────────────────────

/**
 * Check all achievement definitions against current data.
 * Awards any that are newly earned. Fires toasts for new unlocks.
 * Safe to call after any data-changing operation.
 */
export async function checkAndAwardAchievements(): Promise<Achievement[]> {
  try {
    const existing = await getAllAchievements()
    const existingIds = new Set(existing.map(a => a.id))
    const newAchievements: Achievement[] = []

    for (const def of ACHIEVEMENT_DEFS) {
      if (existingIds.has(def.id)) continue
      const { earned, value } = await def.check()
      if (!earned) continue

      const achievement: Achievement = {
        id: def.id,
        type: def.type,
        title: def.title,
        description: def.description,
        emoji: def.emoji,
        unlockedAt: new Date().toISOString(),
        value,
      }
      await saveAchievement(achievement)
      newAchievements.push(achievement)
      showToast(`${def.emoji} ${def.title}`, 'success')
    }

    return newAchievements
  } catch {
    return []  // achievement errors never block the main flow
  }
}
