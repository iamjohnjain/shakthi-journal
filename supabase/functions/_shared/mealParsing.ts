// Shared between parse-meal (text/voice) and analyze-meal-photo (camera) —
// same response contract so the client handles both identically.

export const ALLOWED_UNITS = ['g', 'oz', 'scoop', 'cup', 'tbsp', 'piece', 'slice', 'serving', 'bottle', 'can']

export interface ParsedItem {
  food: string
  qtyNum: number
  qtyUnit: string
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  confidence: 'high' | 'medium' | 'low'
}

export interface Clarification {
  question: string
  options: string[]
}

export interface MealParseResult {
  items: ParsedItem[]
  /** A follow-up question when the AI genuinely can't tell what something was
      — shown alongside whatever best-guess items it already has, never
      instead of them, and never as a blocking error. */
  clarification?: Clarification
  /** A soft, non-alarming note for the rare total-failure case — phrased so
      the client can show it next to a "log it yourself" shortcut rather
      than as a scary error banner. Never set alongside a real result. */
  note?: string
}

// The response shape every system prompt should be instructed to produce.
export const RESPONSE_SCHEMA_INSTRUCTIONS = `Respond with ONLY a JSON object, no markdown fences, no prose, in exactly this shape:
{"items": [{"food": string, "qtyNum": number, "qtyUnit": string, "calories": number, "proteinG": number, "carbsG": number, "fatG": number, "confidence": "high" | "medium" | "low"}], "clarification": {"question": string, "options": string[]} | null}

Rules for "items":
- ALWAYS include your best-guess estimate for every item you can identify, even a vague one (e.g. "Sandwich (type unclear)" with a reasonable generic estimate) — never leave items empty just because you're unsure of specifics. Giving a usable estimate the user can correct is always better than giving nothing.
- Quantity must be a plain number (qtyNum) and a unit from EXACTLY this list: ${ALLOWED_UNITS.join(', ')}.
- Nutrition values are for the TOTAL stated quantity, not per unit.
- "confidence": "high" for well-known standard items, "medium" for reasonable estimates of less-specific items, "low" when genuinely guessing.

Rules for "clarification" — set it (non-null) ONLY when a real ambiguity would meaningfully change the nutrition estimate, for example:
- A dish that varies a lot by type/filling (e.g. "a sandwich", "some soup", "a curry", "a salad") with no further detail — ask what kind, with 3-5 concrete tappable options plus an implicit "type your own" (don't include "Other" or "type your own" as an option string — the client adds that itself).
- A dish where restaurant/store-bought/homemade would change the estimate meaningfully — ask, with those as options.
Do NOT ask for clarification on things that are already clear enough to estimate well (e.g. "a bottle of coke," "4 slices of pepperoni pizza," "10g of olive oil" need no follow-up). When in doubt, prefer giving a confident best-guess estimate over asking — only ask when it would genuinely change the numbers a lot.

If nothing resembling food or drink is identifiable at all, return {"items": [], "clarification": null} — never an error.`

export function sanitizeItem(raw: unknown): ParsedItem | null {
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

export function sanitizeClarification(raw: unknown): Clarification | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const question = typeof r.question === 'string' ? r.question.trim().slice(0, 200) : ''
  if (!question) return undefined
  const options = Array.isArray(r.options)
    ? r.options.filter((o): o is string => typeof o === 'string').map(o => o.trim().slice(0, 60)).filter(Boolean).slice(0, 6)
    : []
  return { question, options }
}

/** Parses the model's raw JSON text into a sanitized MealParseResult. Never
    throws — a malformed response just comes back as an empty result with a
    soft note, so the caller can always respond 200 with something usable. */
export function parseModelContent(content: string): MealParseResult {
  try {
    const cleaned = content.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    const parsed = JSON.parse(cleaned) as { items?: unknown; clarification?: unknown }
    const rawItems = Array.isArray(parsed.items) ? parsed.items : []
    const items = rawItems.map(sanitizeItem).filter((i): i is ParsedItem => i !== null).slice(0, 12)
    const clarification = sanitizeClarification(parsed.clarification)
    return { items, clarification }
  } catch {
    return { items: [], note: "Couldn't quite make sense of that one — add it yourself below and it'll remember for next time." }
  }
}

export function corsHeaders(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    // supabase-js's functions.invoke() sends x-client-info (and sometimes
    // x-supabase-api-version) on every call — missing either from this list
    // makes the browser's CORS preflight fail silently before the request
    // ever reaches this function. curl/Postman don't enforce CORS, so this
    // class of bug only shows up in an actual browser.
    'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info, x-supabase-api-version',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

export function jsonResponse(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  })
}

/** Always 200 with a usable (if empty) result — the client never needs to
    render an "error" state for anything this returns. */
export function softFallback(note: string, origin: string | null): Response {
  return jsonResponse({ items: [], note } satisfies MealParseResult, 200, origin)
}
