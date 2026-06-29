import { Zap, Moon, Heart, Activity, TrendingUp } from 'lucide-react'
import { useDashboardData } from '../hooks/useDashboardData'
import './RecoveryPage.css'

function MetricCard({
  icon: Icon, label, value, unit, color, note,
}: {
  icon: React.ElementType
  label: string
  value?: number | null
  unit?: string
  color: string
  note?: string
}) {
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

export default function RecoveryPage() {
  const { today, loading } = useDashboardData()

  if (loading) return <div className="recovery-page"><p style={{ color: 'var(--text-tertiary)', padding: 24 }}>Loading…</p></div>

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
            note={today.sleepScore != null ? `Score ${Math.round(today.sleepScore)}` : undefined}
          />
          <MetricCard
            icon={Activity}
            label="HRV"
            value={today.hrv}
            unit="ms"
            color="var(--teal)"
          />
          <MetricCard
            icon={Heart}
            label="Resting HR"
            value={today.restingHeartRate}
            unit="bpm"
            color="var(--red)"
          />
        </div>
      </div>

      {!today.recoveryScore && !today.sleepHours && !today.hrv && !today.restingHeartRate && (
        <div className="recovery-empty">
          <Zap size={32} style={{ opacity: 0.25, marginBottom: 12 }} />
          <p className="recovery-empty-title">No recovery data yet</p>
          <p className="recovery-empty-desc">
            Connect Apple Watch or import Apple Health data to see your HRV, sleep, and resting heart rate.
            <br /><br />
            Go to <strong>Settings → Import Data</strong> to get started.
          </p>
        </div>
      )}

      <div className="recovery-coming-section">
        <p className="recovery-coming-label">COMING IN PHASE 8</p>
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
