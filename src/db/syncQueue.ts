import { getDB } from './index'
import type { SyncQueueEntry } from './index'
import { v4 as uuidv4 } from '../lib/uuid'

export type { SyncQueueEntry }

/**
 * Enqueue a write for cloud sync.
 *
 * Deduplication: if a pending (< 5 attempts) entry already exists for the
 * same user + store + recordId, overwrite its data in-place rather than
 * appending a new entry. This prevents the queue from accumulating redundant
 * writes when a record is updated several times between sync cycles, which
 * would otherwise cause duplicate upserts to Supabase.
 */
export async function enqueue(
  entry: Omit<SyncQueueEntry, 'id' | 'createdAt' | 'attempts'>
): Promise<void> {
  const db = await getDB()
  const existing = await db.getAllFromIndex('sync_queue', 'by-user', entry.userId)

  const dupe = existing.find(
    e =>
      e.attempts < 5 &&
      e.store === entry.store &&
      e.recordId === entry.recordId,
  )

  if (dupe) {
    // Update in-place — preserve id/createdAt/attempts so retry state is kept
    await db.put('sync_queue', { ...dupe, data: entry.data, operation: entry.operation })
    return
  }

  await db.put('sync_queue', {
    ...entry,
    id: uuidv4(),
    createdAt: Date.now(),
    attempts: 0,
  })
}

/** Attempts below this just retry on the next 30s sync tick, same as always.
    At or above it, the entry is flagged as "needs attention" in the UI, but
    — unlike the old behavior — it keeps retrying in the background too, just
    on a growing backoff, so a transient run of failures (a network blip, a
    momentary auth hiccup) heals itself without the user ever having to tap
    "Retry all". Only a durably broken record (one that fails forever) stays
    visible, and even that gets retried every 30 min in case the cause clears. */
export const WARN_THRESHOLD = 5

function backoffMs(attempts: number): number {
  if (attempts < WARN_THRESHOLD) return 0
  // 1m, 2m, 4m, 8m, 16m, capped at 30m
  return Math.min(60_000 * 2 ** (attempts - WARN_THRESHOLD), 30 * 60_000)
}

function isRetryableNow(e: SyncQueueEntry): boolean {
  if (e.attempts < WARN_THRESHOLD) return true
  const since = Date.now() - (e.lastAttemptAt ?? e.createdAt)
  return since >= backoffMs(e.attempts)
}

/** Entries due for a retry attempt right now — includes ones past the
    warning threshold once their backoff window has elapsed. */
export async function getPending(userId: string): Promise<SyncQueueEntry[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('sync_queue', 'by-user', userId)
  return all.filter(isRetryableNow)
}

/** Entries that have crossed the warning threshold, for the "needs attention"
    UI — these are still being retried in the background on a backoff, this
    is just "this has failed enough times to be worth telling the user". */
export async function getFailedEntries(userId: string): Promise<SyncQueueEntry[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('sync_queue', 'by-user', userId)
  return all.filter(e => e.attempts >= WARN_THRESHOLD)
}

/** Resets attempt counts for an immediate retry (manual "Retry all"),
    bypassing the backoff window instead of waiting for it to elapse. */
export async function resetFailedEntries(userId: string): Promise<void> {
  const db = await getDB()
  const failed = await getFailedEntries(userId)
  await Promise.all(failed.map(e => db.put('sync_queue', { ...e, attempts: 0, lastError: undefined, lastAttemptAt: undefined })))
}

export async function discardEntry(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('sync_queue', id)
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
    lastAttemptAt: Date.now(),
  })
}

export async function clearQueueForUser(userId: string): Promise<void> {
  const db = await getDB()
  const entries = await db.getAllFromIndex('sync_queue', 'by-user', userId)
  await Promise.all(entries.map(e => db.delete('sync_queue', e.id)))
}
