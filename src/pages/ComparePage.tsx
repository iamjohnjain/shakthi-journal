import { useState, useEffect, useRef, useCallback } from 'react'
import { TrendingUp, TrendingDown, Minus, ArrowRightLeft, Star, Check } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { kgToLbs, GOALS, USER } from '../data/config'
import { useApp } from '../context/AppContext'
import { getSetting, setSetting } from '../db'
import { mockDailySnapshots } from '../data/mock'
import { getSnapshotForDate } from '../db/healthStore'
import { getLog } from '../db/logStore'
import { getProfile } from '../db/profileStore'
import { getWorkoutsForDate } from '../db/workoutStore'
import DataBadge from '../components/DataBadge'
import type { DailySnapshot } from '../types/health'
import type { DailyLog } from '../db/logStore'
import './ComparePage.css'

// ─── Types ────────────────────────────────────────────────────────────────────

type ExtSnap = DailySnapshot & { _source: string; _workoutCount?: number }
type Dir = 'up' | 'down' | 'neutral'

interface CompareResult {
  dateA: string
  dateB: string
  snapA: ExtSnap
  snapB: ExtSnap
}

interface MetricDef {
  id: string
  label: string
  group: string
  unit: string
  get: (s: ExtSnap) => number | undefined
  higherIsBetter: boolean
  format: (v: number) => string
  color: string
}

// ─── Metric registry ──────────────────────────────────────────────────────────

const H = USER.heightCm / 100  // meters

const ALL_METRICS: MetricDef[] = [
  // Body
  { id: 'weight',     label: 'Weight',         group: 'Body',      unit: 'lbs',      higherIsBetter: false, color: 'var(--blue)',   format: v => v.toFixed(1),                   get: s => s.weight ? kgToLbs(s.weight) : undefined },
  { id: 'bodyFat',    label: 'Body Fat',        group: 'Body',      unit: '%',        higherIsBetter: false, color: 'var(--teal)',   format: v => v.toFixed(1),                   get: s => s.bodyFatPct },
  { id: 'bmi',        label: 'BMI',             group: 'Body',      unit: '',         higherIsBetter: false, color: 'var(--blue)',   format: v => v.toFixed(1),                   get: s => s.weight ? +(s.weight / (H * H)).toFixed(1) : undefined },
  { id: 'leanMass',   label: 'Lean Mass',       group: 'Body',      unit: 'lbs',      higherIsBetter: true,  color: 'var(--green)', format: v => v.toFixed(1),                   get: s => s.muscleMassKg ? kgToLbs(s.muscleMassKg) : undefined },
  { id: 'fatFree',    label: 'Fat-Free Mass',   group: 'Body',      unit: 'lbs',      higherIsBetter: true,  color: 'var(--green)', format: v => v.toFixed(1),                   get: s => (s.weight && s.bodyFatPct != null) ? kgToLbs(s.weight * (1 - s.bodyFatPct / 100)) : undefined },
  { id: 'visceralFat',label: 'Visceral Fat',    group: 'Body',      unit: 'level',    higherIsBetter: false, color: 'var(--orange)',format: v => v.toFixed(0),                   get: _s => undefined },
  { id: 'subcutFat',  label: 'Subcutaneous Fat',group: 'Body',      unit: '%',        higherIsBetter: false, color: 'var(--orange)',format: v => v.toFixed(1),                   get: _s => undefined },
  // Activity
  { id: 'steps',      label: 'Steps',           group: 'Activity',  unit: '',         higherIsBetter: true,  color: 'var(--green)', format: v => Math.round(v).toLocaleString(), get: s => s.steps },
  { id: 'activeKcal', label: 'Active Calories', group: 'Activity',  unit: 'kcal',     higherIsBetter: true,  color: 'var(--orange)',format: v => Math.round(v).toLocaleString(), get: s => s.activeCalories },
  // Recovery
  { id: 'sleep',      label: 'Sleep',           group: 'Recovery',  unit: 'h',        higherIsBetter: true,  color: 'var(--purple)',format: v => v.toFixed(1),                   get: s => s.sleepHours },
  { id: 'hrv',        label: 'HRV',             group: 'Recovery',  unit: 'ms',       higherIsBetter: true,  color: 'var(--teal)',  format: v => Math.round(v).toString(),       get: s => s.hrv },
  { id: 'restingHR',  label: 'Resting HR',      group: 'Recovery',  unit: 'bpm',      higherIsBetter: false, color: 'var(--red)',   format: v => Math.round(v).toString(),       get: s => s.restingHeartRate },
  // Training
  { id: 'workouts',   label: 'Workouts',        group: 'Training',  unit: 'sessions', higherIsBetter: true,  color: 'var(--blue)',  format: v => Math.round(v).toString(),       get: s => s._workoutCount },
  // Nutrition
  { id: 'protein',    label: 'Protein',         group: 'Nutrition', unit: `/ ${GOALS.proteinG}g`, higherIsBetter: true, color: 'var(--orange)', format: v => Math.round(v).toString(), get: s => s.proteinG },
  { id: 'caloriesIn', label: 'Calories Eaten',  group: 'Nutrition', unit: 'kcal',     higherIsBetter: false, color: 'var(--yellow)',format: v => Math.round(v).toLocaleString(), get: s => s.caloriesIn },
  { id: 'water',      label: 'Water',           group: 'Nutrition', unit: 'oz',       higherIsBetter: true,  color: 'var(--blue)',  format: v => Math.round(v).toString(),       get: s => s.waterMl ? +(s.waterMl / 29.574).toFixed(0) : undefined },
  // Athletic (manual only — no data yet)
  { id: 'vertJump',   label: 'Vertical Jump',   group: 'Athletic',  unit: 'in',       higherIsBetter: true,  color: 'var(--yellow)',format: v => v.toFixed(1),                   get: _s => undefined },
  { id: 'pullups',    label: 'Pull-ups',        group: 'Athletic',  unit: 'reps',     higherIsBetter: true,  color: 'var(--yellow)',format: v => Math.round(v).toString(),       get: _s => undefined },
  { id: 'runPace',    label: 'Running Pace',    group: 'Athletic',  unit: 'min/mi',   higherIsBetter: false, color: 'var(--green)', format: v => v.toFixed(2),                   get: _s => undefined },
]

