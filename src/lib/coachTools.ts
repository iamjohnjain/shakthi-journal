// The Coach chat's Phase 1 tool set. Each tool is a small JSON-schema
// definition (sent to the chat-coach Edge Function, which hands it to Groq)
// paired with a client-side executor that calls the exact same functions the
// rest of the app already uses — the LLM never touches data directly, it
// only ever asks the client to run one of these.
//
// Deliberately a focused subset, not every store function in the app: enough
// to cover logging, templates, goals, and looking up real data on demand,
// without wrapping all ~30 store functions (and the hallucinated-tool-call
// risk that would add) on day one.

import type { NavigateFunction } from 'react-router-dom'
import { saveWorkout, getRecentWorkouts, getCurrentWorkoutStreak } from '../db/workoutStore'
import type { WorkoutExerciseEntry } from '../db'
import { addNutritionEntry, getDailyTotals, getCurrentStreak as getNutritionStreak } from '../db/nutritionStore'
import { saveTemplate } from '../db/templateStore'
import { getProfile, saveProfile } from '../db/profileStore'
import { getLatestSnapshots } from '../db/healthStore'
import { calcWeightTrend } from '../engine/healthIntelligence'
import type { WeightPoint } from '../engine/healthIntelligence'
import { getSetting, setSetting } from '../db'
import type { NutritionGoals } from '../db'
import { DEFAULT_GOALS } from '../hooks/useNutritionSettings'
import { localDateStr, kgToLbs } from '../data/config'

