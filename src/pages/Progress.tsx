import { useState } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { mockDailySnapshots } from '../data/mock'
import { kgToLbs } from '../data/config'
import './Progress.css'

type Range = '7d' | '30d' | '90d' | '1y'

const RANGES: { key: Range; label: string }[] = [
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '1 Month' },
  { key: '90d', label: '3 Months' },
  { key: '1y', label: '1 Year' },
]

const start = mockDailySnapshots[mockDailySnapshots.length - 1]
const end   = mockDailySnapshots[0]

interface CompMetric {
  label: string
  before: string
  after: string
  delta: string
  direction: 'up' | 'down' | 'neutral'
  good: boolean
  unit?: string
}

function buildMetrics(): CompMetric[] {
  return [
    {
      label: 'Weight',
      before: `${kgToLbs(start.weight ?? 91.6)} lbs`,
      after:  `${kgToLbs(end.weight ?? 90.3)} lbs`,
      delta: `${(kgToLbs(end.weight ?? 90.3) - kgToLbs(start.weight ?? 91.6)).toFixed(1)} lbs`,
      direction: (end.weight ?? 90.3) < (start.weight ?? 91.6) ? 'down' : 'up',
      good: (end.weight ?? 90.3) < (start.weight ?? 91.6),
    },
    {
      label: 'Body Fat',
      before: `${start.bodyFatPct ?? 17.9}%`,
      after:  `${end.bodyFatPct ?? 17.2}%`,
      delta: `${((end.bodyFatPct ?? 17.2) - (start.bodyFatPct ?? 17.9)).toFixed(1)}%`,
      direction: (end.bodyFatPct ?? 17.2) < (start.bodyFatPct ?? 17.9) ? 'down' : 'up',
      good: (end.bodyFatPct ?? 17.2) < (start.bodyFatPct ?? 17.9),
    },
    {
      label: 'Muscle Mass',
      before: `${start.muscleMassKg ?? 70.8} kg`,
      after:  `${end.muscleMassKg ?? 71.3} kg`,
      delta: `+${((end.muscleMassKg ?? 71.3) - (start.muscleMassKg ?? 70.8)).toFixed(1)} kg`,
      direction: 'up',
      good: true,
    },
    {
      label: 'Resting HR',
      before: `${start.restingHeartRate ?? 56} bpm`,
      after:  `${end.restingHeartRate ?? 52} bpm`,
      delta: `${((end.restingHeartRate ?? 52) - (start.restingHeartRate ?? 56))} bpm`,
      direction: 'down',
      good: true,
    },
    {
      label: 'HRV',
      before: `${start.hrv ?? 55} ms`,
      after:  `${end.hrv ?? 68} ms`,
      delta: `+${((end.hrv ?? 68) - (start.hrv ?? 55))} ms`,
      direction: 'up',
      good: true,
    },
    {
      label: 'Sleep',
      before: `${start.sleepHours ?? 6.5}h`,
      after:  `${end.sleepHours ?? 7.4}h`,
      delta: `+${((end.sleepHours ?? 7.4) - (start.sleepHours ?? 6.5)).toFixed(1)}h`,
      direction: 'up',
      good: true,
    },
    {
      label: 'Recovery',
      before: `${start.recoveryScore ?? 65}`,
      after:  `${end.recoveryScore ?? 84}`,
      delta: `+${((end.recoveryScore ?? 84) - (start.recoveryScore ?? 65))}`,
      direction: 'up',
      good: true,
    },
    {
      label: 'Avg Protein',
      before: `${start.proteinG ?? 195}g`,
      after:  `${end.proteinG ?? 198}g`,
      delta: `+${((end.proteinG ?? 198) - (start.proteinG ?? 195))}g`,
      direction: 'up',
      good: true,
    },
    {
      label: 'Daily Steps',
      before: `${(start.steps ?? 7800).toLocaleString()}`,
      after:  `${(end.steps ?? 9842).toLocaleString()}`,
      delta: `+${((end.steps ?? 9842) - (start.steps ?? 7800)).toLocaleString()}`,
      direction: 'up',
      good: true,
    },
  ]
}

function DeltaChip({ metric }: { metric: CompMetric }) {
  const Icon = metric.direction === 'up' ? TrendingUp : metric.direction === 'down' ? TrendingDown : Minus
  const color = metric.good ? 'var(--green)' : 'var(--red)'
  return (
    <span className="prog-delta-chip" style={{ color, background: metric.good ? 'var(--green-dim)' : 'var(--red-dim)' }}>
      <Icon size={11} />
      {metric.delta}
    </span>
  )
}

export default function Progress() {
  const [range, setRange] = useState<Range>('7d')
  const metrics = buildMetrics()
  const improvements = metrics.filter(m => m.good).length

  const startLabel = range === '7d' ? `${start.date}` : '— (limited mock data)'
  const endLabel   = end.date

  return (
    <div className="progress-page">

      <header className="prog-header">
        <div>
          <h1 className="prog-title">Progress</h1>
          <p className="prog-subtitle">Track how you've changed over time</p>
        </div>
      </header>

      {/* Range selector */}
      <div className="prog-range-row">
        {RANGES.map(r => (
          <button
            key={r.key}
            className={`prog-range-btn ${range === r.key ? 'active' : ''}`}
            onClick={() => setRange(r.key)}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Comparison dates */}
      <div className="prog-dates-card">
        <div className="prog-date-col">
          <span className="prog-date-role">From</span>
          <span className="prog-date-value">{startLabel}</span>
        </div>
        <div className="prog-arrow">→</div>
        <div className="prog-date-col">
          <span className="prog-date-role">To</span>
          <span className="prog-date-value">{endLabel}</span>
        </div>
        <div className="prog-summary-pill">
          <span style={{ color: 'var(--green)' }}>↑</span> {improvements}/{metrics.length} improving
        </div>
      </div>

      {/* Metrics comparison */}
      <div className="prog-metrics-grid">
        {metrics.map(m => (
          <div key={m.label} className="prog-metric-card">
            <div className="prog-metric-top">
              <span className="prog-metric-label">{m.label}</span>
              <DeltaChip metric={m} />
            </div>
            <div className="prog-metric-compare">
              <div className="prog-metric-col">
                <span className="prog-metric-role">Before</span>
                <span className="prog-metric-val prog-metric-val--before">{m.before}</span>
              </div>
              <div className="prog-metric-divider" />
              <div className="prog-metric-col">
                <span className="prog-metric-role">Now</span>
                <span className="prog-metric-val" style={{ color: m.good ? 'var(--green)' : 'inherit' }}>
                  {m.after}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Chart placeholder */}
      <div className="prog-chart-placeholder">
        <div className="prog-chart-inner">
          <span className="prog-chart-icon">📈</span>
          <p className="prog-chart-title">Charts coming next</p>
          <p className="prog-chart-sub">Weight, body fat, and performance trends will visualize here once connected to live Apple Health data.</p>
        </div>
      </div>

    </div>
  )
}
