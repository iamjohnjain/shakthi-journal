import { getDB } from './index'
import type { ProfileData } from './index'
import { syncEngine } from './syncEngine'
import { showToast } from '../utils/toast'

export type { ProfileData }

export async function saveProfile(data: Omit<ProfileData, 'id' | 'updatedAt'>): Promise<void> {
  const db = await getDB()
  const saved: ProfileData = { ...data, id: 'main', updatedAt: new Date().toISOString() }
  await db.put('profile', saved)
  void syncEngine.queueWrite('profile', 'upsert', 'main', saved)
  window.dispatchEvent(new CustomEvent('profile-updated', { detail: saved }))
  showToast('Profile saved')
}

export async function getProfile(): Promise<ProfileData | null> {
  const db = await getDB()
  return (await db.get('profile', 'main')) ?? null
}
