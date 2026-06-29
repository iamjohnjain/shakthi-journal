import { getDB } from './index'

// ─── Types ────────────────────────────────────────────────────────────────────

export const BACKUP_STORES = [
  'health_metrics',
  'sync_history',
  'settings',
  'daily_logs',
  'profile',
  'workouts',
  'nutrition_entries',
  'training_profile',
  'workout_plans',
  'exercise_library',
  'workout_templates',
] as const

export type BackupStoreName = typeof BACKUP_STORES[number]

export interface BackupSummary {
  health_metrics: number
  sync_history: number
  settings: number
  daily_logs: number
  profile: number
  workouts: number
  nutrition_entries: number
  training_profile: number
  workout_plans: number
  exercise_library: number
  workout_templates: number
}

export interface BackupData {
  format: 'shakthi-journal-backup'
  version: '1'
  appVersion: string
  exportedAt: string
  dbVersion: number
  stores: Record<BackupStoreName, unknown[]>
  summary: BackupSummary
}

export type ImportMode = 'replace' | 'merge'

// ─── Export ───────────────────────────────────────────────────────────────────

export async function exportAllData(appVersion: string): Promise<BackupData> {
  const db = await getDB()

  const storeData: Record<string, unknown[]> = {}

  await Promise.all(
    BACKUP_STORES.map(async (name) => {
      storeData[name] = await db.getAll(name)
    })
  )

  const summary = Object.fromEntries(
    BACKUP_STORES.map((name) => [name, storeData[name].length])
  ) as unknown as BackupSummary

  return {
    format: 'shakthi-journal-backup',
    version: '1',
    appVersion,
    exportedAt: new Date().toISOString(),
    dbVersion: 5,
    stores: storeData as Record<BackupStoreName, unknown[]>,
    summary,
  }
}

export function downloadBackup(data: BackupData): void {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const date = new Date().toISOString().slice(0, 10)
  const a = document.createElement('a')
  a.href = url
  a.download = `shakthi-journal-backup-${date}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Validate ────────────────────────────────────────────────────────────────

export function parseBackupFile(json: string): BackupData | null {
  try {
    const data = JSON.parse(json)
    if (data.format !== 'shakthi-journal-backup') return null
    if (!data.stores || typeof data.stores !== 'object') return null
    if (!data.exportedAt || !data.summary) return null
    return data as BackupData
  } catch {
    return null
  }
}

// ─── Import ───────────────────────────────────────────────────────────────────

export async function importBackup(
  data: BackupData,
  mode: ImportMode,
  onProgress?: (store: string, done: number, total: number) => void
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const db = await getDB()
  let imported = 0
  let skipped = 0
  const errors: string[] = []

  for (const storeName of BACKUP_STORES) {
    const records = data.stores[storeName] ?? []
    const total = records.length

    if (mode === 'replace') {
      try {
        await db.clear(storeName)
      } catch (e) {
        errors.push(`Failed to clear ${storeName}: ${e}`)
        continue
      }
    }

    let existingKeys: Set<IDBValidKey> = new Set()
    if (mode === 'merge') {
      try {
        const keys = await db.getAllKeys(storeName)
        existingKeys = new Set(keys.map(String))
      } catch {
        // store might be empty — OK
      }
    }

    for (let i = 0; i < records.length; i++) {
      const record = records[i]
      try {
        if (mode === 'merge' && record !== null && typeof record === 'object') {
          const key = (record as Record<string, unknown>)['id']
            ?? (record as Record<string, unknown>)['date']
            ?? (record as Record<string, unknown>)['key']
          if (key != null && existingKeys.has(String(key))) {
            skipped++
            continue
          }
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await db.put(storeName, record as any)
        imported++
      } catch (e) {
        errors.push(`${storeName}[${i}]: ${e}`)
      }

      if (onProgress && i % 50 === 0) {
        onProgress(storeName, i + 1, total)
      }
    }

    onProgress?.(storeName, total, total)
  }

  return { imported, skipped, errors }
}
