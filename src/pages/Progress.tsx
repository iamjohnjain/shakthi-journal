import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { kgToLbs } from '../data/config'
import { useDashboardData } from '../hooks/useDashboardData'
import { getProfile } from '../db/profileStore'
import { getDBStats } from '../db'
import type { ProfileData } from '../db/profileStore'
import type { DailySnapshot } from '../types/health'
import './Progress.css'

interface CompMetric {
  label: string
  before: string
  after: string
  delta: string
  direction: 'up' | 'down' | 'neutral'
  good: boolean
}

function DeltaChip({ metric }: { metric: CompMetric }) {
  const Icon = metric.direction === 'up' ? TrendingUp : metric.direction === 'down' ? TrendingDown : Minus
  const isNeutral = metric.direction === 'neutral'
  const color = isNeutral ? 'var(--text-tertiary)' : metric.good ? 'var(--green)' : 'var(--red)'
  const bg    = isNeutral ? 'rgba(255,255,255,0.05)' : metric.good ? 'var(--green-dim)' : 'var(--red-dim)'
  return (
    <span className="prog-delta-chip" style={{ color, background: bg }}>
      <Icon size={11} />
      {metric.delta}
    </span>
  )
}

function buildMetrics(profile: ProfileData | null, today: DailySnapshot): CompMetric[] {
  const out: CompMetric[] = []

  if (profile?.startWeightKg && today.weight) {
    const startLbs = kgToLbs(profile.startWeightKg)
    const nowLbs   = kgToLbs(today.weight)
    const d = +(nowLbs - startLbs).toFixed(1)
    out.push({
      label: 'Weight',
      before: `${startLbs} lbs`,
      after:  `${nowLbs} lbs`,
      delta:  `${d >= 0 ? '+' : ''}${d} lbs`,
      direction: d < 0 ? 'down' : d > 0 ? 'up' : 'neutral',
      good: d <= 0,
    })
  }

  if (profile?.startBodyFatPct != null && today.bodyFatPct != null) {
    const d = +(today.bodyFatPct - profile.startBodyFatPct).toFixed(1)
    out.push({
      label: 'Body Fat',
      before: `${profile.startBodyFatPct}%`,
      after:  `${today.bodyFatPct.toFixed(1)}%`,
      delta:  `${d >= 0 ? '+' : ''}${d}%`,
      direction: d < 0 ? 'down' : d > 0 ? 'up' : 'neutral',
      good: d <= 0,
    })
  }

  if (today.muscleMassKg != null) {
    out.push({
      label: 'Muscle Mass',
      before: '—',
      after:  `${kgToLbs(today.muscleMassKg)} lbs`,
      delta:  'Today',
      direction: 'neutral',
      good: true,
    })
  }

  if (today.hrv != null) {
    out.push({
      label: 'HRV',
      before: '—',
      after:  `${today.hrv} ms`,
      delta:  'Today',
      direction: 'neutral',
      good: true,
    })
  }

  if (today.restingHeartRate != null) {
    out.push({
      label: 'Resting HR',
      before: '—',
      after:  `${today.restingHeartRate} bpm`,
      delta:  'Today',
      direction: 'neutral',
      good: true,
    })
  }

  if (today.sleepHours != null) {
    out.push({
      label: 'Sleep',
      before: '—',
      after:  `${today.sleepHours.toFixed(1)}h`,
      delta:  'Today',
      direction: 'neutral',
      good: true,
    })
  }

  if (today.steps != null) {
    out.push({
      label: 'Daily Steps',
      before: '—',
      after:  today.steps.toLocaleString(),
      delta:  'Today',
      direction: 'neutral',
      good: true,
    })
  }

  return out
}

function daysSince(dateStr: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr + 'T12:00:00').getTime()) / 86400000))
}

