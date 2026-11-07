import { supabase, isSupabaseConfigured } from './supabase'

export interface ParsedMealItem {
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
  items: ParsedMealItem[]
  /** A follow-up question when the AI can't tell what something was —
      shown alongside whatever best-guess items it already found, never
      instead of them. */
  clarification?: Clarification
  /** A soft, non-alarming note for the rare total-failure case. Never
      rendered as an error — paired with a one-tap manual-entry shortcut. */
  note?: string
}

export const isAiMealParsingAvailable = isSupabaseConfigured

const EMPTY_RESULT: MealParseResult = { items: [] }

function softFailure(note: string): MealParseResult {
  return { items: [], note }
}

async function invoke(fn: string, body: Record<string, unknown>): Promise<MealParseResult> {
  if (!supabase) return softFailure("AI estimation isn't available in this build — add it yourself below.")
  try {
    const { data, error } = await supabase.functions.invoke<MealParseResult>(fn, { body })
    if (error) return softFailure("Couldn't reach the AI estimator — add it yourself below.")
    if (!data) return EMPTY_RESULT
    return data
  } catch {
    return softFailure("Couldn't reach the AI estimator — add it yourself below.")
  }
}

/** Parses a free-text (or voice-dictated) meal description. Never throws —
    always returns something the UI can render (items, a clarifying
    question, or a soft note), per the "no dead-end error screens" rule. */
export async function parseMealDescription(description: string): Promise<MealParseResult> {
  const trimmed = description.trim()
  if (!trimmed) return softFailure('Describe what you ate first.')
  return invoke('parse-meal', { description: trimmed })
}

/** Re-asks with the user's answer to a clarifying question folded in. */
export async function refineMealDescription(
  description: string, priorQuestion: string, userAnswer: string,
): Promise<MealParseResult> {
  return invoke('parse-meal', { description, priorQuestion, userAnswer })
}

/** Analyzes a captured photo (food photo or receipt) — `imageDataUrl` is a
    `data:image/...;base64,...` string. Same never-throws contract. */
export async function analyzeMealPhoto(imageDataUrl: string): Promise<MealParseResult> {
  if (!imageDataUrl.startsWith('data:image/')) return softFailure("That photo didn't come through — try again.")
  return invoke('analyze-meal-photo', { image: imageDataUrl })
}

export async function refineMealPhoto(
  imageDataUrl: string, priorQuestion: string, userAnswer: string,
): Promise<MealParseResult> {
  return invoke('analyze-meal-photo', { image: imageDataUrl, priorQuestion, userAnswer })
}

/** Re-estimates a single already-logged item with extra detail the user
    supplies after the fact (e.g. "Coffee with milk" → "it's oat milk, large
    size") — works whether the item originally came from text or a photo,
    since by this point it's just re-describing one item in words. Routes
    through parse-meal (text, not vision) since no image round-trip is
    needed. Returns null if the refined description somehow produced
    nothing usable — the caller should just leave the item as it was. */
export async function refineOneItem(
  item: Pick<ParsedMealItem, 'food' | 'qtyNum' | 'qtyUnit'>, detail: string,
): Promise<ParsedMealItem | null> {
  const description = `${item.qtyNum} ${item.qtyUnit} of ${item.food}. Specific detail: ${detail}`
  const result = await parseMealDescription(description)
  return result.items[0] ?? null
}
