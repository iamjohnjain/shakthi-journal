import { supabase, isSupabaseConfigured } from './supabase'

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
  /** A soft, non-alarming note for the rare total-failure case. Never
      rendered as an error — paired with a one-tap manual-entry shortcut. */
  note?: string
}

export interface WorkoutPlanParseResult {
  days: ParsedPlanDay[]
  note?: string
}

export const isAiWorkoutParsingAvailable = isSupabaseConfigured

function softFailure(note: string): WorkoutParseResult {
  return { exercises: [], note }
}

function softPlanFailure(note: string): WorkoutPlanParseResult {
  return { days: [], note }
}

async function invoke<T>(fn: string, body: Record<string, unknown>, empty: T): Promise<T> {
  if (!supabase) return empty
  try {
    const { data, error } = await supabase.functions.invoke<T>(fn, { body })
    if (error || !data) return empty
    return data
  } catch {
    return empty
  }
}

/** Parses a free-text (or voice-dictated) exercise/set description. Never
    throws — always returns something the UI can render. */
export async function parseWorkoutDescription(description: string): Promise<WorkoutParseResult> {
  const trimmed = description.trim()
  if (!trimmed) return softFailure('Describe the exercise first.')
  return invoke('parse-workout-text', { description: trimmed },
    softFailure("Couldn't reach the AI estimator — add it yourself below."))
}

/** Analyzes a photo of gym equipment/a machine — `imageDataUrl` is a
    `data:image/...;base64,...` string. Same never-throws contract. */
export async function analyzeWorkoutPhoto(imageDataUrl: string): Promise<WorkoutParseResult> {
  if (!imageDataUrl.startsWith('data:image/')) return softFailure("That photo didn't come through — try again.")
  return invoke('analyze-workout-photo', { image: imageDataUrl },
    softFailure("Couldn't reach the AI estimator — add it yourself below."))
}

/** Parses a pasted block of text describing a (possibly multi-day) workout
    plan into structured days, for importing as templates. */
export async function parseWorkoutPlanText(text: string): Promise<WorkoutPlanParseResult> {
  const trimmed = text.trim()
  if (!trimmed) return softPlanFailure('Paste your plan first.')
  return invoke('parse-workout-plan', { text: trimmed },
    softPlanFailure("Couldn't reach the AI estimator — add your templates yourself below."))
}

/** Same as above, from a screenshot/photo of a written plan. */
export async function parseWorkoutPlanPhoto(imageDataUrl: string): Promise<WorkoutPlanParseResult> {
  if (!imageDataUrl.startsWith('data:image/')) return softPlanFailure("That image didn't come through — try again.")
  return invoke('parse-workout-plan', { image: imageDataUrl },
    softPlanFailure("Couldn't reach the AI estimator — add your templates yourself below."))
}
