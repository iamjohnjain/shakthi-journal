// Supabase Edge Function: parses a free-text (or voice-dictated) description
// of exercises/sets/reps/weight into structured workout entries, using
// Groq's free-tier LLM API. Same no-hard-error contract as parse-meal (see
// that function's header) — always 200 with { exercises, note? }.

import {
  EXERCISE_RESPONSE_SCHEMA_INSTRUCTIONS, parseExerciseListContent, corsHeaders, jsonResponse, softFallbackExercises,
} from '../_shared/workoutParsing.ts'
import { callGroq, GroqCallError } from '../_shared/groq.ts'

// Shares the same free-tier model lineup/override as parse-meal.
const GROQ_MODEL = Deno.env.get('GROQ_TEXT_MODEL') || 'openai/gpt-oss-120b'

const SYSTEM_PROMPT = `You are a workout-logging assistant inside a fitness-tracking app. The user describes, in their own words (often dictated by voice mid-workout), what exercise(s) and set(s) they just did. Your job:

1. Split the description into distinct exercises. "3 sets of bench press at 135 for 8, then squats 225 for 5 reps" is TWO exercises.
2. Clean up casual phrasing into a standard exercise name you'd recognize from any gym program (e.g. "bench" -> "Bench Press", "lat pulldowns" -> "Lat Pulldown", "db curls" -> "Dumbbell Bicep Curl").
3. Capture every set mentioned, with its actual reps and weight — don't collapse "135 for 8, 145 for 6, 155 for 5" (a working set progression) into one set.

${EXERCISE_RESPONSE_SCHEMA_INSTRUCTIONS}`

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, origin)
  }

  const apiKey = Deno.env.get('GROQ_API_KEY')
  if (!apiKey) {
    return softFallbackExercises("AI workout logging isn't set up yet — add it yourself below for now.", origin)
  }

  let description: string
  try {
    const body = await req.json()
    description = typeof body?.description === 'string' ? body.description.trim() : ''
  } catch {
    return softFallbackExercises('Add it yourself below for now.', origin)
  }

  if (!description) {
    return softFallbackExercises('Describe the exercise first.', origin)
  }
  if (description.length > 500) {
    description = description.slice(0, 500)
  }

  try {
    const content = await callGroq({ apiKey, model: GROQ_MODEL, systemPrompt: SYSTEM_PROMPT, userText: description })
    const result = parseExerciseListContent(content)
    return jsonResponse(result, 200, origin)
  } catch (e) {
    if (e instanceof GroqCallError) {
      console.error('Groq API error', e.message)
      return softFallbackExercises("Couldn't reach the estimator just now — add it yourself below.", origin)
    }
    console.error('parse-workout-text error', e)
    return softFallbackExercises('Something went wrong on that one — add it yourself below.', origin)
  }
})
