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
import { saveWorkout, getRecentWorkouts } from '../db/workoutStore'
import type { WorkoutExerciseEntry } from '../db'
import { addNutritionEntry, getDailyTotals, getEntriesForDate } from '../db/nutritionStore'
import { saveTemplate } from '../db/templateStore'
import { getProfile, saveProfile } from '../db/profileStore'
import { getSetting, setSetting } from '../db'
import type { NutritionGoals } from '../db'
import { DEFAULT_GOALS } from '../hooks/useNutritionSettings'
import { localDateStr } from '../data/config'

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
      name: 'get_recent_workouts',
      description: "Look up the user's most recent logged workouts.",
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'How many to return, default 5.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_todays_nutrition',
      description: "Look up what the user has logged for food today, and their totals so far.",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_profile_summary',
      description: "Look up the user's profile: height, current/goal weight, activity level, goals.",
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

async function execGetRecentWorkouts(args: ToolArgs) {
  const limit = typeof args.limit === 'number' ? args.limit : 5
  const workouts = await getRecentWorkouts(limit)
  return workouts.map(w => ({ date: w.date, title: w.title, type: w.type, durationMin: w.durationMin }))
}

async function execGetTodaysNutrition() {
  const today = localDateStr()
  const [entries, totals] = await Promise.all([getEntriesForDate(today), getDailyTotals(today)])
  return {
    totals,
    entries: entries.map(e => ({ mealType: e.mealType, food: e.food, calories: e.calories, proteinG: e.proteinG })),
  }
}

async function execGetProfileSummary() {
  const profile = await getProfile()
  if (!profile) return { ok: false, reason: 'No profile set up yet.' }
  return {
    name: profile.name,
    heightCm: profile.heightCm,
    startWeightKg: profile.startWeightKg,
    goalWeightKg: profile.goalWeightKg,
    goalDate: profile.goalDate,
    activityLevel: profile.activityLevel,
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
  get_recent_workouts: execGetRecentWorkouts,
  get_todays_nutrition: execGetTodaysNutrition,
  get_profile_summary: execGetProfileSummary,
  navigate_to: execNavigateTo,
}
