import { getDB } from './index'
import type { NutritionEntry } from './index'
import { syncEngine } from './syncEngine'
import { showToast } from '../utils/toast'
import type { ChartPoint } from './timelineStore'

export type { NutritionEntry }

// ─── Write ────────────────────────────────────────────────────────────────────

export async function addNutritionEntry(entry: Omit<NutritionEntry, 'id' | 'createdAt'>): Promise<NutritionEntry> {
  const db = await getDB()
  const id = `nut_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const full: NutritionEntry = { ...entry, id, createdAt: new Date().toISOString() }
  await db.put('nutrition_entries', full)
  void syncEngine.queueWrite('nutrition_entries', 'upsert', full.id, full)
  showToast('Meal logged')
  return full
}

export async function deleteNutritionEntry(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('nutrition_entries', id)
  void syncEngine.queueWrite('nutrition_entries', 'delete', id, { id })
  showToast('Entry removed', 'info')
}

export async function updateNutritionEntry(id: string, updates: Partial<Omit<NutritionEntry, 'id' | 'createdAt'>>): Promise<void> {
  const db = await getDB()
  const existing = await db.get('nutrition_entries', id)
  if (!existing) return
  const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() }
  await db.put('nutrition_entries', updated)
  void syncEngine.queueWrite('nutrition_entries', 'upsert', id, updated)
  showToast('Entry updated')
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getEntriesForDate(date: string): Promise<NutritionEntry[]> {
  const db = await getDB()
  return db.getAllFromIndex('nutrition_entries', 'by-date', date)
}

export async function getNutritionEntryCount(): Promise<number> {
  const db = await getDB()
  return db.count('nutrition_entries')
}

export async function getDailyTotals(date: string): Promise<{
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  entryCount: number
}> {
  const entries = await getEntriesForDate(date)
  return {
    calories:   entries.reduce((n, e) => n + e.calories, 0),
    proteinG:   entries.reduce((n, e) => n + e.proteinG, 0),
    carbsG:     entries.reduce((n, e) => n + (e.carbsG ?? 0), 0),
    fatG:       entries.reduce((n, e) => n + (e.fatG ?? 0), 0),
    entryCount: entries.length,
  }
}

function dateNDaysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

/** All entries dated within the last N days (inclusive of today), fetched in one indexed range query. */
async function getEntriesSince(days: number): Promise<NutritionEntry[]> {
  const db = await getDB()
  const range = IDBKeyRange.bound(dateNDaysAgo(days - 1), dateNDaysAgo(0))
  return db.getAllFromIndex('nutrition_entries', 'by-date', range)
}

/** Daily calorie totals for the last N days (oldest first), for the trend chart. */
export async function getCalorieHistory(days: number): Promise<ChartPoint[]> {
  const entries = await getEntriesSince(days)
  const byDate = new Map<string, number>()
  for (const e of entries) byDate.set(e.date, (byDate.get(e.date) ?? 0) + e.calories)
  const points: ChartPoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const dateStr = dateNDaysAgo(i)
    points.push({ date: dateStr, value: byDate.get(dateStr) ?? 0 })
  }
  return points
}

/** Which of the given dates have at least one logged entry. Dates must be within the last 90 days. */
export async function getLoggedDatesInList(dates: string[]): Promise<Set<string>> {
  const logged = await getLoggedDates(90)
  return new Set(dates.filter(d => logged.has(d)))
}

/** Which of the last N days have at least one logged entry — used by the streak count, fetched in one query. */
async function getLoggedDates(days: number): Promise<Set<string>> {
  const entries = await getEntriesSince(days)
  return new Set(entries.map(e => e.date))
}

/** Consecutive days ending today (or yesterday, if nothing logged yet today) with a logged entry. */
export async function getCurrentStreak(): Promise<number> {
  const logged = await getLoggedDates(90)
  let streak = 0
  let i = logged.has(dateNDaysAgo(0)) ? 0 : 1
  while (logged.has(dateNDaysAgo(i))) { streak++; i++ }
  return streak
}

// ─── Your own foods, resurfaced as quick-add options ──────────────────────────

export interface CustomFood {
  food: string
  calories: number
  proteinG: number
  carbsG?: number
  fatG?: number
  quantity?: string
}

/**
 * Distinct foods you've logged yourself, most-recently-used first, with
 * built-in presets excluded so the same food never shows up twice. This is
 * the "Made By You" list — deliberately local, not a third-party food
 * database lookup.
 */
export async function getCustomFoods(limit = 20): Promise<CustomFood[]> {
  const db = await getDB()
  const all = await db.getAll('nutrition_entries')
  const presetNames = new Set(QUICK_FOODS.map(f => f.food.toLowerCase()))

  const byName = new Map<string, NutritionEntry>()
  for (const e of all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const key = e.food.trim().toLowerCase()
    if (!key || presetNames.has(key) || byName.has(key)) continue
    byName.set(key, e)
  }

  return Array.from(byName.values())
    .slice(0, limit)
    .map(e => ({
      food: e.food, calories: e.calories, proteinG: e.proteinG,
      carbsG: e.carbsG, fatG: e.fatG, quantity: e.quantity,
    }))
}

// ─── Quick-add presets ────────────────────────────────────────────────────────

export const QUICK_FOODS: Omit<NutritionEntry, 'id' | 'date' | 'mealType' | 'createdAt'>[] = [
  { food: 'Protein shake',         calories: 130, proteinG: 25, carbsG: 5,  fatG: 2,  quantity: '1 scoop' },
  { food: 'Chicken breast (6 oz)', calories: 270, proteinG: 50, carbsG: 0,  fatG: 6,  quantity: '6 oz' },
  { food: 'Greek yogurt (0%)',     calories: 100, proteinG: 17, carbsG: 6,  fatG: 0,  quantity: '1 cup' },
  { food: 'Eggs (2 large)',        calories: 140, proteinG: 12, carbsG: 1,  fatG: 10, quantity: '2 eggs' },
  { food: 'Salmon (6 oz)',         calories: 350, proteinG: 40, carbsG: 0,  fatG: 20, quantity: '6 oz' },
  { food: 'White rice (1 cup)',    calories: 210, proteinG: 4,  carbsG: 45, fatG: 0,  quantity: '1 cup cooked' },
  { food: 'Oatmeal (1 cup)',       calories: 150, proteinG: 5,  carbsG: 27, fatG: 3,  quantity: '1 cup dry' },
  { food: 'Banana',                calories: 105, proteinG: 1,  carbsG: 27, fatG: 0,  quantity: '1 medium' },
  { food: 'Cottage cheese',        calories: 200, proteinG: 28, carbsG: 8,  fatG: 4,  quantity: '1 cup' },
  { food: 'Steak (6 oz)',          calories: 380, proteinG: 46, carbsG: 0,  fatG: 22, quantity: '6 oz' },
  { food: 'Turkey breast (4 oz)',  calories: 140, proteinG: 28, carbsG: 0,  fatG: 2,  quantity: '4 oz' },
  { food: 'Peanut butter (2 tbsp)',calories: 190, proteinG: 7,  carbsG: 6,  fatG: 16, quantity: '2 tbsp' },
  { food: 'Almonds (1 oz)',        calories: 160, proteinG: 6,  carbsG: 6,  fatG: 14, quantity: '1 oz / 23 nuts' },
  { food: 'Sweet potato (medium)', calories: 130, proteinG: 3,  carbsG: 30, fatG: 0,  quantity: '1 medium' },
]
