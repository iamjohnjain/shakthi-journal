// Supabase Edge Function: analyzes a photo of gym equipment/a machine and
// identifies the exercise, proposing a sensible starting set — same
// response contract and no-hard-error philosophy as analyze-meal-photo (see
// that function's header). Always 200 with { exercises, note? }.

import {
  EXERCISE_RESPONSE_SCHEMA_INSTRUCTIONS, parseExerciseListContent, corsHeaders, jsonResponse, softFallbackExercises,
} from '../_shared/workoutParsing.ts'
import { callGroq, GroqCallError } from '../_shared/groq.ts'

// Shares the same free-tier vision model lineup/override as analyze-meal-photo.
const GROQ_VISION_MODEL = Deno.env.get('GROQ_VISION_MODEL') || 'qwen/qwen3.8-27b'

const MAX_IMAGE_BYTES = 6_000_000 // ~6MB base64 payload ceiling

const SYSTEM_PROMPT = `You are a workout-logging assistant inside a fitness-tracking app, looking at a photo the user just took of a piece of gym equipment or a machine, so they don't have to type the exercise name manually. Your job:

1. Identify the equipment/machine and the exercise it's used for (read any visible name plate/brand/label — most commercial gym machines have one — and use the visible shape/mechanism as a fallback: a seated row machine, a lat pulldown tower, a leg press sled, a cable crossover station, a barbell rack set up for squats, dumbbells laid out on a bench, etc.).
2. Propose ONE exercise entry with a single starting set using conventional defaults for that movement (most machine/isolation exercises: 10-12 reps; most compound barbell/free-weight lifts: 6-8 reps).
3. Only set a nonzero weightLbs if an actual number is visibly readable on a weight stack pin, loaded plates, or a digital display in the photo — do not guess a plausible-sounding weight from the equipment type alone, since that's specific to the user's own strength, not the machine. When in doubt, use 0 and let the user fill it in.

If the photo doesn't show gym equipment, a machine, weights, or anything exercise-related at all (e.g. a random photo), return {"exercises": []} — don't force a guess onto something that isn't a workout.

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
    return softFallbackExercises("Photo analysis isn't set up yet — add this one yourself below.", origin)
  }

  let imageDataUrl: string
  try {
    const body = await req.json()
    imageDataUrl = typeof body?.image === 'string' ? body.image : ''
  } catch {
    return softFallbackExercises('Add this one yourself below for now.', origin)
  }

  if (!imageDataUrl.startsWith('data:image/')) {
    return softFallbackExercises("That didn't come through right — add this one yourself below.", origin)
  }
  if (imageDataUrl.length > MAX_IMAGE_BYTES) {
    return softFallbackExercises('That photo is a bit large — try again, or add this one yourself below.', origin)
  }

  try {
    const content = await callGroq({
      apiKey,
      model: GROQ_VISION_MODEL,
      systemPrompt: SYSTEM_PROMPT,
      userText: 'What exercise/machine is this? Propose one exercise entry with a starting set.',
      imageDataUrl,
    })
    const result = parseExerciseListContent(content)
    return jsonResponse(result, 200, origin)
  } catch (e) {
    if (e instanceof GroqCallError) {
      console.error('Groq vision API error', e.message)
      return softFallbackExercises("Couldn't read that photo just now — add it yourself below.", origin)
    }
    console.error('analyze-workout-photo error', e)
    return softFallbackExercises('Something went wrong reading that photo — add it yourself below.', origin)
  }
})
