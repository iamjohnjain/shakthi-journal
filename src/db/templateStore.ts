import { getDB } from './index'
import type { WorkoutTemplate, WorkoutExerciseEntry } from './index'

export type { WorkoutTemplate }

function genId() { return `tmpl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }

export async function getTemplates(): Promise<WorkoutTemplate[]> {
  const db = await getDB()
  const all = await db.getAll('workout_templates')
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function getTemplate(id: string): Promise<WorkoutTemplate | undefined> {
  const db = await getDB()
  return db.get('workout_templates', id)
}

export async function saveTemplate(template: Omit<WorkoutTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<WorkoutTemplate> {
  const db = await getDB()
  const now = new Date().toISOString()
  const full: WorkoutTemplate = { ...template, id: genId(), createdAt: now, updatedAt: now }
  await db.put('workout_templates', full)
  return full
}

export async function updateTemplate(id: string, updates: Partial<Omit<WorkoutTemplate, 'id' | 'createdAt'>>): Promise<void> {
  const db = await getDB()
  const existing = await db.get('workout_templates', id)
  if (!existing) return
  await db.put('workout_templates', { ...existing, ...updates, updatedAt: new Date().toISOString() })
}

export async function deleteTemplate(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('workout_templates', id)
}

/** Save an existing workout session as a new template. */
export async function workoutToTemplate(
  name: string,
  exercises: WorkoutExerciseEntry[],
  opts: { notes?: string; targetMuscles?: string[]; estimatedDurationMin?: number } = {}
): Promise<WorkoutTemplate> {
  // Strip PR/e1rm annotations — they belong to that session, not the template
  const clean = exercises.map(ex => ({
    ...ex,
    sets: ex.sets.map(s => ({ reps: s.reps, weightLbs: s.weightLbs, equipment: (s as typeof s & { equipment?: string }).equipment })),
  }))
  return saveTemplate({ name, exercises: clean, ...opts })
}
