// Supabase Edge Function: reads a (possibly multi-day) workout program from
// pasted text OR a photographed/screenshotted plan, returning one or more
// structured days of exercises so they can be saved as workout templates.
// Same no-hard-error contract as the other AI functions — always 200 with
// { days, note? }. Accepts either `{ text }` or `{ image }` in the body.

import {
  PLAN_RESPONSE_SCHEMA_INSTRUCTIONS, parsePlanContent, corsHeaders, jsonResponse, softFallbackPlan,
} from '../_shared/workoutParsing.ts'
import { callGroq, GroqCallError } from '../_shared/groq.ts'

const GROQ_TEXT_MODEL   = Deno.env.get('GROQ_TEXT_MODEL')   || 'openai/gpt-oss-120b'
const GROQ_VISION_MODEL = Deno.env.get('GROQ_VISION_MODEL') || 'qwen/qwen3.8-27b'

const MAX_IMAGE_BYTES = 6_000_000 // ~6MB base64 payload ceiling

const SYSTEM_PROMPT = `You are a workout-plan import assistant inside a fitness-tracking app. The user is handing you a workout PROGRAM — not a single session, but a plan that may span multiple days/workouts — either as pasted text or a photo/screenshot of one (a notes app, a spreadsheet, a PDF page, a handwritten page, a text message thread, a saved Instagram caption, etc.). Your job is to read it faithfully and turn it into structured days of exercises, not to invent or improve the program.

${PLAN_RESPONSE_SCHEMA_INSTRUCTIONS}

If given an image: read ALL visible text carefully, including small print — workout plans are often dense. If the image doesn't show anything resembling a workout plan at all, return {"days": []}.`

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
  let imageDataUrl: string | undefined
  try {
    const body = await req.json()
    text = typeof body?.text === 'string' ? body.text.trim() : undefined
    imageDataUrl = typeof body?.image === 'string' ? body.image : undefined
  } catch {
    return softFallbackPlan('Add your templates yourself for now.', origin)
  }

  const hasImage = !!imageDataUrl && imageDataUrl.startsWith('data:image/')
  if (!text && !hasImage) {
    return softFallbackPlan('Paste your plan or add a screenshot first.', origin)
  }
  if (imageDataUrl && imageDataUrl.length > MAX_IMAGE_BYTES) {
    return softFallbackPlan('That screenshot is a bit large — try again, or add it yourself below.', origin)
  }
  if (text && text.length > 8000) {
    text = text.slice(0, 8000)
  }

  const userText = hasImage
    ? 'Read this workout plan from the image and structure it.'
    : (text as string)

  try {
    const content = await callGroq({
      apiKey,
      model: hasImage ? GROQ_VISION_MODEL : GROQ_TEXT_MODEL,
      systemPrompt: SYSTEM_PROMPT,
      userText,
      imageDataUrl: hasImage ? imageDataUrl : undefined,
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