const DEFAULT_SELECTED = ['weight', 'bodyFat', 'leanMass', 'steps', 'sleep', 'hrv', 'protein']
const METRICS_SETTINGS_KEY = 'compare-metrics'
const GROUPS = Array.from(new Set(ALL_METRICS.map(m => m.group)))

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function deltaDir(delta: number, hib: boolean): Dir {
  if (Math.abs(delta) < 0.05) return 'neutral'
  return (delta > 0) === hib ? 'up' : 'down'
}

function mergeLog(snap: DailySnapshot | null, log: DailyLog | null, date: string): ExtSnap {
  const base = snap ?? { date }
  const merged: DailySnapshot = {
    ...base,
    weight:     log?.weightKg   ?? base.weight,
    caloriesIn: log?.caloriesIn ?? base.caloriesIn,
    proteinG:   log?.proteinG   ?? base.proteinG,
    waterMl:    log?.waterMl    ?? base.waterMl,
  }
  const source = snap && log ? 'Apple Health + Manual' : snap ? 'Apple Health' : log ? 'Manual Log' : 'No data'
  return { ...merged, _source: source }
}

function sourceMode(src: string) {
  if (src.includes('Mock') || src.includes('Baseline')) return 'mock' as const
  if (src.includes('Manual')) return 'manual' as const
  return 'imported' as const
}

// ─── Metric Card ─────────────────────────────────────────────────────────────

