import { getDB } from './index'
import type { SyncQueueEntry } from './index'
import { v4 as uuidv4 } from '../lib/uuid'

export type { SyncQueueEntry }

export async function enqueue(
  entry: Omit<SyncQueueEntry, 'id' | 'createdAt' | 'attempts'>
): Promise<void> {
  const db = await getDB()
  await db.put('sync_queue', {
    ...entry,
    id: uuidv4(),
    createdAt: Date.now(),
    attempts: 0,
  })
}

export async function getPending(userId: string): Promise<SyncQueueEntry[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('sync_queue', 'by-user', userId)
  return all.filter(e => e.attempts < 5)
}

export async function markSuccess(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('sync_queue', id)
}

export async function markFailure(id: string, error: string): Promise<void> {
  const db = await getDB()
  const entry = await db.get('sync_queue', id)
  if (!entry) return
  await db.put('sync_queue', {
    ...entry,
    attempts: entry.attempts + 1,
    lastError: error,
  })
}

export async function clearQueueForUser(userId: string): Promise<void> {
  const db = await getDB()
  const entries = await db.getAllFromIndex('sync_queue', 'by-user', userId)
  await Promise.all(entries.map(e => db.delete('sync_queue', e.id)))
}
