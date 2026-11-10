import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, Moon, Heart, Activity, TrendingUp, PenLine } from 'lucide-react'
import { useDashboardData } from '../hooks/useDashboardData'
import { getMetricHistory } from '../db/timelineStore'
import { getOwnedDevices, owns } from '../db/deviceStore'
import type { DeviceId } from '../db/deviceStore'
import './RecoveryPage.css'

function MetricCard({
  icon: Icon, label, value, unit, color, note, loggable,
}: {
  icon: React.ElementType
  label: string
  value?: number | null
  unit?: string
  color: string
  note?: string
  /** True for metrics a person can self-report (sleep, resting HR) — false for
      HRV/SpO2/respiratory, which nobody can know without a device. Only
      loggable metrics get a "Log it" nudge instead of a dead-end "No data". */
  loggable?: boolean
}) {
  const navigate = useNavigate()
  const hasData = value !== undefined && value !== null
  return (
    <div className="recovery-metric-card">
      <div className="recovery-metric-icon" style={{ color }}>
        <Icon size={18} />
      </div>
      <div className="recovery-metric-body">
        <span className="recovery-metric-label">{label}</span>
        {hasData ? (
          <span className="recovery-metric-value">
            {typeof value === 'number' ? value.toFixed(value % 1 === 0 ? 0 : 1) : '—'}
            {unit && <span className="recovery-metric-unit">{unit}</span>}
          </span>
        ) : loggable ? (
          <button className="recovery-metric-log-btn" onClick={() => navigate('/log')}>
            <PenLine size={11} /> Log it
          </button>
        ) : (
          <span className="recovery-metric-missing">No data</span>
        )}
        {note && <span className="recovery-metric-note">{note}</span>}
      </div>
    </div>
  )
}

function RecoveryRing({ score }: { score?: number | null }) {
  const pct = score ?? 0
  const radius = 54
  const circ = 2 * Math.PI * radius
  const dash = (pct / 100) * circ

  const color = pct >= 75 ? 'var(--green)' : pct >= 50 ? 'var(--blue)' : pct >= 25 ? 'var(--orange)' : 'var(--red)'
  const label = pct >= 75 ? 'Peak' : pct >= 50 ? 'Good' : pct >= 25 ? 'Fair' : 'Low'

  return (
    <div className="recovery-ring-wrap">
      <svg width="128" height="128" viewBox="0 0 128 128">
        <circle cx="64" cy="64" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
        {score != null && (
          <circle
            cx="64" cy="64" r={radius} fill="none"
            stroke={color} strokeWidth="10"
            strokeDasharray={`${dash} ${circ}`}
            strokeDashoffset={circ / 4}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 1.4s cubic-bezier(0.4,0,0.2,1)' }}
          />
        )}
        <text x="64" y="59" textAnchor="middle" fill="var(--text-primary)" fontSize="26" fontWeight="700">
          {score != null ? Math.round(score) : '—'}
        </text>
        <text x="64" y="76" textAnchor="middle" fill="var(--text-tertiary)" fontSize="11" fontWeight="500">
          {score != null ? label : 'No data'}
        </text>
      </svg>
      <p className="recovery-ring-label">Recovery Score</p>
    </div>
  )
}

function useBaseline(metricType: string, currentValue?: number | null) {
  const [baseline, setBaseline] = useState<number | null>(null)

  useEffect(() => {
    getMetricHistory(metricType, 30).then(pts => {
      if (pts.length < 5) return
      const avg = pts.reduce((s, p) => s + p.value, 0) / pts.length
      setBaseline(avg)
    })
  }, [metricType])

  if (!baseline || !currentValue) return null
  const pct = Math.round(((currentValue - baseline) / baseline) * 100)
  if (Math.abs(pct) < 2) return null
  return { pct, above: pct > 0 }
}