export default function Progress() {
  const navigate = useNavigate()
  const { today, loading: dataLoading } = useDashboardData()
  const [profile,  setProfile]  = useState<ProfileData | null>(null)
  const [dbStats,  setDbStats]  = useState<{ workoutCount: number; logCount: number } | null>(null)
  const [loaded,   setLoaded]   = useState(false)

  useEffect(() => {
    Promise.all([getProfile(), getDBStats()]).then(([p, s]) => {
      setProfile(p)
      setDbStats({ workoutCount: s.workoutCount, logCount: s.logCount })
      setLoaded(true)
    })
  }, [])

  if (dataLoading || !loaded) {
    return (
      <div className="progress-page">
        <p className="prog-loading">Loading…</p>
      </div>
    )
  }

  const hasProfile = !!profile?.startDate
  const metrics    = hasProfile ? buildMetrics(profile, today) : []
  const daysTracked = profile?.startDate ? daysSince(profile.startDate) : 0
  const improvements = metrics.filter(m => m.direction !== 'neutral' && m.good).length

  const startLabel = profile?.startDate
    ? new Date(profile.startDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  if (!hasProfile) {
    return (
      <div className="progress-page">
        <header className="prog-header">
          <h1 className="prog-title">Progress</h1>
          <p className="prog-subtitle">Track how you've changed over time</p>
        </header>
        <div className="prog-empty-state">
          <span className="prog-empty-icon">📈</span>
          <p className="prog-empty-title">No baseline yet</p>
          <p className="prog-empty-desc">
            Complete your profile setup to record your starting point.
            Progress is measured by comparing your starting baseline against your current metrics.
          </p>
          <button className="prog-empty-btn" onClick={() => navigate('/onboarding?edit=1')}>
            Set up profile
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="progress-page">

      <header className="prog-header">
        <h1 className="prog-title">Progress</h1>
        <p className="prog-subtitle">
          {startLabel ? `Since ${startLabel}` : 'Track how you\'ve changed over time'}
        </p>
      </header>

      {/* Date span summary */}
      <div className="prog-dates-card">
        <div className="prog-date-col">
          <span className="prog-date-role">Started</span>
          <span className="prog-date-value">{startLabel ?? '—'}</span>
        </div>
        <div className="prog-arrow">→</div>
        <div className="prog-date-col">
          <span className="prog-date-role">Today</span>
          <span className="prog-date-value">
            {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
        {daysTracked > 0 && (
          <div className="prog-summary-pill">
            {daysTracked} {daysTracked === 1 ? 'day' : 'days'} tracked
          </div>
        )}
        {improvements > 0 && (
          <div className="prog-summary-pill prog-summary-pill--green">
            <span>↑</span> {improvements} improving
          </div>
        )}
      </div>

      {/* Activity counts */}
      {((dbStats?.workoutCount ?? 0) > 0 || (dbStats?.logCount ?? 0) > 0) && (
        <div className="prog-activity-strip">
          {(dbStats?.workoutCount ?? 0) > 0 && (
            <div className="prog-activity-stat">
              <span className="prog-activity-val">{dbStats!.workoutCount}</span>
              <span className="prog-activity-label">Workouts</span>
            </div>
          )}
          {(dbStats?.logCount ?? 0) > 0 && (
            <div className="prog-activity-stat">
              <span className="prog-activity-val">{dbStats!.logCount}</span>
              <span className="prog-activity-label">Daily logs</span>
            </div>
          )}
          {daysTracked > 0 && (
            <div className="prog-activity-stat">
              <span className="prog-activity-val">{daysTracked}</span>
              <span className="prog-activity-label">Days</span>
            </div>
          )}
        </div>
      )}

      {/* Metrics comparison */}
      {metrics.length > 0 ? (
        <div className="prog-metrics-grid">
          {metrics.map(m => (
            <div key={m.label} className="prog-metric-card">
              <div className="prog-metric-top">
                <span className="prog-metric-label">{m.label}</span>
                <DeltaChip metric={m} />
              </div>
              <div className="prog-metric-compare">
                <div className="prog-metric-col">
                  <span className="prog-metric-role">Start</span>
                  <span className="prog-metric-val prog-metric-val--before">{m.before}</span>
                </div>
                <div className="prog-metric-divider" />
                <div className="prog-metric-col">
                  <span className="prog-metric-role">Now</span>
                  <span
                    className="prog-metric-val"
                    style={{ color: m.direction !== 'neutral' && m.good ? 'var(--green)' : 'inherit' }}
                  >
                    {m.after}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="prog-no-data-card">
          <span className="prog-no-data-icon">📊</span>
          <p className="prog-no-data-title">No trend yet</p>
          <p className="prog-no-data-desc">
            {profile?.startWeightKg
              ? 'Log your weight daily or import Apple Health data to start seeing changes here.'
              : 'Set a starting weight in your profile, then log daily to track changes.'}
          </p>
          <div className="prog-no-data-actions">
            <button className="prog-empty-btn" onClick={() => navigate('/import/apple-health')}>
              Import Apple Health
            </button>
            <button className="prog-empty-btn prog-empty-btn--ghost" onClick={() => navigate('/log')}>
              Log today
            </button>
          </div>
        </div>
      )}

      {/* Charts coming */}
      <div className="prog-chart-placeholder">
        <div className="prog-chart-inner">
          <span className="prog-chart-icon">📈</span>
          <p className="prog-chart-title">Trend charts coming soon</p>
          <p className="prog-chart-sub">
            Weight, body fat, and performance trends will visualize here
            once you have multiple days of data.
          </p>
        </div>
      </div>

    </div>
  )
}
