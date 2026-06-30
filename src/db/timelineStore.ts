import { getDB, getSyncHistory } from './index'
import { getLogsForRange } from './logStore'
import { getRecentWorkouts } from './workoutStore'
import { kgToLbs } from '../data/config'

// ─── Types ────────────────────────────────────────────────────────────────────

export type TimelineEventType =
  | 'weight'
  | 'workout'
  | 'nutrition'
  | 'pr'
  | 'import'
  | 'sleep'
  | 'recovery'
  | 'note'
  | 'body'

export interface TimelineEvent {
  id: string
  date: string        // YYYY-MM-DD for grouping
  ts: number          // Unix ms for sorting
  type: TimelineEventType
  emoji: string
  title: string
  detail?: string
  value?: string
  source?: string
  link?: string
  positive?: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr() { return new Date().toISOString().slice(0, 10) }

function offsetDate(base: string, days: number): string {
  const d = new Date(base + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// ─── Main aggregator ──────────────────────────────────────────────────────────

export async function getTimeline(days = 90, limit = 300): Promise<TimelineEvent[]> {
  const endDate   = todayStr()
  const startDate = offsetDate(endDate, -days)
  const events: TimelineEvent[] = []

  // ── 1. Daily logs (weight, body fat, wellbeing, notes) ─────────────────────
  try {
    const logs = await getLogsForRange(startDate, endDate)
    for (const log of logs) {
      const base = new Date(log.date + 'T08:00:00').getTime()

      if (log.weightKg) {
        const lbs = kgToLbs(log.weightKg)
        events.push({
          id: `log-weight-${log.date}`,
          date: log.date, ts: base,
          type: 'weight', emoji: '⚖️',
          title: 'Weight logged',
          value: `${lbs} lbs`,
          detail: `${log.weightKg.toFixed(1)} kg`,
          source: 'Daily Log', link: '/log',
        })
      }

      if (log.mood != null || log.energyLevel != null || log.sleepQuality != null) {
        const moodLabels = ['Terrible', 'Poor', 'Okay', 'Good', 'Great']
        const parts: string[] = []
        if (log.mood)        parts.push(`Mood: ${moodLabels[log.mood - 1]}`)
        if (log.energyLevel) parts.push(`Energy: ${log.energyLevel}/5`)
        if (log.sleepQuality) parts.push(`Sleep quality: ${log.sleepQuality}/5`)
        events.push({
          id: `log-wellbeing-${log.date}`,
          date: log.date, ts: base + 60_000,
          type: 'note', emoji: '📊',
          title: 'Wellbeing check-in',
          detail: parts.join(' · '),
          source: 'Daily Log', link: '/log',
        })
      }

      if (log.notes?.trim()) {
        events.push({
          id: `log-note-${log.date}`,
          date: log.date, ts: base + 120_000,
          type: 'note', emoji: '📝',
          title: 'Journal note',
          detail: log.notes.length > 120 ? log.notes.slice(0, 120) + '…' : log.notes,
          source: 'Daily Log', link: '/log',
        })
      }
    }
  } catch { /* no logs yet */ }

  // ── 2. Workouts + PRs ──────────────────────────────────────────────────────
  try {
    const workouts = await getRecentWorkouts(200)
    for (const w of workouts) {
      if (w.date < startDate) continue
      const ts   = new Date(w.date + 'T12:00:00').getTime()
      const emoji = w.type === 'lifting' ? '💪' : '🏃'

      const metaParts: string[] = []
      if (w.durationMin) metaParts.push(`${w.durationMin}min`)
      if (w.exercises?.length) metaParts.push(`${w.exercises.length} exercise${w.exercises.length > 1 ? 's' : ''}`)
      if (w.estimatedCalories) metaParts.push(`~${w.estimatedCalories} kcal`)

      events.push({
        id: `workout-${w.id}`,
        date: w.date, ts,
        type: 'workout', emoji,
        title: w.title || (w.type === 'lifting' ? 'Lifting session' : 'Cardio session'),
        detail: metaParts.join(' · '),
        source: w.type === 'lifting' ? 'Strength' : 'Cardio',
        link: '/workouts',
        positive: true,
      })

      // PRs within this workout
      for (const ex of (w.exercises ?? [])) {
        for (const set of (ex.sets ?? [])) {
          if (set.isPR) {
            events.push({
              id: `pr-${w.id}-${ex.name}`,
              date: w.date, ts: ts + 1000,
              type: 'pr', emoji: '🏆',
              title: `PR — ${ex.name}`,
              detail: [
                `${set.weightLbs} lbs × ${set.reps}`,
                set.e1rm ? `~${Math.round(set.e1rm)} lbs 1RM` : null,
              ].filter(Boolean).join(' · '),
              source: 'Strength', link: '/workouts',
              positive: true,
            })
          }
        }
      }
    }
  } catch { /* no workouts yet */ }

  // ── 3. Nutrition entries (grouped daily summaries) ─────────────────────────
  try {
    const db = await getDB()
    const allEntries = await db.getAll('nutrition_entries')
    const byDate = new Map<string, typeof allEntries>()
    for (const e of allEntries) {
      if (e.date < startDate || e.date > endDate) continue
      if (!byDate.has(e.date)) byDate.set(e.date, [])
      byDate.get(e.date)!.push(e)
    }
    for (const [date, entries] of byDate) {
      const calories   = Math.round(entries.reduce((s, e) => s + e.calories, 0))
      const protein    = Math.round(entries.reduce((s, e) => s + e.proteinG, 0))
      const mealCount  = entries.length
      events.push({
        id: `nutrition-${date}`,
        date, ts: new Date(date + 'T13:00:00').getTime(),
        type: 'nutrition', emoji: '🥗',
        title: `${mealCount} meal${mealCount > 1 ? 's' : ''} logged`,
        detail: `${calories} kcal · ${protein}g protein`,
        source: 'Nutrition', link: '/nutrition',
      })
    }
  } catch { /* no entries yet */ }

  // ── 4. Import events (sync history) ───────────────────────────────────────
  try {
    const syncs = await getSyncHistory(50)
    for (const s of syncs) {
      const dateStr = s.startedAt.slice(0, 10)
      if (dateStr < startDate) continue
      if (s.status === 'failed') continue
      events.push({
        id: `sync-${s.id}`,
        date: dateStr, ts: new Date(s.startedAt).getTime(),
        type: 'import', emoji: '📥',
        title: 'Health data imported',
        detail: `${s.recordCount.toLocaleString()} records · ${s.sourceName}`,
        source: s.sourceName, link: '/connected-accounts',
        positive: true,
      })
    }
  } catch { /* no syncs yet */ }

  // ── 5. Apple Health snapshots — recovery score, notable HRV ───────────────
  try {
    const db = await getDB()
    const allMetrics = await db.getAll('health_metrics')
    const real = allMetrics.filter(m => m.dataMode !== 'mock' && m.date >= startDate)
    const dateMap = new Map<string, typeof real>()
    for (const m of real) {
      if (!dateMap.has(m.date)) dateMap.set(m.date, [])
      dateMap.get(m.date)!.push(m)
    }
    for (const [date, metrics] of dateMap) {
      const hrv    = metrics.find(m => m.type === 'hrv')?.value
      const sleep  = metrics.find(m => m.type === 'sleepHours')?.value
      const steps  = metrics.find(m => m.type === 'steps')?.value
      const weight = metrics.find(m => m.type === 'weight')?.value

      if (weight) {
        const lbs = kgToLbs(Number(weight))
        events.push({
          id: `ah-weight-${date}`,
          date, ts: new Date(date + 'T07:00:00').getTime(),
          type: 'weight', emoji: '⚖️',
          title: 'Weight recorded',
          value: `${lbs} lbs`,
          source: 'Apple Health', link: '/',
        })
      }
      if (hrv) {
        events.push({
          id: `ah-hrv-${date}`,
          date, ts: new Date(date + 'T07:30:00').getTime(),
          type: 'recovery', emoji: '❤️',
          title: 'HRV recorded',
          value: `${Math.round(Number(hrv))} ms`,
          source: 'Apple Health', link: '/recovery',
        })
      }
      if (sleep) {
        const sv = Number(sleep)
        const h = Math.floor(sv), m = Math.round((sv - h) * 60)
        events.push({
          id: `ah-sleep-${date}`,
          date, ts: new Date(date + 'T06:00:00').getTime(),
          type: 'sleep', emoji: '🌙',
          title: 'Sleep recorded',
          value: m > 0 ? `${h}h ${m}m` : `${h}h`,
          source: 'Apple Health', link: '/recovery',
        })
      }
      if (steps) {
        events.push({
          id: `ah-steps-${date}`,
          date, ts: new Date(date + 'T20:00:00').getTime(),
          type: 'note', emoji: '👟',
          title: 'Steps recorded',
          value: `${Math.round(Number(steps)).toLocaleString()} steps`,
          source: 'Apple Health', link: '/',
        })
      }
    }
  } catch { /* no health metrics yet */ }

  // Deduplicate by id (Apple Health weight vs daily log weight for same day)
  const seen = new Set<string>()
  const unique = events.filter(e => {
    if (seen.has(e.id)) return false
    seen.add(e.id)
    return true
  })

  // Sort newest first
  unique.sort((a, b) => b.ts - a.ts)

  return unique.slice(0, limit)
}

// ─── Chart data helpers ───────────────────────────────────────────────────────

export interface ChartPoint { date: string; value: number }

export async function getWeightHistory(days: number): Promise<ChartPoint[]> {
  const endDate   = todayStr()
  const startDate = offsetDate(endDate, -days)
  const points: ChartPoint[] = []

  // Apple Health weight metrics
  try {
    const db = await getDB()
    const all = await db.getAll('health_metrics')
    for (const m of all) {
      if (m.type !== 'weight' || m.dataMode === 'mock' || m.date < startDate) continue
      points.push({ date: m.date, value: kgToLbs(Number(m.value)) })
    }
  } catch { /* */ }

  // Manual daily log weights
  try {
    const logs = await getLogsForRange(startDate, endDate)
    for (const l of logs) {
      if (l.weightKg == null) continue
      // Don't duplicate if Apple Health already has this date
      if (!points.some(p => p.date === l.date)) {
        points.push({ date: l.date, value: kgToLbs(l.weightKg) })
      }
    }
  } catch { /* */ }

  return points.sort((a, b) => a.date.localeCompare(b.date))
}

export async function getMetricHistory(
  metricType: string,
  days: number,
): Promise<ChartPoint[]> {
  const endDate   = todayStr()
  const startDate = offsetDate(endDate, -days)
  try {
    const db = await getDB()
    const all = await db.getAll('health_metrics')
    return all
      .filter(m => m.type === metricType && m.dataMode !== 'mock' && m.date >= startDate)
      .map(m => ({ date: m.date, value: Number(m.value) }))
      .sort((a, b) => a.date.localeCompare(b.date))
  } catch {
    return []
  }
}
