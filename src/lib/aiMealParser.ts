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

export const isAiMealParsingAvailable = isSupabaseConfigured

/**
 * Sends a free-text (or voice-dictated) meal description to the `parse-meal`
 * edge function and returns itemized, estimated nutrition for review before
 * logging. Never logs anything itself — the caller always shows these for
 * confirmation/editing first.
 */
export async function parseMealDescription(description: string): Promise<ParsedMealItem[]> {
  const trimmed = description.trim()
  if (!trimmed) throw new Error('Describe what you ate first.')
  if (!supabase) throw new Error('AI meal description isn\'t available in this build.')

  const { data, error } = await supabase.functions.invoke<{ items?: ParsedMealItem[]; error?: string }>(
    'parse-meal',
    { body: { description: trimmed } },
  )

  if (error) {
    throw new Error('Could not reach the AI estimator — check your connection and try again.')
  }
  if (data?.error) {
    throw new Error(data.error)
  }
  if (!data?.items || data.items.length === 0) {
    throw new Error("Didn't catch any food in that — try describing it a bit differently.")
  }
  return data.items
}