export interface GroqToolDef {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

// Fixed allow-list — the model can only navigate somewhere real, never an
// arbitrary path it invents.
const NAVIGABLE_ROUTES: Record<string, string> = {
  workouts: '/workouts',
  workout_history: '/workouts/history',
  workout_progress: '/workouts/progress',
  workout_templates: '/workouts/templates',
  nutrition: '/nutrition',
  goals: '/goals',
  settings: '/settings',
  profile: '/profile',
  progress: '/progress',
  recovery: '/recovery',
}

export const COACH_TOOLS: GroqToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'log_workout',
      description: 'Log a completed workout session for today.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short name for the session, e.g. "Push Day" or "Morning Run".' },
          type: { type: 'string', enum: ['lifting', 'cardio'] },
          durationMin: { type: 'number', description: 'Total duration in minutes.' },
          exercises: {
            type: 'array',
            description: 'Lifting exercises performed, if any.',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                sets: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      reps: { type: 'number' },
                      weightLbs: { type: 'number' },
                    },
                    required: ['reps', 'weightLbs'],
                  },
                },
              },
              required: ['name', 'sets'],
            },
          },
          notes: { type: 'string' },
        },
        required: ['title', 'type', 'durationMin'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'log_meal',
      description: "Log a food/drink entry to today's nutrition.",
      parameters: {
        type: 'object',
        properties: {
          mealType: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
          food: { type: 'string' },
          calories: { type: 'number' },
          proteinG: { type: 'number' },
          carbsG: { type: 'number' },
          fatG: { type: 'number' },
        },
        required: ['mealType', 'food', 'calories', 'proteinG'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_template',
      description: 'Save a reusable workout template the user can start from later.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          exercises: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                sets: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      reps: { type: 'number' },
                      weightLbs: { type: 'number' },
                    },
                    required: ['reps', 'weightLbs'],
                  },
                },
              },
              required: ['name', 'sets'],
            },
          },
          notes: { type: 'string' },
        },
        required: ['name', 'exercises'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_nutrition_goals',
      description: "Update the user's daily nutrition targets. Only pass the fields that should change.",
      parameters: {
        type: 'object',
        properties: {
          calories: { type: 'number' },
          proteinG: { type: 'number' },
          carbsG: { type: 'number' },
          fatG: { type: 'number' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_goals',
      description: "Update the user's goal weight, goal date, or activity level. Only pass the fields that should change.",
      parameters: {
        type: 'object',
        properties: {
          goalWeightLbs: { type: 'number' },
          goalDate: { type: 'string', description: 'YYYY-MM-DD' },
          activityLevel: { type: 'string', enum: ['sedentary', 'light', 'moderate', 'active', 'very-active'] },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_health_context',
      description: "Look up everything known about the user: profile and goals, weight trend, recent nutrition (today and the last week), recent workouts, and logging streaks. Call this whenever a question depends on their actual history, trends, or current goals rather than general knowledge — e.g. before suggesting a calorie change, commenting on progress, or recalling what they've logged. Missing data just comes back as null/empty — that's normal, especially for new accounts, and isn't an error.",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'navigate_to',
      description: 'Take the user to a specific screen in the app.',
      parameters: {
        type: 'object',
        properties: {
          screen: { type: 'string', enum: Object.keys(NAVIGABLE_ROUTES) },
        },
        required: ['screen'],
      },
    },
  },
]

type ToolArgs = Record<string, unknown>

async function execLogWorkout(args: ToolArgs) {
  const exercises: WorkoutExerciseEntry[] = Array.isArray(args.exercises)
    ? (args.exercises as WorkoutExerciseEntry[])
    : []
  const session = await saveWorkout({
    date: localDateStr(),
    type: (args.type as string) === 'cardio' ? 'cardio' : 'lifting',
    title: String(args.title ?? 'Workout'),
    durationMin: Number(args.durationMin ?? 0),
    exercises,
    notes: typeof args.notes === 'string' ? args.notes : undefined,
  })
  return { ok: true, id: session.id, title: session.title }
}

async function execLogMeal(args: ToolArgs) {
  const entry = await addNutritionEntry({
    date: localDateStr(),
    mealType: String(args.mealType ?? 'snack'),
    food: String(args.food ?? 'Food'),
    calories: Number(args.calories ?? 0),
    proteinG: Number(args.proteinG ?? 0),
    carbsG: typeof args.carbsG === 'number' ? args.carbsG : undefined,
    fatG: typeof args.fatG === 'number' ? args.fatG : undefined,
  })
  return { ok: true, id: entry.id, food: entry.food }
}

async function execCreateTemplate(args: ToolArgs) {
  const exercises: WorkoutExerciseEntry[] = Array.isArray(args.exercises)
    ? (args.exercises as WorkoutExerciseEntry[])
    : []
  const template = await saveTemplate({
    name: String(args.name ?? 'Template'),
    exercises,
    notes: typeof args.notes === 'string' ? args.notes : undefined,
  })
  return { ok: true, id: template.id, name: template.name }
}

async function execUpdateNutritionGoals(args: ToolArgs) {
  const current = await getSetting<NutritionGoals>('nutrition-goals', DEFAULT_GOALS)
  const merged: NutritionGoals = {
    ...current,
    ...(typeof args.calories === 'number' ? { calories: args.calories } : {}),
    ...(typeof args.proteinG === 'number' ? { proteinG: args.proteinG } : {}),
    ...(typeof args.carbsG === 'number' ? { carbsG: args.carbsG } : {}),
    ...(typeof args.fatG === 'number' ? { fatG: args.fatG } : {}),
  }
  await setSetting('nutrition-goals', merged)
  return { ok: true, goals: merged }
}

async function execUpdateGoals(args: ToolArgs) {
  const profile = await getProfile()
  if (!profile) return { ok: false, reason: 'No profile set up yet.' }
  const goalWeightKg = typeof args.goalWeightLbs === 'number' ? args.goalWeightLbs / 2.20462 : profile.goalWeightKg
  await saveProfile({
    ...profile,
    goalWeightKg,
    goalDate: typeof args.goalDate === 'string' ? args.goalDate : profile.goalDate,
    activityLevel: typeof args.activityLevel === 'string'
      ? (args.activityLevel as typeof profile.activityLevel)
      : profile.activityLevel,
  })
  return { ok: true }
}

/** One consolidated snapshot instead of several narrow lookups — fewer tool
    round-trips, and the model sees the whole picture (or the whole absence
    of one) at once rather than piecing it together call by call. Every
    field is independently nullable/empty; a brand-new account with nothing
    logged yet gets back a mostly-empty object, never a thrown error. */
async function execGetHealthContext() {
  const today = localDateStr()
  const [profile, snapshots, todayTotals, recentWorkouts, workoutStreak, nutritionStreak] = await Promise.all([
    getProfile(),
    getLatestSnapshots(30),
    getDailyTotals(today),
    getRecentWorkouts(5),
    getCurrentWorkoutStreak(),
    getNutritionStreak(),
  ])

  const weightPoints: WeightPoint[] = snapshots
    .filter(s => s.weight != null)
    .map(s => ({ date: s.date, weightKg: s.weight! }))
  const trend = calcWeightTrend(weightPoints)
  const latestWeightKg = weightPoints[0]?.weightKg ?? null

  const nutritionDays = snapshots.filter(s => s.caloriesIn != null).slice(0, 7)
  const avg = (nums: number[]) => nums.length > 0 ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null

  const goals = await getSetting<NutritionGoals>('nutrition-goals', DEFAULT_GOALS)

  return {
    profile: profile ? {
      name: profile.name || null,
      heightCm: profile.heightCm ?? null,
      currentWeightLbs: profile.startWeightKg != null ? Math.round(kgToLbs(profile.startWeightKg)) : null,
      goalWeightLbs: profile.goalWeightKg != null ? Math.round(kgToLbs(profile.goalWeightKg)) : null,
      goalDate: profile.goalDate ?? null,
      activityLevel: profile.activityLevel ?? null,
    } : null,
    weightTrend: {
      latestLbs: latestWeightKg != null ? Math.round(kgToLbs(latestWeightKg) * 10) / 10 : null,
      dataPointsLast30Days: weightPoints.length,
      recentDirection: trend?.direction ?? null,        // 'up' | 'down' | 'flat' | null (null = not enough data)
      recentRateLbsPerWeek: trend ? Math.round(trend.rateLbsPerWeek * 10) / 10 : null,
    },
    nutrition: {
      calorieGoal: goals.calories,
      proteinGoalG: goals.proteinG,
      today: { calories: todayTotals.calories, proteinG: todayTotals.proteinG, entryCount: todayTotals.entryCount },
      last7DaysAvgCalories: avg(nutritionDays.map(s => s.caloriesIn!)),
      last7DaysAvgProteinG: avg(nutritionDays.filter(s => s.proteinG != null).map(s => s.proteinG!)),
      daysLoggedLast7: nutritionDays.length,
      currentLoggingStreak: nutritionStreak,
    },
    workouts: {
      currentStreak: workoutStreak,
      recent: recentWorkouts.map(w => ({ date: w.date, title: w.title, type: w.type, durationMin: w.durationMin })),
    },
  }
}

async function execNavigateTo(args: ToolArgs, ctx: { navigate: NavigateFunction }) {
  const screen = String(args.screen ?? '')
  const path = NAVIGABLE_ROUTES[screen]
  if (!path) return { ok: false, reason: 'Unknown screen.' }
  ctx.navigate(path)
  return { ok: true, path }
}

export const TOOL_EXECUTORS: Record<
  string,
  (args: ToolArgs, ctx: { navigate: NavigateFunction }) => Promise<unknown>
> = {
  log_workout: execLogWorkout,
  log_meal: execLogMeal,
  create_template: execCreateTemplate,
  update_nutrition_goals: execUpdateNutritionGoals,
  update_goals: execUpdateGoals,
  get_health_context: execGetHealthContext,
  navigate_to: execNavigateTo,
}
