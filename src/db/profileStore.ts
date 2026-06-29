import { getDB } from './index'
import type { ProfileData } from './index'

export type { ProfileData }

export async function saveProfile(data: Omit<ProfileData, 'id' | 'updatedAt'>): Promise<void> {
  const db = await getDB()
  await db.put('profile', { ...data, id: 'main', updatedAt: new Date().toISOString() })
}

export async function getProfile(): Promise<ProfileData | null> {
  const db = await getDB()
  return (await db.get('profile', 'main')) ?? null
}
