import { getDB } from './index'
import type { NutritionEntry } from './index'
import { syncEngine } from './syncEngine'
import { showToast } from '../utils/toast'

export type { NutritionEntry }

// ─── Write ────────────────────────────────────────────────────────────────────

export async function addNutritionEntry(entry: Omit<NutritionEntry, 'id' | 'createdAt'>): Promise<NutritionEntry> {
  const db = await getDB()
  const id = `nut_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const full: NutritionEntry = { ...entry, id, createdAt: new Date().toISOString() }
  await db.put('nutrition_entries', full)
  void syncEngine.queueWrite('nutrition_entries', 'upsert', full.id, full)
  showToast('Meal logged')
  // Check protein streak achievements asynchronously
  void import('../engine/achievementEngine').then(m => m.checkAndAwardAchievements())
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
