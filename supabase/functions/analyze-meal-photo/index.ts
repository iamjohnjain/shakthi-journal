// Supabase Edge Function: analyzes a photo (food photo OR a receipt) and
// returns itemized, estimated nutrition — same response contract and
// no-hard-error philosophy as parse-meal (see that function's header).
// The API key is server-side only, set via `supabase secrets set GROQ_API_KEY=...`.

import {
  RESPONSE_SCHEMA_INSTRUCTIONS, parseModelContent, corsHeaders, jsonResponse, softFallback,
} from '../_shared/mealParsing.ts'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
// Vision-capable models are a much shorter, faster-moving list on Groq's free
// tier than text models — override via `supabase secrets set GROQ_VISION_MODEL=...`
// if this default gets retired. (Default: current Groq free-tier vision model.)
const GROQ_VISION_MODEL = Deno.env.get('GROQ_VISION_MODEL') || 'qwen/qwen3.8-27b'

const MAX_IMAGE_BYTES = 6_000_000 // ~6MB base64 payload ceiling

const SYSTEM_PROMPT = `You are a nutrition estimation assistant inside a health-tracking app, looking at a single photo the user just took. The photo is ONE of these — figure out which:

1. A RECEIPT — an itemized list of purchases (grocery or restaurant). Read the line items that are actually food/drink (skip tax, totals, non-food items like paper towels), and estimate nutrition per item based on what it typically is. A receipt line like "PEPPERONI PIZZA 12IN" means a whole 12" pepperoni pizza was purchased — use your judgement on a reasonable per-item serving (e.g. if it's clearly a whole pizza, estimate for one or two slices as a likely single serving, and name it accordingly, e.g. "Pepperoni Pizza, 2 slices"). Take size and customization notes on the line (16oz, "regular sugar", "whole milk", extra shot, etc.) seriously — they change the estimate a lot and the receipt is telling you exactly what was ordered, not a guess. A specialty/ethnic drink you don't recognize by name (karak chai, Thai tea, horchata, etc.) is very often milk- and sugar-heavy even if the name alone doesn't sound like it — don't default to treating it like a plain tea or coffee.
2. A PHOTO OF FOOD OR DRINK — plated food, packaging, a restaurant meal, a snack, etc. Identify what's visible and estimate portions from what's shown in the frame (plate size, container size, etc. as visual cues).
3. A BARCODE OR PRODUCT LABEL close-up with no food actually visible — if you can read a product name/brand on packaging, use that; otherwise this is the one case where it's fine to return {"items": [], "clarification": null} since there's nothing to estimate from.

If the photo doesn't show food, a receipt, or a food package at all (e.g. a random photo), return {"items": [], "clarification": null} — don't force a guess onto something that isn't food.

${RESPONSE_SCHEMA_INSTRUCTIONS}

Extra guidance for photos specifically: if you can see there's a sandwich/wrap but can't tell what's inside, or a bowl of soup/curry/stew where the specific dish matters a lot for nutrition, give your best visual-only estimate as an item AND set "clarification" asking what it is (e.g. "What's in the sandwich?" with options like "Turkey & cheese", "Ham & cheese", "PB&J", "Club", "Veggie") — don't just guess silently on something that could be wildly different depending on the filling.`

function corsOrigin(req: Request): string | null {
  return req.headers.get('origin')
}

Deno.serve(async (req: Request) => {
  const origin = corsOrigin(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, origin)
  }

  const apiKey = Deno.env.get('GROQ_API_KEY')
  if (!apiKey) {
    return softFallback("Photo analysis isn't set up yet — add this one yourself below.", origin)
  }

  let imageDataUrl: string
  let priorQuestion: string | undefined
  let userAnswer: string | undefined
  try {
    const body = await req.json()
    imageDataUrl = typeof body?.image === 'string' ? body.image : ''
    priorQuestion = typeof body?.priorQuestion === 'string' ? body.priorQuestion.trim().slice(0, 200) : undefined
    userAnswer = typeof body?.userAnswer === 'string' ? body.userAnswer.trim().slice(0, 200) : undefined
  } catch {
    return softFallback('Add this one yourself below for now.', origin)
  }

  if (!imageDataUrl.startsWith('data:image/')) {
    return softFallback("That didn't come through right — add this one yourself below.", origin)
  }
  if (imageDataUrl.length > MAX_IMAGE_BYTES) {
    return softFallback('That photo is a bit large — try again, or add this one yourself below.', origin)
  }

  const userText = priorQuestion && userAnswer
    ? `You asked: "${priorQuestion}"\nUser's answer: "${userAnswer}"\nUse this to refine your estimate from the same photo.`
    : 'What food, drink, or receipt items are in this photo? Estimate nutrition per item.'

  try {
    const groqRes = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_VISION_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: userText },
              { type: 'image_url', image_url: { url: imageDataUrl } },
            ],
          },
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
    })

    if (!groqRes.ok) {
      const errText = await groqRes.text().catch(() => '')
      console.error('Groq vision API error', groqRes.status, errText)
      return softFallback("Couldn't read that photo just now — add it yourself below.", origin)
    }

    const groqData = await groqRes.json()
    const content: string = groqData?.choices?.[0]?.message?.content ?? ''
    const result = parseModelContent(content)

    return jsonResponse(result, 200, origin)
  } catch (e) {
    console.error('analyze-meal-photo error', e)
    return softFallback('Something went wrong reading that photo — add it yourself below.', origin)
  }
})
