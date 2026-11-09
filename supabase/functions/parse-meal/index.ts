// Supabase Edge Function: parses a free-text (or voice-dictated) meal
// description into itemized food entries with estimated nutrition, using
// Groq's free-tier LLM API. The API key lives server-side only (set via
// `supabase secrets set GROQ_API_KEY=...`) so it's never exposed in the
// client bundle. No JWT verification — guest/local-only users can use this
// too (see supabase/config.toml: verify_jwt = false for this function).
//
// Contract: this never returns a blocking "error" for anything recoverable —
// always a 200 with { items, clarification?, note? }. The client is built to
// show a best-guess result (or a friendly follow-up question) rather than an
// error screen, since getting stuck is worse than getting a rough estimate.

import {
  RESPONSE_SCHEMA_INSTRUCTIONS, parseModelContent, corsHeaders, jsonResponse, softFallback,
} from '../_shared/mealParsing.ts'
import { callGroq, GroqCallError } from '../_shared/groq.ts'

// Groq's free-tier model lineup changes without much notice — override via
// `supabase secrets set GROQ_TEXT_MODEL=...` if this default gets retired.
const GROQ_MODEL = Deno.env.get('GROQ_TEXT_MODEL') || 'openai/gpt-oss-120b'

const SYSTEM_PROMPT = `You are a nutrition estimation assistant inside a health-tracking app. The user describes, in their own words, what they ate or drank — sometimes one item, sometimes several in one sentence. Your job:

1. Split the description into distinct food/drink items. "4 slices of Costco pizza and a bottle of coke, drizzled 10g olive oil on top" is THREE items: the pizza, the coke, and the olive oil — even though the olive oil was "on" the pizza, it has different nutrition and should be logged separately.
2. For each item, write a short, specific, well-formatted name — fix the user's casual phrasing into something that reads cleanly in a food log (e.g. "cosco pizza" → "Costco Pepperoni Pizza Slice", not a verbatim copy of their words).
3. Give your best real-world nutrition estimate for each item using typical/known values for that specific food (e.g. a real Costco pizza slice is roughly 700-760 kcal — use actual knowledge of that item, not a generic guess). When the item is a recognizable named product (a branded snack bar, a specific restaurant item, a common packaged food), use what you actually know about that product's typical nutrition.

${RESPONSE_SCHEMA_INSTRUCTIONS}`

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
    return softFallback("AI meal description isn't set up yet — add it yourself below for now.", origin)
  }

  let description: string
  let priorQuestion: string | undefined
  let userAnswer: string | undefined
  try {
    const body = await req.json()
    description = typeof body?.description === 'string' ? body.description.trim() : ''
    // Optional follow-up turn: the client resends the original description
    // plus the clarifying question it was asked and the user's answer, so
    // the model can fold that into a refined estimate instead of starting over.
    priorQuestion = typeof body?.priorQuestion === 'string' ? body.priorQuestion.trim().slice(0, 200) : undefined
    userAnswer = typeof body?.userAnswer === 'string' ? body.userAnswer.trim().slice(0, 200) : undefined
  } catch {
    return softFallback('Add it yourself below for now.', origin)
  }

  if (!description) {
    return softFallback('Describe what you ate first.', origin)
  }
  if (description.length > 500) {
    description = description.slice(0, 500)
  }

  const userContent = priorQuestion && userAnswer
    ? `Original description: "${description}"\nYou asked: "${priorQuestion}"\nUser's answer: "${userAnswer}"\nNow give your best final estimate using this extra detail.`
    : description

  try {
    const content = await callGroq({ apiKey, model: GROQ_MODEL, systemPrompt: SYSTEM_PROMPT, userText: userContent })
    const result = parseModelContent(content)
    return jsonResponse(result, 200, origin)
  } catch (e) {
    if (e instanceof GroqCallError) {
      console.error('Groq API error', e.message)
      return softFallback("Couldn't reach the estimator just now — add it yourself below.", origin)
    }
    console.error('parse-meal error', e)
    return softFallback('Something went wrong on that one — add it yourself below.', origin)
  }
})
