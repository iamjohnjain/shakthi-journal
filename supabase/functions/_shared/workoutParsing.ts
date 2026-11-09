// Shared between parse-workout-text (voice/text), analyze-workout-photo
// (camera), and parse-workout-plan (template import) — same sanitization
// rules and never-throws contract as mealParsing.ts, adapted for exercises
// and sets instead of food items.

import { corsHeaders, jsonResponse } from './http.ts'
export { corsHeaders, jsonResponse }

export interface ParsedSet {
  reps: number
  weightLbs: number
}

export interface ParsedExercise {
  name: string
  sets: ParsedSet[]
}

export interface ParsedPlanDay {
  dayName: string
  exercises: ParsedExercise[]
}

export interface WorkoutParseResult {
  exercises: ParsedExercise[]
  note?: string
}

export interface WorkoutPlanParseResult {
  days: ParsedPlanDay[]
  note?: string
}

// The response shape for single-session logging (parse-workout-text, analyze-workout-photo).
export const EXERCISE_RESPONSE_SCHEMA_INSTRUCTIONS = `Respond with ONLY a JSON object, no markdown fences, no prose, in exactly this shape:
{"exercises": [{"name": string, "sets": [{"reps": number, "weightLbs": number}]}]}

Rules:
- One entry per distinct exercise identified. "3 sets of bench press at 135 for 8, then squats 225 for 5" is TWO exercises.
- "sets" should have one entry per actual set described/shown — if a general "3 sets of 10" is given with no per-set variation, repeat the same reps/weight 3 times.
- weightLbs is in POUNDS. Convert kg to lbs (kg * 2.20462, rounded to the nearest whole number) if given in kg. If no weight is mentioned or visible at all, use 0 — the user fills it in themselves.
- "name" should be a clean, standard exercise name — fix casual phrasing (e.g. "bench" → "Bench Press", "lat pulldowns" → "Lat Pulldown").
- If nothing resembling an exercise can be identified at all, return {"exercises": []} — never an error.`

// The response shape for multi-day plan import (parse-workout-plan).
export const PLAN_RESPONSE_SCHEMA_INSTRUCTIONS = `Respond with ONLY a JSON object, no markdown fences, no prose, in exactly this shape:
{"days": [{"dayName": string, "exercises": [{"name": string, "sets": [{"reps": number, "weightLbs": number}]}]}]}

Rules:
- Group exercises under whatever day/session labels are present in the source ("Day 1 - Push", "Monday", "Leg Day", "Workout A", etc.). If the source has NO day structure at all — just one flat list of exercises — return a single day, named after the program's title if one is given, otherwise "Workout".
- For each exercise's "sets", reflect the PRESCRIBED scheme: "3x8" means three entries each with reps:8. A rep RANGE ("8-12") uses the lower bound (8). weightLbs should be 0 unless the source explicitly states a weight — templates are normally weight-less, filled in during the actual workout.
- Preserve exercise order within each day exactly as given in the source.
- If genuinely nothing resembling a workout plan can be read from the source, return {"days": []} — never an error.`

export function sanitizeSet(raw: unknown): ParsedSet | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const reps = typeof r.reps === 'number' && isFinite(r.reps) && r.reps > 0 ? Math.round(r.reps) : 0
  const weightLbs = typeof r.weightLbs === 'number' && isFinite(r.weightLbs) && r.weightLbs >= 0 ? Math.round(r.weightLbs) : 0
  if (reps === 0) return null
  return { reps, weightLbs }
}

export function sanitizeExercise(raw: unknown): ParsedExercise | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const name = typeof r.name === 'string' ? r.name.trim().slice(0, 80) : ''
  if (!name) return null
  const rawSets = Array.isArray(r.sets) ? r.sets : []
  const sets = rawSets.map(sanitizeSet).filter((s): s is ParsedSet => s !== null).slice(0, 20)
  // An exercise with a recognizable name but no parseable sets still gets one
  // default set — better than silently dropping an exercise the model (or
  // the user) clearly named.
  return { name, sets: sets.length > 0 ? sets : [{ reps: 8, weightLbs: 0 }] }
}

export function sanitizePlanDay(raw: unknown): ParsedPlanDay | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const dayName = typeof r.dayName === 'string' ? r.dayName.trim().slice(0, 60) : ''
  if (!dayName) return null
  const rawExercises = Array.isArray(r.exercises) ? r.exercises : []
  const exercises = rawExercises.map(sanitizeExercise).filter((e): e is ParsedExercise => e !== null).slice(0, 30)
  if (exercises.length === 0) return null
  return { dayName, exercises }
}

/** Parses the model's raw JSON text into a sanitized WorkoutParseResult.
    Never throws — a malformed response just comes back empty with a soft
    note, same contract as parseModelContent in mealParsing.ts. */
export function parseExerciseListContent(content: string): WorkoutParseResult {
  try {
    const cleaned = content.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    const parsed = JSON.parse(cleaned) as { exercises?: unknown }
    const rawExercises = Array.isArray(parsed.exercises) ? parsed.exercises : []
    const exercises = rawExercises.map(sanitizeExercise).filter((e): e is ParsedExercise => e !== null).slice(0, 10)
    return { exercises }
  } catch {
    return { exercises: [], note: "Couldn't quite make sense of that — add it yourself below instead." }
  }
}

export function parsePlanContent(content: string): WorkoutPlanParseResult {
  try {
    const cleaned = content.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    const parsed = JSON.parse(cleaned) as { days?: unknown }
    const rawDays = Array.isArray(parsed.days) ? parsed.days : []
    const days = rawDays.map(sanitizePlanDay).filter((d): d is ParsedPlanDay => d !== null).slice(0, 14)
    return { days }
  } catch {
    return { days: [], note: "Couldn't quite make sense of that plan — add the days yourself below instead." }
  }
}

export function softFallbackExercises(note: string, origin: string | null): Response {
  return jsonResponse({ exercises: [], note } satisfies WorkoutParseResult, 200, origin)
}

export function softFallbackPlan(note: string, origin: string | null): Response {
  return jsonResponse({ days: [], note } satisfies WorkoutPlanParseResult, 200, origin)
}