export default function RecoveryPage() {
  const navigate = useNavigate()
  const { today, loading } = useDashboardData()
  const hrvBaseline   = useBaseline('hrv', today.hrv)
  const sleepBaseline = useBaseline('sleepHours', today.sleepHours)
  const hrBaseline    = useBaseline('restingHeartRate', today.restingHeartRate)
  const [ownedDevices, setOwnedDevices] = useState<DeviceId[] | null>(null)

  useEffect(() => { getOwnedDevices().then(setOwnedDevices) }, [])

  if (loading) return <div className="recovery-page"><p style={{ color: 'var(--text-tertiary)', padding: 24 }}>Loading…</p></div>

  const hasRingConn = owns(ownedDevices, 'ringconn')

  return (
    <div className="recovery-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Recovery</h1>
          <p className="page-subtitle">Sleep · HRV · Readiness</p>
        </div>
      </header>

      <div className="recovery-hero">
        <RecoveryRing score={today.recoveryScore} />

        <div className="recovery-hero-metrics">
          <MetricCard
            icon={Moon}
            label="Sleep"
            value={today.sleepHours}
            unit="hrs"
            color="var(--purple)"
            loggable
            note={
              sleepBaseline
                ? `${Math.abs(sleepBaseline.pct)}% ${sleepBaseline.above ? 'above' : 'below'} your normal`
                : today.sleepScore != null ? `Score ${Math.round(today.sleepScore)}` : undefined
            }
          />
          <MetricCard
            icon={Activity}
            label="HRV"
            value={today.hrv}
            unit="ms"
            color="var(--teal)"
            note={
              hrvBaseline
                ? `${Math.abs(hrvBaseline.pct)}% ${hrvBaseline.above ? 'above' : 'below'} your normal`
                : undefined
            }
          />
          <MetricCard
            icon={Heart}
            label="Resting HR"
            value={today.restingHeartRate}
            unit="bpm"
            color="var(--red)"
            loggable
            note={
              hrBaseline
                ? `${Math.abs(hrBaseline.pct)}% ${hrBaseline.above ? 'above' : 'below'} your normal`
                : undefined
            }
          />
          <MetricCard
            icon={Activity}
            label="SpO2"
            value={today.spO2}
            unit="%"
            color="var(--blue)"
            note={today.spO2 != null ? (today.spO2 >= 95 ? 'Normal range' : 'Below normal — consider retesting') : undefined}
          />
          <MetricCard
            icon={Activity}
            label="Respiratory Rate"
            value={today.respiratoryRate}
            unit="brpm"
            color="var(--teal)"
            note={today.respiratoryRate != null ? 'Breaths per minute during sleep' : undefined}
          />
        </div>
      </div>

      {!today.recoveryScore && !today.sleepHours && !today.hrv && !today.restingHeartRate && (
        <div className="recovery-empty">
          <Zap size={32} style={{ opacity: 0.25, marginBottom: 12 }} />
          <p className="recovery-empty-title">No recovery data yet</p>
          <p className="recovery-empty-desc">
            No equipment needed to start: log how you slept and your resting heart rate yourself, right now.
            {' '}HRV, SpO2, and respiratory rate do need a wearable — those come in automatically if you have an Apple Watch, RingConn, or similar synced through Apple Health.
          </p>
          <button className="recovery-empty-log-btn" onClick={() => navigate('/log')}>
            <PenLine size={14} /> Log today
          </button>
        </div>
      )}

      {hasRingConn && (
        <div className="recovery-honesty-box" style={{ marginTop: 20, padding: '14px 16px', background: 'rgba(255,255,255,0.04)', borderRadius: 12 }}>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8, fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' }}>What Apple Health exposes from RingConn</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { label: 'Sleep duration', available: true },
              { label: 'HRV (SDNN)', available: true },
              { label: 'Resting heart rate', available: true },
              { label: 'SpO2 (blood oxygen)', available: true },
              { label: 'Respiratory rate', available: true },
              { label: 'Sleep score', available: false, reason: 'RingConn keeps this in-app only' },
              { label: 'Stress / Relax score', available: false, reason: 'Not exposed to Apple Health' },
              { label: 'Recovery score', available: false, reason: 'Not exposed to Apple Health' },
            ].map(({ label, available, reason }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13 }}>
                <span style={{ color: available ? 'var(--green)' : 'var(--text-tertiary)', minWidth: 14 }}>{available ? '✓' : '✗'}</span>
                <span style={{ color: available ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{label}</span>
                {!available && reason && <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>— {reason}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="recovery-coming-section">
        <p className="recovery-coming-label">Coming next</p>
        <div className="recovery-coming-grid">
          {[
            { icon: TrendingUp, text: '7-day HRV trend' },
            { icon: Moon, text: 'Sleep stage breakdown' },
            { icon: Activity, text: 'Readiness timeline' },
            { icon: Heart, text: 'HR variability history' },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="recovery-coming-item">
              <Icon size={14} />
              <span>{text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