function MetricCard({ m, snapA, snapB, dateA, dateB }: {
  m: MetricDef
  snapA: ExtSnap
  snapB: ExtSnap
  dateA: string
  dateB: string
}) {
  const vA = m.get(snapA)
  const vB = m.get(snapB)
  const hasData = vA != null || vB != null
  const d = vA != null && vB != null ? vB - vA : null
  const dir: Dir = d != null ? deltaDir(d, m.higherIsBetter) : 'neutral'

  const dirColor = dir === 'up' ? 'var(--green)' : dir === 'down' ? 'var(--orange)' : 'var(--text-tertiary)'
  const DirIcon  = dir === 'up' ? TrendingUp : dir === 'down' ? TrendingDown : Minus

  const fmtDelta = d != null
    ? `${d > 0 ? '+' : ''}${Math.abs(d) < 1 ? d.toFixed(1) : Math.round(Math.abs(d)).toLocaleString()}`
    : null

  return (
    <div className={`cmp-metric-card cmp-metric-card--${dir}`}>
      {/* Top row */}
      <div className="cmp-mc-top">
        <span className="cmp-mc-label" style={{ color: m.color }}>{m.label}</span>
        {d != null && (
          <span className="cmp-mc-delta-chip" style={{ color: dirColor }}>
            <DirIcon size={11} />
            {fmtDelta}{m.unit && m.unit.length < 6 ? ` ${m.unit}` : ''}
          </span>
        )}
      </div>

      {/* Values row */}
      {hasData ? (
        <div className="cmp-mc-values">
          <div className="cmp-mc-val-col">
            <span className="cmp-mc-val">{vA != null ? m.format(vA) : '—'}</span>
            <span className="cmp-mc-unit">{m.unit}</span>
            <span className="cmp-mc-date">{fmtDate(dateA)}</span>
          </div>
          <div className="cmp-mc-arrow" style={{ color: dirColor }}>
            <DirIcon size={16} />
          </div>
          <div className="cmp-mc-val-col cmp-mc-val-col--b">
            <span className="cmp-mc-val">{vB != null ? m.format(vB) : '—'}</span>
            <span className="cmp-mc-unit">{m.unit}</span>
            <span className="cmp-mc-date">{fmtDate(dateB)}</span>
          </div>
        </div>
      ) : (
        <div className="cmp-mc-nodata">No data — log manually or import Apple Health</div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Preset = 'start' | '7d' | '30d' | '90d' | '1y' | 'custom'

export default function ComparePage() {
  const { mockMode } = useApp()
  const navigate = useNavigate()

  const [preset, setPreset] = useState<Preset>('30d')
  const [dateA, setDateA] = useState(daysAgo(30))
  const [dateB, setDateB] = useState(daysAgo(0))
  const [result, setResult] = useState<CompareResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedMetrics, setSelectedMetrics] = useState<Set<string>>(new Set(DEFAULT_SELECTED))
  const [metricsLoaded, setMetricsLoaded] = useState(false)
  const [showAllGroups, setShowAllGroups] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load saved metric preferences
  useEffect(() => {
    getSetting<string[]>(METRICS_SETTINGS_KEY, DEFAULT_SELECTED).then(saved => {
      setSelectedMetrics(new Set(saved))
      setMetricsLoaded(true)
    })
  }, [])

  // Load result when deps change (debounced)
  const doCompare = useCallback(async (a: string, b: string) => {
    if (!a || !b) return
    setLoading(true)
    setError('')
    try {
      if (mockMode) {
        const snapA: ExtSnap = { ...mockDailySnapshots[6] ?? mockDailySnapshots[0], date: a, _source: 'Mock Data', _workoutCount: 3 }
        const snapB: ExtSnap = { ...mockDailySnapshots[0], date: b, _source: 'Mock Data', _workoutCount: 5 }
        setResult({ dateA: a, dateB: b, snapA, snapB })
      } else {
        const [[ahA, logA, wkA], [ahB, logB, wkB]] = await Promise.all([
          Promise.all([getSnapshotForDate(a), getLog(a), getWorkoutsForDate(a)]),
          Promise.all([getSnapshotForDate(b), getLog(b), getWorkoutsForDate(b)]),
        ])
        const snapA: ExtSnap = { ...mergeLog(ahA, logA, a), _workoutCount: wkA.length }
        const snapB: ExtSnap = { ...mergeLog(ahB, logB, b), _workoutCount: wkB.length }
        if (snapA._source === 'No data' && snapB._source === 'No data') {
          setError('No data found for either date. Import Apple Health data or log manually.')
          setResult(null)
        } else {
          setResult({ dateA: a, dateB: b, snapA, snapB })
        }
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [mockMode])

  useEffect(() => {
    if (!metricsLoaded) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doCompare(dateA, dateB), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [dateA, dateB, doCompare, metricsLoaded])

  function applyPreset(p: Preset) {
    setPreset(p)
    if (p === 'start') { applyStartPreset(); return }
    const days: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 }
    const n = days[p] ?? 30
    setDateA(daysAgo(n))
    setDateB(daysAgo(0))
  }

  async function applyStartPreset() {
    const profile = await getProfile()
    const startDate = profile?.startDate ?? USER.startDate
    const today = daysAgo(0)
    setDateA(startDate)
    setDateB(today)

    if (mockMode) {
      const snapA: ExtSnap = {
        ...mockDailySnapshots[6] ?? mockDailySnapshots[0],
        date: startDate,
        weight:     profile?.startWeightKg ?? 96.2,
        bodyFatPct: profile?.startBodyFatPct ?? 19,
        _source: 'Profile Baseline',
        _workoutCount: 0,
      }
      const snapB: ExtSnap = { ...mockDailySnapshots[0], date: today, _source: 'Mock Data', _workoutCount: 5 }
      setResult({ dateA: startDate, dateB: today, snapA, snapB })
      return
    }

    setLoading(true)
    setError('')
    try {
      const [[ahA, logA, wkA], [ahB, logB, wkB]] = await Promise.all([
        Promise.all([getSnapshotForDate(startDate), getLog(startDate), getWorkoutsForDate(startDate)]),
        Promise.all([getSnapshotForDate(today), getLog(today), getWorkoutsForDate(today)]),
      ])
      const baseA: DailySnapshot = ahA ?? { date: startDate }
      const profile2 = await getProfile()
      const blendA: ExtSnap = {
        ...baseA,
        weight:     baseA.weight     ?? profile2?.startWeightKg,
        bodyFatPct: baseA.bodyFatPct ?? profile2?.startBodyFatPct,
        _source: ahA ? 'Apple Health' : profile2 ? 'Profile Baseline' : 'No data',
        _workoutCount: wkA.length,
      }
      if (logA) {
        blendA.weight     = logA.weightKg   ?? blendA.weight
        blendA.proteinG   = logA.proteinG   ?? blendA.proteinG
        blendA.caloriesIn = logA.caloriesIn ?? blendA.caloriesIn
      }
      const snapB: ExtSnap = { ...mergeLog(ahB, logB, today), _workoutCount: wkB.length }
      setResult({ dateA: startDate, dateB: today, snapA: blendA, snapB })
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function toggleMetric(id: string) {
    const next = new Set(selectedMetrics)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedMetrics(next)
    await setSetting(METRICS_SETTINGS_KEY, Array.from(next))
  }

  const visibleMetrics = ALL_METRICS.filter(m => selectedMetrics.has(m.id))

  // Wins & Focus Areas
  const wins: string[] = []
  const opps: string[] = []
  if (result) {
    visibleMetrics.forEach(m => {
      const vA = m.get(result.snapA)
      const vB = m.get(result.snapB)
      if (vA == null || vB == null) return
      const d = vB - vA
      const dir = deltaDir(d, m.higherIsBetter)
      if (dir === 'up') wins.push(`${m.label} improved by ${m.format(Math.abs(d))}${m.unit && m.unit.length < 8 ? ' ' + m.unit : ''}`)
      if (dir === 'down') opps.push(`${m.label} needs attention`)
    })
  }

  const presetLabels: Record<Preset, string> = {
    start: '⭐ Since Start', '7d': '7D', '30d': '30D', '90d': '90D', '1y': '1Y', custom: 'Custom',
  }

  return (
    <div className="compare-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Progress Compare</h1>
          <p className="page-subtitle">Pick a range, choose metrics, see what changed.</p>
        </div>
        {mockMode && <DataBadge mode="mock" />}
      </header>

      {/* ── Preset chips ── */}
      <div className="cmp-presets-row">
        {(['start', '7d', '30d', '90d', '1y', 'custom'] as Preset[]).map(p => (
          <button
            key={p}
            className={`cmp-preset ${preset === p ? 'cmp-preset--active' : ''} ${p === 'start' ? 'cmp-preset--star' : ''}`}
            onClick={() => applyPreset(p)}
            disabled={loading}
          >
            {p === 'start' && <Star size={11} />}
            {presetLabels[p]}
          </button>
        ))}
      </div>

      {/* ── Date range (custom) ── */}
      {preset === 'custom' && (
        <div className="cmp-date-row">
          <div className="cmp-date-group">
            <label className="cmp-date-label">From</label>
            <input type="date" className="cmp-date-input" value={dateA} max={dateB}
              onChange={e => { setDateA(e.target.value); setPreset('custom') }} />
          </div>
          <button className="cmp-swap" onClick={() => { const t = dateA; setDateA(dateB); setDateB(t) }}>
            <ArrowRightLeft size={15} />
          </button>
          <div className="cmp-date-group">
            <label className="cmp-date-label">To</label>
            <input type="date" className="cmp-date-input" value={dateB} min={dateA}
              onChange={e => { setDateB(e.target.value); setPreset('custom') }} />
          </div>
        </div>
      )}

      {/* ── Active date range display (non-custom) ── */}
      {preset !== 'custom' && (
        <div className="cmp-range-display">
          <span className="cmp-range-a">{fmtDate(dateA)}</span>
          <span className="cmp-range-arrow">→</span>
          <span className="cmp-range-b">{fmtDate(dateB)}</span>
          {result && (
            <span className="cmp-range-src">
              <DataBadge mode={sourceMode(result.snapA._source)} source={result.snapA._source} size="sm" />
              <DataBadge mode={sourceMode(result.snapB._source)} source={result.snapB._source} size="sm" />
            </span>
          )}
        </div>
      )}

      {/* ── Metric chip toggles ── */}
      <div className="cmp-chips-section">
        <div className="cmp-chips-header">
          <span className="cmp-chips-title">Metrics ({selectedMetrics.size} selected)</span>
          <button className="cmp-chips-toggle-all" onClick={() => setShowAllGroups(g => !g)}>
            {showAllGroups ? 'Collapse' : 'All metrics'}
          </button>
        </div>
        {(showAllGroups ? GROUPS : GROUPS.slice(0, 3)).map(group => (
          <div key={group} className="cmp-chip-group">
            <span className="cmp-chip-group-label">{group}</span>
            <div className="cmp-chip-row">
              {ALL_METRICS.filter(m => m.group === group).map(m => {
                const on = selectedMetrics.has(m.id)
                return (
                  <button
                    key={m.id}
                    className={`cmp-chip ${on ? 'cmp-chip--on' : ''}`}
                    style={on ? { borderColor: m.color, color: m.color } : undefined}
                    onClick={() => toggleMetric(m.id)}
                  >
                    {on && <Check size={10} />}
                    {m.label}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="cmp-error">
          <p>{error}</p>
          <div className="cmp-error-actions">
            <button onClick={() => navigate('/import/apple-health')}>Import Apple Health →</button>
            <button onClick={() => navigate('/log')}>Log manually →</button>
          </div>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && <div className="cmp-loading">Comparing…</div>}

      {/* ── Results ── */}
      {result && !loading && (
        <div className="cmp-results">

          {/* Summary */}
          {(wins.length > 0 || opps.length > 0) && (
            <div className="cmp-summary">
              {wins.length > 0 && (
                <div className="cmp-summary-block cmp-summary-block--win">
                  <span className="cmp-summary-icon">🏆</span>
                  <div>
                    <span className="cmp-summary-title">Biggest Wins</span>
                    {wins.slice(0, 3).map(w => <span key={w} className="cmp-summary-item">{w}</span>)}
                  </div>
                </div>
              )}
              {opps.length > 0 && (
                <div className="cmp-summary-block cmp-summary-block--opp">
                  <span className="cmp-summary-icon">📈</span>
                  <div>
                    <span className="cmp-summary-title">Focus Areas</span>
                    {opps.slice(0, 2).map(o => <span key={o} className="cmp-summary-item">{o}</span>)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Metric cards */}
          {visibleMetrics.length === 0 && (
            <p className="cmp-no-metrics">No metrics selected. Toggle some chips above to see data.</p>
          )}
          <div className="cmp-cards-grid">
            {visibleMetrics.map(m => (
              <MetricCard key={m.id} m={m} snapA={result.snapA} snapB={result.snapB}
                dateA={result.dateA} dateB={result.dateB} />
            ))}
          </div>

          {mockMode && (
            <p className="cmp-mock-note">
              Showing mock data.{' '}
              <button onClick={() => navigate('/import/apple-health')}>Import Apple Health</button>
              {' '}or{' '}
              <button onClick={() => navigate('/log')}>log manually</button>
              {' '}to compare real values.
            </p>
          )}
        </div>
      )}

      {/* ── Empty state ── */}
      {!result && !loading && !error && (
        <div className="cmp-empty">
          <ArrowRightLeft size={36} style={{ opacity: 0.3 }} />
          <p>Select a preset or choose dates to compare your progress.</p>
        </div>
      )}
    </div>
  )
}
