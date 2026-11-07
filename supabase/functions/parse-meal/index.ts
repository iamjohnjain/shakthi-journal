// Supabase Edge Function: parses a free-text (or voice-dictated) meal
// description into itemized food entries with estimated nutrition, using
// Groq's free-tier LLM API. The API key lives server-side only (set via
// `supabase secrets set GROQ_API_KEY=...`) so it's never exposed in the
// client bundle. No JWT verification — guest/local-only users can use this
// too (see supabase/config.toml: verify_jwt = false for this function).

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'llama-3.3-70b-versatile'

// Must match the app's QTY_UNITS list in NutritionPage.tsx.
const ALLOWED_UNITS = ['g', 'oz', 'scoop', 'cup', 'tbsp', 'piece', 'slice', 'serving', 'bottle', 'can']

const SYSTEM_PROMPT = `You are a nutrition estimation assistant inside a health-tracking app. The user describes, in their own words, what they ate or drank — sometimes one item, sometimes several in one sentence. Your job:

1. Split the description into distinct food/drink items. "4 slices of Costco pizza and a bottle of coke, drizzled 10g olive oil on top" is THREE items: the pizza, the coke, and the olive oil — even though the olive oil was "on" the pizza, it has different nutrition and should be logged separately.
2. For each item, write a short, specific, well-formatted name — fix the user's casual phrasing into something that reads cleanly in a food log (e.g. "cosco pizza" → "Costco Pepperoni Pizza Slice", not a verbatim copy of their words).
3. Give your best real-world nutrition estimate for each item using typical/known values for that specific food (e.g. a real Costco pizza slice is roughly 700-760 kcal — use actual knowledge of that item, not a generic guess). When the item is a recognizable named product (a branded snack bar, a specific restaurant item, a common packaged food), use what you actually know about that product's typical nutrition. When it's unfamiliar or ambiguous, make the most reasonable estimate for a typical version of that food and lower your confidence accordingly.
4. Quantity must be a plain number (qtyNum) and a unit from EXACTLY this list: ${ALLOWED_UNITS.join(', ')}. Pick whichever fits best — e.g. pizza slices → "slice", a can of soda → "can", a bottle → "bottle", loose weight → "g" or "oz", anything without a natural unit → "serving".
5. All nutrition values (calories, proteinG, carbsG, fatG) are for the TOTAL quantity stated (e.g. for "4 slices", give the calories for all 4 slices combined, not per slice).
6. Set "confidence" to "high" for well-known standard items, "medium" for reasonable estimates of less-specific items, "low" when you're genuinely guessing.

Respond with ONLY a JSON object, no markdown fences, no prose, in exactly this shape:
{"items": [{"food": string, "qtyNum": number, "qtyUnit": string, "calories": number, "proteinG": number, "carbsG": number, "fatG": number, "confidence": "high" | "medium" | "low"}]}

If the description doesn't describe any food or drink at all, respond with {"items": []}.`

interface ParsedItem {
  food: string
  qtyNum: number
  qtyUnit: string
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  confidence: 'high' | 'medium' | 'low'
}

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Headers': 'content-type, authorization, apikey',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

function jsonResponse(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  })
}

function sanitizeItem(raw: unknown): ParsedItem | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const food = typeof r.food === 'string' ? r.food.trim().slice(0, 120) : ''
  const qtyNum = typeof r.qtyNum === 'number' && isFinite(r.qtyNum) && r.qtyNum > 0 ? r.qtyNum : 1
  const qtyUnit = ALLOWED_UNITS.includes(String(r.qtyUnit)) ? String(r.qtyUnit) : 'serving'
  const calories = typeof r.calories === 'number' && isFinite(r.calories) ? Math.max(0, Math.round(r.calories)) : 0
  const proteinG = typeof r.proteinG === 'number' && isFinite(r.proteinG) ? Math.max(0, Math.round(r.proteinG)) : 0
  const carbsG   = typeof r.carbsG === 'number' && isFinite(r.carbsG) ? Math.max(0, Math.round(r.carbsG)) : 0
  const fatG     = typeof r.fatG === 'number' && isFinite(r.fatG) ? Math.max(0, Math.round(r.fatG)) : 0
  const confidence = r.confidence === 'high' || r.confidence === 'medium' || r.confidence === 'low' ? r.confidence : 'medium'
  if (!food || calories === 0) return null
  return { food, qtyNum, qtyUnit, calories, proteinG, carbsG, fatG, confidence }
}

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
    return jsonResponse({ error: 'AI meal parsing is not configured on the server yet.' }, 503, origin)
  }

  let description: string
  try {
    const body = await req.json()
    description = typeof body?.description === 'string' ? body.description.trim() : ''
  } catch {
    return jsonResponse({ error: 'Invalid request body.' }, 400, origin)
  }

  if (!description) {
    return jsonResponse({ error: 'Description is empty.' }, 400, origin)
  }
  if (description.length > 500) {
    return jsonResponse({ error: 'Description is too long — try breaking it into a shorter summary.' }, 400, origin)
  }

  try {
    const groqRes = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: description },
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
    })

    if (!groqRes.ok) {
      const errText = await groqRes.text().catch(() => '')
      console.error('Groq API error', groqRes.status, errText)
      return jsonResponse({ error: 'The AI estimator is temporarily unavailable. Try again in a moment.' }, 502, origin)
    }

    const groqData = await groqRes.json()
    const content: string = groqData?.choices?.[0]?.message?.content ?? ''

    let parsed: unknown
    try {
      // Defensive: strip markdown fences in case the model ignores the instruction.
      const cleaned = content.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
      parsed = JSON.parse(cleaned)
    } catch {
      return jsonResponse({ error: "Couldn't understand that — try describing it a bit differently." }, 502, origin)
    }

    const rawItems = Array.isArray((parsed as { items?: unknown })?.items) ? (parsed as { items: unknown[] }).items : []
    const items = rawItems.map(sanitizeItem).filter((i): i is ParsedItem => i !== null).slice(0, 12)

    if (items.length === 0) {
      return jsonResponse({ error: "Didn't catch any food or drink in that — try again with what you ate." }, 200, origin)
    }

    return jsonResponse({ items }, 200, origin)
  } catch (e) {
    console.error('parse-meal error', e)
    return jsonResponse({ error: 'Something went wrong estimating that meal. Try again.' }, 500, origin)
  }
})
