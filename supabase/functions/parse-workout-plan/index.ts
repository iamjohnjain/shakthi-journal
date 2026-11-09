// Supabase Edge Function: reads a (possibly multi-day) workout program from
// pasted text OR a photographed/screenshotted/scanned plan, returning one or
// more structured days of exercises so they can be saved as workout
// templates. Same no-hard-error contract as the other AI functions —
// always 200 with { days, note? }. Accepts `{ text }`, `{ image }` (single,
// kept for backward compatibility), or `{ images: string[] }` (one entry
// per page, for a multi-page scanned document).

import {
  PLAN_RESPONSE_SCHEMA_INSTRUCTIONS, parsePlanContent, corsHeaders, jsonResponse, softFallbackPlan,
} from '../_shared/workoutParsing.ts'
import { callGroq, GroqCallError } from '../_shared/groq.ts'

const GROQ_TEXT_MODEL   = Deno.env.get('GROQ_TEXT_MODEL')   || 'openai/gpt-oss-120b'
const GROQ_VISION_MODEL = Deno.env.get('GROQ_VISION_MODEL') || 'qwen/qwen3.8-27b'

const MAX_IMAGE_BYTES       = 6_000_000  // ~6MB base64 payload ceiling, per image
const MAX_IMAGES            = 10         // matches the client's scanned-PDF page cap
const MAX_TEXT_CHARS        = 40_000     // generous — a real trainer plan, even a long one,
                                          // comfortably fits; this is a safety ceiling, not a
                                          // target, so legitimate multi-day plans aren't cut off
                                          // partway through and lose their later days

const SYSTEM_PROMPT = `You are a workout-plan import assistant inside a fitness-tracking app. The user is handing you a workout PROGRAM — not a single session, but a plan that may span multiple days/workouts — either as pasted text or one-or-more photos/screenshots of one (a notes app, a spreadsheet, PDF pages, a handwritten page, a text message thread, a saved Instagram caption, etc.). Your job is to read it faithfully and turn it into structured days of exercises, not to invent or improve the program.

${PLAN_RESPONSE_SCHEMA_INSTRUCTIONS}

If given images: read ALL visible text carefully across EVERY image provided, including small print — workout plans are often dense, and when multiple images are given they are sequential pages of the SAME plan, so a day that starts on one page may continue or a new day may begin on the next. Combine them into one complete set of days, not separate plans. If none of the images show anything resembling a workout plan, return {"days": []}.`

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
    return softFallbackPlan("AI plan import isn't set up yet — add your templates yourself for now.", origin)
  }

  let text: string | undefined
  let images: string[] = []
  try {
    const body = await req.json()
    text = typeof body?.text === 'string' ? body.text.trim() : undefined
    if (Array.isArray(body?.images)) {
      images = body.images.filter((i: unknown): i is string => typeof i === 'string')
    } else if (typeof body?.image === 'string') {
      images = [body.image]
    }
  } catch {
    return softFallbackPlan('Add your templates yourself for now.', origin)
  }

  images = images.filter(i => i.startsWith('data:image/')).slice(0, MAX_IMAGES)
  const hasImages = images.length > 0

  if (!text && !hasImages) {
    return softFallbackPlan('Paste your plan or add a file first.', origin)
  }
  const oversizedImage = images.find(i => i.length > MAX_IMAGE_BYTES)
  if (oversizedImage) {
    return softFallbackPlan('One of those pages is a bit large — try again, or paste the text instead.', origin)
  }
  if (text && text.length > MAX_TEXT_CHARS) {
    text = text.slice(0, MAX_TEXT_CHARS)
  }

  const userText = hasImages
    ? (images.length > 1
        ? `Read this workout plan across these ${images.length} sequential pages and structure it.`
        : 'Read this workout plan from the image and structure it.')
    : (text as string)

  try {
    const content = await callGroq({
      apiKey,
      model: hasImages ? GROQ_VISION_MODEL : GROQ_TEXT_MODEL,
      systemPrompt: SYSTEM_PROMPT,
      userText,
      imageDataUrls: hasImages ? images : undefined,
      maxTokens: 8000,
    })
    const result = parsePlanContent(content)
    return jsonResponse(result, 200, origin)
  } catch (e) {
    if (e instanceof GroqCallError) {
      console.error('Groq API error', e.message)
      return softFallbackPlan("Couldn't reach the estimator just now — add your templates yourself below.", origin)
    }
    console.error('parse-workout-plan error', e)
    return softFallbackPlan('Something went wrong on that one — add your templates yourself below.', origin)
  }
})
