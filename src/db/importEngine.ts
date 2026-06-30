/**
 * Import Engine — deduplication, conflict resolution, source attribution.
 * Local-only. No network calls.
 * See docs/INTEGRATIONS.md for source trust hierarchy rationale.
 */

import { getDB, setSetting, getSetting } from './index'
import type { ShakthiDB } from './index'

type DBMetric = ShakthiDB['health_metrics']['value']

// ─── Source trust hierarchy ───────────────────────────────────────────────────

const SOURCE_TRUST: Record<string, number> = {
  renpho:       90,
  whoop:        88,
  oura:         85,
  apple_watch:  80,
  garmin:       78,
  ringconn:     75,
  strava:       70,
  myfitnesspal: 65,
  apple_health: 50,
  manual:       40,
}

export function sourceTrust(sourceId: string): number {
  return SOURCE_TRUST[sourceId] ?? 30
}

export function metricConfidence(sourceId: string): 'high' | 'medium' | 'low' {
  const t = sourceTrust(sourceId)
  return t >= 80 ? 'high' : t >= 55 ? 'medium' : 'low'
}

export function formatSourceLabel(sourceId: string, sourceName?: string): string {
  const labels: Record<string, string> = {
    apple_watch:  'Apple Watch',
    apple_health: 'Apple Health',
    renpho:       'RENPHO Scale',
    ringconn:     'RingConn Ring',
    whoop:        'WHOOP',
    oura:         'Oura Ring',
    garmin:       'Garmin Connect',
    strava:       'Strava',
    myfitnesspal: 'MyFitnessPal',
    manual:       'Manual Entry',
  }
  return labels[sourceId] ?? sourceName ?? sourceId
}

// ─── Conflict record ──────────────────────────────────────────────────────────

export interface ConflictRecord {
  date: string
  type: string
  existingSourceId: string
  existingValue: number | string
  incomingSourceId: string
  incomingValue: number | string
  winner: 'existing' | 'incoming'
  reason: string
  loggedAt: string
}

// ─── Dedup + conflict resolution ─────────────────────────────────────────────

interface DedupeResult {
  toWrite: DBMetric[]
  skipped: number
  conflicts: ConflictRecord[]
}

export async function deduplicateMetrics(incoming: DBMetric[]): Promise<DedupeResult> {
  if (incoming.length === 0) return { toWrite: [], skipped: 0, conflicts: [] }

  const db = await getDB()
  const existing = await db.getAll('health_metrics')
  const existingMap = new Map(existing.map(m => [m.id, m]))

  const toWrite: DBMetric[] = []
  let skipped = 0
  const conflicts: ConflictRecord[] = []

  for (const record of incoming) {
    const prior = existingMap.get(record.id)

    if (!prior) {
      toWrite.push(record)
      continue
    }

    if (prior.sourceId === record.sourceId) {
      // Same source: update silently
      toWrite.push(record)
      continue
    }

    // Different source for same date+type: resolve by trust
    const priorTrust = sourceTrust(prior.sourceId)
    const newTrust   = sourceTrust(record.sourceId)

    if (newTrust > priorTrust) {
      toWrite.push(record)
      conflicts.push({
        date: record.date,
        type: record.type,
        existingSourceId: prior.sourceId,
        existingValue: prior.value,
        incomingSourceId: record.sourceId,
        incomingValue: record.value,
        winner: 'incoming',
        reason: `${record.sourceId} trust(${newTrust}) > ${prior.sourceId} trust(${priorTrust})`,
        loggedAt: new Date().toISOString(),
      })
    } else {
      skipped++
      conflicts.push({
        date: record.date,
        type: record.type,
        existingSourceId: prior.sourceId,
        existingValue: prior.value,
        incomingSourceId: record.sourceId,
        incomingValue: record.value,
        winner: 'existing',
        reason: `${prior.sourceId} trust(${priorTrust}) >= ${record.sourceId} trust(${newTrust})`,
        loggedAt: new Date().toISOString(),
      })
    }
  }

  return { toWrite, skipped, conflicts }
}

// ─── Write batch with dedup ───────────────────────────────────────────────────

export interface ImportSummary {
  sourceId: string
  sourceName: string
  totalIncoming: number
  written: number
  skipped: number
  conflicts: number
  durationMs: number
  importedAt: string
}

export async function runImportBatch(
  sourceId: string,
  sourceName: string,
  metrics: DBMetric[],
): Promise<ImportSummary> {
  const start = Date.now()
  const { toWrite, skipped, conflicts } = await deduplicateMetrics(metrics)

  if (toWrite.length > 0) {
    const db = await getDB()
    const tx = db.transaction('health_metrics', 'readwrite')
    await Promise.all([...toWrite.map(m => tx.store.put(m)), tx.done])
  }

  if (conflicts.length > 0) {
    const prior = await getSetting<ConflictRecord[]>('import.conflict_log', [])
    await setSetting('import.conflict_log', [...conflicts, ...prior].slice(0, 200))
  }

  return {
    sourceId,
    sourceName,
    totalIncoming: metrics.length,
    written: toWrite.length,
    skipped,
    conflicts: conflicts.length,
    durationMs: Date.now() - start,
    importedAt: new Date().toISOString(),
  }
}

export async function getConflictLog(): Promise<ConflictRecord[]> {
  return getSetting<ConflictRecord[]>('import.conflict_log', [])
}

// ─── Attribution for a stored metric ─────────────────────────────────────────

export interface MetricAttribution {
  sourceId: string
  sourceName: string
  sourceLabel: string
  dataMode: string
  importedAt: string
  confidence: 'high' | 'medium' | 'low'
}

export function buildAttribution(metric: DBMetric): MetricAttribution {
  return {
    sourceId: metric.sourceId,
    sourceName: metric.sourceName,
    sourceLabel: formatSourceLabel(metric.sourceId, metric.sourceName),
    dataMode: metric.dataMode,
    importedAt: metric.importedAt,
    confidence: metricConfidence(metric.sourceId),
  }
}
