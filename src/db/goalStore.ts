import { getSetting, setSetting } from './index'

export type GoalCategory = 'strength' | 'weight' | 'nutrition' | 'cardio' | 'habit' | 'milestone'

export interface UserGoal {
  id: string
  emoji: string
  title: string
  description?: string
  category: GoalCategory
  targetValue?: number
  currentValue?: number
  unit?: string
  targetDate?: string  // YYYY-MM-DD
  completed?: boolean
  completedAt?: string
  createdAt: string
  updatedAt: string
}

const KEY = 'user-goals'

export async function getUserGoals(): Promise<UserGoal[]> {
  return getSetting<UserGoal[]>(KEY, [])
}

export async function saveUserGoal(goal: Omit<UserGoal, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserGoal> {
  const existing = await getUserGoals()
  const now = new Date().toISOString()
  const newGoal: UserGoal = { ...goal, id: crypto.randomUUID(), createdAt: now, updatedAt: now }
  await setSetting(KEY, [newGoal, ...existing])
  return newGoal
}

export async function updateUserGoal(id: string, updates: Partial<UserGoal>): Promise<void> {
  const existing = await getUserGoals()
  const idx = existing.findIndex(g => g.id === id)
  if (idx < 0) return
  existing[idx] = { ...existing[idx], ...updates, updatedAt: new Date().toISOString() }
  await setSetting(KEY, existing)
}

export async function deleteUserGoal(id: string): Promise<void> {
  const existing = await getUserGoals()
  await setSetting(KEY, existing.filter(g => g.id !== id))
}
