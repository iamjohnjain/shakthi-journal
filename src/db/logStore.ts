import { getDB } from './index'
import type { DailyLog } from './index'
import { syncEngine } from './syncEngine'

export type { DailyLog }

// ─── Write ────────────────────────────────────────────────────────────────────

export async function saveLog(entry: Omit<DailyLog, 'createdAt' | 'updatedAt'> & { createdAt?: string }): Promise<void> {
  const db = await getDB()
  const existing = await db.get('daily_logs', entry.date)
  const now = new Date().toISOString()
  const saved: DailyLog = {
    ...entry,
    createdAt: existing?.createdAt ?? entry.createdAt ?? now,
    updatedAt: now,
  }
  await db.put('daily_logs', saved)
  void syncEngine.queueWrite('daily_logs', 'upsert', entry.date, saved)
}

export async function deleteLog(date: string): Promise<void> {
  const db = await getDB()
  await db.delete('daily_logs', date)
  void syncEngine.queueWrite('daily_logs', 'delete', date, { date })
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getLog(date: string): Promise<DailyLog | null> {
  const db = await getDB()
  return (await db.get('daily_logs', date)) ?? null
}

export async function getLogsForRange(start: string, end: string): Promise<DailyLog[]> {
  const db = await getDB()
  const all = await db.getAll('daily_logs')
  return all.filter(l => l.date >= start && l.date <= end).sort((a, b) => b.date.localeCompare(a.date))
}

export async function getAllLogDates(): Promise<string[]> {
  const db = await getDB()
  const all = await db.getAllKeys('daily_logs')
  return (all as string[]).sort().reverse()
}

export async function hasLogForDate(date: string): Promise<boolean> {
  const db = await getDB()
  const count = await db.count('daily_logs', date)
  return count > 0
}

export async function getLogCount(): Promise<number> {
  const db = await getDB()
  return db.count('daily_logs')
}
