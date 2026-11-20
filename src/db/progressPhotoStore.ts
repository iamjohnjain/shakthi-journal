import { getDB } from './index'
import type { ProgressPhoto, ProgressPhotoPose } from './index'

function genId() { return `photo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` }

export async function savePhoto(photo: Omit<ProgressPhoto, 'id' | 'createdAt'>): Promise<ProgressPhoto> {
  const db = await getDB()
  const full: ProgressPhoto = { ...photo, id: genId(), createdAt: new Date().toISOString() }
  await db.put('progress_photos', full)
  return full
}

export async function deletePhoto(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('progress_photos', id)
}

/** Corrects a saved photo's date and/or weight after the fact — capture/
    upload time isn't always accurate (e.g. a batch upload of older photos). */
export async function updatePhoto(id: string, changes: { date?: string; weightKg?: number | null }): Promise<ProgressPhoto | null> {
  const db = await getDB()
  const existing = await db.get('progress_photos', id)
  if (!existing) return null
  const updated: ProgressPhoto = {
    ...existing,
    ...(changes.date !== undefined ? { date: changes.date } : {}),
    ...(changes.weightKg !== undefined ? { weightKg: changes.weightKg ?? undefined } : {}),
  }
  await db.put('progress_photos', updated)
  return updated
}

/** All photos, newest first, optionally narrowed to one pose (and, for a
    custom pose, one specific label — e.g. "vacuum pose" vs. another custom
    label) and/or a date. */
export async function getPhotos(filter?: {
  pose?: ProgressPhotoPose
  customLabel?: string
  date?: string
}): Promise<ProgressPhoto[]> {
  const db = await getDB()
  let all = await db.getAll('progress_photos')
  if (filter?.pose) all = all.filter(p => p.pose === filter.pose)
  if (filter?.pose === 'custom' && filter.customLabel) all = all.filter(p => p.customLabel === filter.customLabel)
  if (filter?.date) all = all.filter(p => p.date === filter.date)
  return all.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
}

/** Preset poses plus any custom labels already in use — for the filter chips. */
export async function getPoseLabels(): Promise<{ pose: ProgressPhotoPose; label: string }[]> {
  const presets: { pose: ProgressPhotoPose; label: string }[] = [
    { pose: 'front', label: 'Front' },
    { pose: 'back', label: 'Back' },
    { pose: 'side', label: 'Side' },
    { pose: 'flexed', label: 'Flexed' },
  ]
  const db = await getDB()
  const all = await db.getAll('progress_photos')
  const customLabels = [...new Set(all.filter(p => p.pose === 'custom' && p.customLabel).map(p => p.customLabel!))]
  return [...presets, ...customLabels.map(label => ({ pose: 'custom' as const, label }))]
}
