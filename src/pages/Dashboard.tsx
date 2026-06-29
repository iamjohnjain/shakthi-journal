import { useState, useEffect } from 'react'
import { Sparkles, TrendingDown, TrendingUp, Minus, Plus, Dumbbell, Utensils, Download, ArrowLeftRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { GOALS, kgToLbs, getGreeting, formatDate, recoveryColor } from '../data/config'
import { useDashboardData } from '../hooks/useDashboardData'
import { useCoachNotes } from '../hooks/useCoachNotes'
import { useDashboardCards } from '../hooks/useDashboardCards'
import { MockModeBanner } from '../components/DataBadge'
import DataBadge from '../components/DataBadge'
import GoalRing from '../components/GoalRing'
import type { DataBadgeMode } from '../components/DataBadge'
import type { DailySnapshot } from '../types/health'
import type { CoachNote, TodayStatus } from '../hooks/useCoachNotes'
import './Dashboard.css'

function delta(curr: number, prev: number) {
  return +(curr - prev).toFixed(1)
}

function pct(curr: number, prev: number) {
  return +(((curr - prev) / prev) * 100).toFixed(1)
}

// ─── Metric Card ─────────────────────────────────────────────────────────────

type Trend = 'up' | 'down' | 'neutral'

interface MetricCardProps {
  label: string
  value?: string | number
  unit?: string
  sub?: string
  trend?: Trend
  trendLabel?: string
  trendPositive?: boolean
  accentColor?: string
  progress?: number
  progressColor?: string
  progressMax?: number
  wide?: boolean
  empty?: boolean
  emptyPrompt?: string
  onEmptyClick?: () => void
}

function MetricCard({
  label, value, unit, sub, trend, trendLabel, trendPositive = true,
  accentColor, progress, progressColor, progressMax = 100, wide,
  empty, emptyPrompt, onEmptyClick,
}: MetricCardProps) {
  const [ready, setReady] = useState(false)
  useEffect(() => { const t = setTimeout(() => setReady(true), 200); return () => clearTimeout(t) }, [])

  if (empty) {
    return (
      <div className={`metric-card metric-card--empty ${wide ? 'metric-card--wide' : ''}`}>
        <span className="metric-label">{label}</span>
        <span className="metric-empty-dash">—</span>
        {emptyPrompt && (
          <button className="metric-log-btn" onClick={onEmptyClick}>
            <Plus size={11} /> {emptyPrompt}
          </button>
        )}
      </div>
    )
  }

  const isGoodTrend = (trend === 'up' && trendPositive) || (trend === 'down' && !trendPositive)
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus
  const trendColor = isGoodTrend ? 'var(--green)' : trend === 'neutral' ? 'var(--text-tertiary)' : 'var(--red)'
  const fillPct = progress != null ? Math.min((progress / (progressMax ?? 100)) * 100, 100) : null

  return (
    <div className={`metric-card ${wide ? 'metric-card--wide' : ''}`}>
      <div className="metric-card-top">
        <span className="metric-label">{label}</span>
        {trend && trendLabel && (
          <span className="metric-trend" style={{ color: trendColor }}>
            <TrendIcon size={11} />
            {trendLabel}
          </span>
        )}
      </div>
      <div className="metric-value-row">
        <span className="metric-value" style={accentColor ? { color: accentColor } : {}}>
          {value}
        </span>
        {unit && <span className="metric-unit">{unit}</span>}
      </div>
      {sub && <p className="metric-sub">{sub}</p>}
      {fillPct != null && (
        <div className="metric-progress-track">
          <div
            className="metric-progress-fill"
            style={{
              width: ready ? `${fillPct}%` : '0%',
              background: progressColor ?? 'var(--blue)',
              transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        </div>
      )}
    </div>
  )
}

// ─── Daily Brief Card ────────────────────────────────────────────────────────

function DailyBriefCard({ today, yesterday, todayStatus, coachNotes, isMock, onWorkout, onNutrition }: {
  today: DailySnapshot
  yesterday: DailySnapshot
  todayStatus: TodayStatus | null
  coachNotes: CoachNote[]
  isMock: boolean
  onWorkout: () => void
  onNutrition: () => void
}) {
  const [animated, setAnimated] = useState(false)
  useEffect(() => { const t = setTimeout(() => setAnimated(true), 120); return () => clearTimeout(t) }, [])

  const recovery = today.recoveryScore ?? (isMock ? 84 : 75)
  const color = recoveryColor(recovery)
  const recovLabel = recovery >= 80 ? 'Optimal' : recovery >= 60 ? 'Good' : recovery >= 40 ? 'Fair' : 'Low'
  const R = 40; const C = 2 * Math.PI * R
  const offset = C - (recovery / 100) * C

  const weightLbs     = today.weight ? kgToLbs(today.weight) : undefined
  const prevWeightLbs = yesterday.weight ? kgToLbs(yesterday.weight) : undefined
  const weightDelta   = weightLbs != null && prevWeightLbs != null ? +(weightLbs - prevWeightLbs).toFixed(1) : null

  const yProtein    = yesterday.proteinG
  const proteinHit  = yProtein != null && yProtein >= GOALS.proteinG * 0.9

  const priority = coachNotes.find(n => n.severity === 'action' || n.severity === 'warning') ?? coachNotes[0]

  const proteinPct = todayStatus ? Math.min(100, (todayStatus.proteinTotal / GOALS.proteinG) * 100) : 0
  const stepsPct   = todayStatus ? Math.min(100, (todayStatus.stepsToday / GOALS.steps) * 100) : 0

  return (
    <section className="daily-brief">
      <div className="brief-main">
        {/* Compact recovery ring */}
        <div className="brief-ring-col">
          <svg width="96" height="96" viewBox="0 0 100 100">
            <defs>
              <filter id="brief-glow">
                <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
                <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="9" />
            <circle cx="50" cy="50" r={R} fill="none"
              stroke={color} strokeWidth="9" strokeLinecap="round"
              strokeDasharray={`${C} ${C}`}
              strokeDashoffset={animated ? offset : C}
              transform="rotate(-90 50 50)"
              filter="url(#brief-glow)"
              style={{ transition: 'stroke-dashoffset 1.4s cubic-bezier(0.4,0,0.2,1)' }}
            />
            <text x="50" y="46" textAnchor="middle" dominantBaseline="middle"
              fill="#fff" fontSize="22" fontWeight="700" fontFamily="-apple-system,sans-serif">
              {recovery}
            </text>
            <text x="50" y="63" textAnchor="middle"
              fill="rgba(255,255,255,0.4)" fontSize="9.5" fontWeight="500" fontFamily="-apple-system,sans-serif">
              {recovLabel}
            </text>
          </svg>
          <span className="brief-ring-label">Recovery</span>
        </div>

        {/* Stats grid */}
        <div className="brief-stats">
          <div className="brief-stat">
            <span className="brief-stat-label">Sleep</span>
            <span className="brief-stat-value" style={{ color: 'var(--purple)' }}>
              {today.sleepHours ? `${today.sleepHours.toFixed(1)}h` : isMock ? '7.5h' : '—'}
            </span>
            <span className="brief-stat-sub">
              {today.sleepScore ? `Score ${today.sleepScore}` : isMock ? 'Score 88' : ''}
            </span>
          </div>

          <div className="brief-stat">
            <span className="brief-stat-label">Weight</span>
            <span className="brief-stat-value">
              {weightLbs ? `${weightLbs.toFixed(1)} lbs` : isMock ? '201.0 lbs' : '—'}
            </span>
            {weightDelta != null ? (
              <span className={`brief-stat-delta ${weightDelta < 0 ? 'brief-delta--good' : 'brief-delta--neutral'}`}>
                {weightDelta < 0 ? '▼' : '▲'} {Math.abs(weightDelta)} lbs
              </span>
            ) : <span className="brief-stat-sub">vs yesterday</span>}
          </div>

          <div className="brief-stat">
            <span className="brief-stat-label">Protein Yesterday</span>
            <span className="brief-stat-value" style={{ color: (proteinHit || (isMock && yProtein == null)) ? 'var(--green)' : 'var(--text-primary)' }}>
              {yProtein != null ? `${Math.round(yProtein)}g` : isMock ? '198g' : '—'}
            </span>
            <span className="brief-stat-sub">
              {yProtein != null ? (proteinHit ? '✓ Goal hit' : `/ ${GOALS.proteinG}g goal`) : isMock ? '✓ Goal hit' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Today's progress row */}
      <div className="brief-today-row">
        <div className="brief-today-left">
          {todayStatus?.workoutLogged ? (
            <span className="brief-workout-done">
              ✓ {todayStatus.workoutType
                ? todayStatus.workoutType.replace(/-/g,' ').replace(/\b\w/g, c => c.toUpperCase())
                : 'Workout'} · {todayStatus.workoutDuration}min
            </span>
          ) : (
            <button className="brief-log-btn brief-log-btn--workout" onClick={onWorkout}>
              Log Workout
            </button>
          )}
          <button className="brief-log-btn brief-log-btn--food" onClick={onNutrition}>
            Log Food
          </button>
        </div>
        {todayStatus && (
          <div className="brief-mini-stats">
            <div className="brief-mini-item">
              <span className="brief-mini-label">Protein</span>
              <div className="brief-mini-track">
                <div className="brief-mini-fill" style={{ width: `${proteinPct}%`, background: 'var(--green)' }} />
              </div>
              <span className="brief-mini-val">{todayStatus.proteinTotal}g</span>
            </div>
            <div className="brief-mini-item">
              <span className="brief-mini-label">Steps</span>
              <div className="brief-mini-track">
                <div className="brief-mini-fill" style={{ width: `${stepsPct}%`, background: 'var(--blue)' }} />
              </div>
              <span className="brief-mini-val">{todayStatus.stepsToday.toLocaleString()}</span>
            </div>
          </div>
        )}
      </div>

      {/* Priority note */}
      {priority && (
        <div className={`brief-priority brief-priority--${priority.severity}`}>
          <span className="brief-priority-icon">{priority.icon}</span>
          <div className="brief-priority-text">
            <span className="brief-priority-title">{priority.title}</span>
            <span className="brief-priority-body">{priority.body}</span>
          </div>
        </div>
      )}
    </section>
  )
}

// ─── Section wrapper ─────────────────────────────────────────────────────────

function Section({
  title, children, badgeMode, badgeSource,
}: {
  title: string
  children: React.ReactNode
  badgeMode?: DataBadgeMode
  badgeSource?: string
}) {
  return (
    <section className="dash-section">
      <div className="dash-section-header">
        <h2 className="dash-section-title">{title}</h2>
        {badgeMode && <DataBadge mode={badgeMode} source={badgeSource} size="sm" />}
      </div>
      <div className="metric-grid">{children}</div>
    </section>
  )
}

// ─── Quick Actions ───────────────────────────────────────────────────────────

function QuickActions() {
  const navigate = useNavigate()
  const actions = [
    { icon: Utensils,      label: 'Log Food',    path: '/nutrition',          color: 'var(--green)'  },
    { icon: Dumbbell,      label: 'Log Workout', path: '/workouts',           color: 'var(--blue)'   },
    { icon: Download,      label: 'Import Data', path: '/import/apple-health',color: 'var(--purple)' },
    { icon: ArrowLeftRight,label: 'Compare',     path: '/compare',            color: 'var(--orange)' },
  ]
  return (
    <div className="quick-actions">
      {actions.map(a => (
        <button key={a.path} className="quick-action-btn" onClick={() => navigate(a.path)}>
          <span className="quick-action-icon" style={{ color: a.color }}>
            <a.icon size={17} />
          </span>
          <span className="quick-action-label">{a.label}</span>
        </button>
      ))}
    </div>
  )
}

// ─── Coach Notes ─────────────────────────────────────────────────────────────

function CoachNotesCard({ notes }: { notes: ReturnType<typeof useCoachNotes>['notes'] }) {
  if (notes.length === 0) return null
  const severityColor: Record<string, string> = {
    positive: 'var(--green)',
    action:   'var(--accent)',
    warning:  'var(--orange)',
    tip:      'var(--text-secondary)',
  }
  return (
    <section className="coach-notes-card">
      <div className="coach-notes-header">
        <Sparkles size={14} className="coach-notes-icon" />
        <span>Today's Coach Notes</span>
        <span className="coach-notes-badge">LOCAL · NO AI</span>
      </div>
      <div className="coach-notes-list">
        {notes.map(n => (
          <div key={n.id} className={`coach-note coach-note--${n.severity}`}>
            <span className="coach-note-icon">{n.icon}</span>
            <div className="coach-note-body">
              <div className="coach-note-title" style={{ color: severityColor[n.severity] }}>{n.title}</div>
              <div className="coach-note-text">{n.body}</div>
              <div className="coach-note-meta">
                {n.sources.map(s => <span key={s} className="coach-note-src">{s}</span>)}
                {n.missing?.map(m => <span key={m} className="coach-note-src coach-note-src--missing">Missing: {m}</span>)}
                <span className={`coach-note-confidence coach-note-confidence--${n.confidence}`}>
                  {n.confidence === 'high' ? 'High confidence' : n.confidence === 'medium' ? 'Moderate confidence' : 'Low confidence'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate()
  const { today, yesterday, dataSource, nutritionSource, hasNutritionLog } = useDashboardData()
  const { notes: coachNotes, status: todayStatus } = useCoachNotes(today, dataSource)
  const { isVisible } = useDashboardCards()

  const isMock = dataSource === 'mock'

  // ── Body ──
  const weightLbs     = today.weight ? kgToLbs(today.weight) : undefined
  const prevWeightLbs = yesterday.weight ? kgToLbs(yesterday.weight) : undefined
  const weightDelta   = weightLbs != null && prevWeightLbs != null ? delta(weightLbs, prevWeightLbs) : null
  const bodyFatDelta  = today.bodyFatPct != null && yesterday.bodyFatPct != null
    ? delta(today.bodyFatPct, yesterday.bodyFatPct) : null
  const muscleDelta   = today.muscleMassKg != null && yesterday.muscleMassKg != null
    ? delta(today.muscleMassKg, yesterday.muscleMassKg) : null
  const hrvDelta      = today.hrv != null && yesterday.hrv != null ? delta(today.hrv, yesterday.hrv) : null
  const hrDelta       = today.restingHeartRate != null && yesterday.restingHeartRate != null
    ? delta(today.restingHeartRate, yesterday.restingHeartRate) : null

  // ── Nutrition ──
  const protein   = today.proteinG
  const calories  = today.caloriesIn
  const water     = today.waterMl
  const steps     = today.steps

  const proteinPct  = protein   ? Math.round((protein / GOALS.proteinG) * 100) : 0
  const caloriePct  = calories  ? Math.round((calories / GOALS.caloriesIn) * 100) : 0
  const waterPct    = water     ? Math.round((water / GOALS.waterMl) * 100) : 0
  const stepsPct    = steps     ? Math.round((steps / GOALS.steps) * 100) : 0

  // ── Source badges ──
  const bodyBadge: DataBadgeMode | undefined = isMock ? 'mock' : 'imported'
  const nutritionBadge: DataBadgeMode | undefined = nutritionSource === 'mock' ? 'mock' : nutritionSource
  const hasBody      = isMock || !!(today.weight || today.bodyFatPct || today.steps)
  const hasNutrition = isMock || hasNutritionLog

  return (
    <div className="dashboard">

      {/* ── Import/mock banner ── */}
      {isVisible('import-status') && isMock && (
        <MockModeBanner onGoToSettings={() => navigate('/connected-accounts')} />
      )}
      {isVisible('import-status') && !isMock && (
        <div className="imported-data-banner">
          <DataBadge mode={dataSource === 'manual' ? 'manual' : 'imported'} />
          <span>
            {dataSource === 'merged' && 'Showing Apple Health + manual log data'}
            {dataSource === 'imported' && 'Showing real imported Apple Health data'}
            {dataSource === 'manual' && 'Showing manually logged data'}
            {' · '}{today.date}
          </span>
        </div>
      )}

      {/* ── Greeting ── */}
      <header className="dash-header">
        <div>
          <h1 className="dash-greeting">{getGreeting()}, John.</h1>
          <p className="dash-date">{formatDate()}</p>
        </div>
      </header>

      {/* ── Goal Ring ── */}
      {isVisible('goal-ring') && (
        <GoalRing snapshot={today} yesterday={yesterday} dataSource={dataSource} />
      )}

      {/* ── Quick Actions ── */}
      {isVisible('quick-actions') && <QuickActions />}

      {/* ── Daily Brief ── */}
      {isVisible('recovery') && (
        <DailyBriefCard
          today={today}
          yesterday={yesterday}
          todayStatus={todayStatus}
          coachNotes={coachNotes}
          isMock={isMock}
          onWorkout={() => navigate('/workouts')}
          onNutrition={() => navigate('/nutrition')}
        />
      )}

      {/* ── Body ── */}
      {isVisible('body') && <Section title="Body" badgeMode={bodyBadge} badgeSource={isMock ? 'Mock Data' : 'Apple Health'}>
        {hasBody ? (
          <>
            <MetricCard
              label="Weight"
              value={weightLbs ?? (isMock ? kgToLbs(90.3) : undefined)}
              unit="lbs"
              sub={today.weight ? `${today.weight.toFixed(1)} kg` : undefined}
              trend={weightDelta != null ? (weightDelta < 0 ? 'down' : 'up') : undefined}
              trendLabel={weightDelta != null ? `${Math.abs(weightDelta)} lbs` : undefined}
              trendPositive={false}
              empty={!isMock && weightLbs == null}
              emptyPrompt="Log weight"
              onEmptyClick={() => navigate('/log')}
            />
            <MetricCard
              label="Body Fat"
              value={today.bodyFatPct ?? (isMock ? 17.2 : undefined)}
              unit="%"
              trend={bodyFatDelta != null ? (bodyFatDelta < 0 ? 'down' : 'up') : undefined}
              trendLabel={bodyFatDelta != null ? `${Math.abs(bodyFatDelta)}%` : undefined}
              trendPositive={false}
              empty={!isMock && today.bodyFatPct == null}
              emptyPrompt="Import Apple Health"
              onEmptyClick={() => navigate('/import/apple-health')}
            />
            <MetricCard
              label="Muscle Mass"
              value={today.muscleMassKg ? kgToLbs(today.muscleMassKg) : (isMock ? kgToLbs(71.3) : undefined)}
              unit="lbs"
              sub={today.muscleMassKg ? `${today.muscleMassKg} kg` : undefined}
              trend={muscleDelta != null ? (muscleDelta >= 0 ? 'up' : 'down') : undefined}
              trendLabel={muscleDelta != null ? `${Math.abs(muscleDelta)} kg` : undefined}
              trendPositive={true}
              empty={!isMock && today.muscleMassKg == null}
              emptyPrompt="Import Apple Health"
              onEmptyClick={() => navigate('/import/apple-health')}
            />
          </>
        ) : (
          <div className="dash-empty-state">
            <p>No body data yet.</p>
            <button onClick={() => navigate('/import/apple-health')}>Import Apple Health →</button>
            <button onClick={() => navigate('/log')}>Log manually →</button>
          </div>
        )}
      </Section>}

      {/* ── Activity ── */}
      {isVisible('activity') && <Section title="Activity" badgeMode={bodyBadge} badgeSource={isMock ? 'Mock Data' : 'Apple Health'}>
        <MetricCard
          label="Steps"
          value={steps ? steps.toLocaleString() : (isMock ? (9842).toLocaleString() : undefined)}
          unit="steps"
          sub={steps ? `${stepsPct}% of ${GOALS.steps.toLocaleString()} goal` : undefined}
          trend={stepsPct >= 100 ? 'up' : 'neutral'}
          trendLabel={stepsPct >= 100 ? 'Goal hit' : steps ? `${100 - stepsPct}% left` : undefined}
          progress={steps ?? (isMock ? 9842 : 0)}
          progressMax={GOALS.steps}
          progressColor={stepsPct >= 100 ? 'var(--green)' : 'var(--blue)'}
          empty={!isMock && steps == null}
          emptyPrompt="Import Apple Health"
          onEmptyClick={() => navigate('/import/apple-health')}
        />
        <MetricCard
          label="Calories Burned"
          value={today.activeCalories ? today.activeCalories.toLocaleString() : (isMock ? '612' : undefined)}
          unit="kcal"
          sub="Active energy"
          trend="up" trendLabel="+12%" trendPositive={true}
          accentColor="var(--orange)"
          empty={!isMock && today.activeCalories == null}
          emptyPrompt="Import Apple Health"
          onEmptyClick={() => navigate('/import/apple-health')}
        />
        <MetricCard
          label="Workout"
          value={isMock ? 'Rest Day' : (todayStatus?.workoutLogged
            ? (todayStatus.workoutType
                ? todayStatus.workoutType.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                : 'Logged')
            : '—')}
          sub={isMock ? 'Recovery optimal' : todayStatus?.workoutLogged ? `${todayStatus.workoutDuration ?? '?'}min` : undefined}
          accentColor="var(--yellow)"
          empty={!isMock && !todayStatus?.workoutLogged}
          emptyPrompt="Log workout"
          onEmptyClick={() => navigate('/workouts')}
        />
      </Section>}

      {/* ── Nutrition ── */}
      {isVisible('nutrition') && <Section title="Nutrition" badgeMode={nutritionBadge} badgeSource={nutritionSource === 'manual' ? 'Manual Log' : nutritionSource === 'imported' ? 'Imported' : 'Mock Data'}>
        {hasNutrition ? (
          <>
            <MetricCard
              label="Protein"
              value={protein ?? (isMock ? 198 : undefined)}
              unit={`/ ${GOALS.proteinG}g`}
              sub={protein ? `${proteinPct}% of daily goal` : undefined}
              trend={proteinPct >= 100 ? 'up' : 'neutral'}
              trendLabel={proteinPct >= 100 ? 'Goal hit' : protein ? `${GOALS.proteinG - protein}g left` : undefined}
              trendPositive={true}
              progress={protein ?? (isMock ? 198 : 0)}
              progressMax={GOALS.proteinG}
              progressColor="var(--green)"
              accentColor="var(--green)"
            />
            <MetricCard
              label="Calories In"
              value={calories ? calories.toLocaleString() : (isMock ? '2,180' : undefined)}
              unit={`/ ${GOALS.caloriesIn.toLocaleString()}`}
              sub={calories ? `${caloriePct}% of budget` : undefined}
              progress={calories ?? (isMock ? 2180 : 0)}
              progressMax={GOALS.caloriesIn}
              progressColor="var(--blue)"
            />
            <MetricCard
              label="Hydration"
              value={water ? (water / 1000).toFixed(1) : (isMock ? '2.8' : undefined)}
              unit={`/ ${GOALS.waterMl / 1000}L`}
              sub={water ? `${waterPct}% of target` : undefined}
              trend={waterPct >= 100 ? 'up' : 'neutral'}
              trendLabel={waterPct >= 100 ? 'Goal hit' : water ? `${((GOALS.waterMl - water) / 1000).toFixed(1)}L left` : undefined}
              progress={water ?? (isMock ? 2800 : 0)}
              progressMax={GOALS.waterMl}
              progressColor="var(--teal)"
              accentColor="var(--teal)"
            />
          </>
        ) : (
          <div className="dash-empty-state">
            <p>No nutrition logged for today.</p>
            <button onClick={() => navigate('/nutrition')}>Log nutrition →</button>
          </div>
        )}
      </Section>}

      {/* ── Vitals ── */}
      {isVisible('vitals') && <Section title="Vitals" badgeMode={bodyBadge} badgeSource={isMock ? 'Mock Data' : 'Apple Health'}>
        <MetricCard
          label="HRV"
          value={today.hrv ?? (isMock ? 68 : undefined)}
          unit="ms"
          sub="Heart rate variability"
          trend={hrvDelta != null ? (hrvDelta >= 0 ? 'up' : 'down') : undefined}
          trendLabel={hrvDelta != null && today.hrv && yesterday.hrv
            ? `${Math.abs(pct(today.hrv, yesterday.hrv))}%` : undefined}
          trendPositive={true}
          accentColor="var(--purple)"
          empty={!isMock && today.hrv == null}
          emptyPrompt="Import Apple Health"
          onEmptyClick={() => navigate('/import/apple-health')}
        />
        <MetricCard
          label="Resting HR"
          value={today.restingHeartRate ?? (isMock ? 52 : undefined)}
          unit="bpm"
          sub="Resting heart rate"
          trend={hrDelta != null ? (hrDelta < 0 ? 'down' : 'up') : undefined}
          trendLabel={hrDelta != null ? `${Math.abs(hrDelta)} bpm` : undefined}
          trendPositive={false}
          accentColor="var(--pink)"
          empty={!isMock && today.restingHeartRate == null}
          emptyPrompt="Import Apple Health"
          onEmptyClick={() => navigate('/import/apple-health')}
        />
        <MetricCard
          label="Stress"
          value={isMock ? 'Low' : '—'}
          sub={isMock ? 'Based on HRV trends' : undefined}
          accentColor="var(--green)"
          empty={!isMock}
        />
      </Section>}

      {/* ── Coach Notes ── */}
      {isVisible('coach-notes') && <CoachNotesCard notes={coachNotes} />}

      {/* ── AI Insight ── */}
      {isVisible('ai-insight') && <section className="ai-insight-card">
        <div className="ai-insight-header">
          <Sparkles size={16} className="ai-insight-icon" />
          <span>Today's Insight</span>
        </div>
        <p className="ai-insight-text">
          {!isMock
            ? `You have real data. ${today.hrv ? `HRV at ${today.hrv}ms — your recovery looks solid.` : ''} ${!hasNutritionLog ? 'Log your nutrition for today to track your protein goal.' : protein ? `You're at ${protein}g protein so far today.` : ''}`
            : `You're 2g away from hitting your protein goal — close it with a protein shake. HRV is up ${pct(today.hrv ?? 68, yesterday.hrv ?? 62)}% from yesterday, which means your body recovered well. Consider a moderate training session today to keep momentum.`
          }
        </p>
        <div className="ai-insight-footer">
          <span>
            {isMock
              ? 'Based on mock data — import Apple Health or log manually to see real insights'
              : `Based on your ${dataSource === 'merged' ? 'Apple Health + manual log' : dataSource === 'manual' ? 'manual log' : 'imported Apple Health'} data`
            }
          </span>
        </div>
      </section>}

    </div>
  )
}
