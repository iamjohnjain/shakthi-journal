import { useState, useEffect, memo } from 'react'
import { TrendingDown, TrendingUp, Minus, Plus, Dumbbell, Utensils, Download, ArrowLeftRight, ChevronRight, Target } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { kgToLbs, getGreeting, formatDate } from '../data/config'

const STEP_GOAL = 10_000
import { useDashboardData } from '../hooks/useDashboardData'
import { useDashboardCards, REORDERABLE_IDS } from '../hooks/useDashboardCards'
import { useNutritionSettings } from '../hooks/useNutritionSettings'
import { useHealthInsights } from '../hooks/useHealthInsights'
import { useApp } from '../context/AppContext'
import { getProfile } from '../db/profileStore'
import type { ProfileData } from '../db/profileStore'
import DataBadge from '../components/DataBadge'
import GoalRing from '../components/GoalRing'
import { DailyBrief } from '../components/DailyBrief'
import { CardMenu } from '../components/CardMenu'
import TodayCard from '../components/TodayCard'
import { SkeletonHero, SkeletonSection } from '../components/Skeleton'
import type { DataBadgeMode } from '../components/DataBadge'
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

const MetricCard = memo(function MetricCard({
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
})

// ─── Section wrapper ─────────────────────────────────────────────────────────

const Section = memo(function Section({
  title, children, badgeMode, badgeSource, menuProps,
}: {
  title: string
  children: React.ReactNode
  badgeMode?: DataBadgeMode
  badgeSource?: string
  menuProps?: React.ComponentProps<typeof CardMenu>
}) {
  return (
    <section className="dash-section">
      <div className="dash-section-header">
        <h2 className="dash-section-title">{title}</h2>
        <div className="dash-section-header-right">
          {badgeMode && <DataBadge mode={badgeMode} source={badgeSource} size="sm" />}
          {menuProps && <CardMenu {...menuProps} />}
        </div>
      </div>
      <div className="metric-grid">{children}</div>
    </section>
  )
})

// ─── Empty state card ────────────────────────────────────────────────────────

function EmptyState({
  icon, message, primaryLabel, primaryPath, secondaryLabel, secondaryPath,
}: {
  icon: string
  message: string
  primaryLabel: string
  primaryPath: string
  secondaryLabel?: string
  secondaryPath?: string
}) {
  const navigate = useNavigate()
  return (
    <div className="dash-empty-card">
      <span className="dash-empty-icon">{icon}</span>
      <p className="dash-empty-msg">{message}</p>
      <div className="dash-empty-actions">
        <button className="dash-empty-btn" onClick={() => navigate(primaryPath)}>{primaryLabel}</button>
        {secondaryLabel && secondaryPath && (
          <button className="dash-empty-btn dash-empty-btn--ghost" onClick={() => navigate(secondaryPath)}>
            {secondaryLabel}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Quick Actions ───────────────────────────────────────────────────────────

function QuickActions() {
  const navigate = useNavigate()
  const actions = [
    { icon: Utensils,       label: 'Log Food',    path: '/nutrition',           color: 'var(--green)'  },
    { icon: Dumbbell,       label: 'Log Workout', path: '/workouts',            color: 'var(--blue)'   },
    { icon: Download,       label: 'Import Data', path: '/import/apple-health', color: 'var(--purple)' },
    { icon: ArrowLeftRight, label: 'Compare',     path: '/compare',             color: 'var(--orange)' },
  ]
  return (
    <div className="quick-actions" role="group" aria-label="Quick actions">
      {actions.map(a => (
        <button key={a.path} className="quick-action-btn" onClick={() => navigate(a.path)} aria-label={a.label}>
          <span className="quick-action-icon" style={{ color: a.color }} aria-hidden="true">
            <a.icon size={17} />
          </span>
          <span className="quick-action-label" aria-hidden="true">{a.label}</span>
        </button>
      ))}
    </div>
  )
}

// ─── First-day welcome card ──────────────────────────────────────────────────

function FirstDayCard({ profile, nutritionGoals }: {
  profile: ProfileData | null
  nutritionGoals: ReturnType<typeof useNutritionSettings>['goals']
}) {
  const navigate = useNavigate()
  if (!profile) return null

  const startWeightLbs  = profile.startWeightKg  ? kgToLbs(profile.startWeightKg)  : null
  const goalWeightLbs   = profile.goalWeightKg   ? kgToLbs(profile.goalWeightKg)   : null
  const calories        = nutritionGoals.calories
  const protein         = nutritionGoals.proteinG

  const stats: { label: string; value: string; color: string }[] = []
  if (startWeightLbs) stats.push({ label: 'Current weight', value: `${startWeightLbs} lbs`, color: 'var(--blue)' })
  if (goalWeightLbs)  stats.push({ label: 'Goal weight',    value: `${goalWeightLbs} lbs`,  color: 'var(--green)' })
  if (calories)       stats.push({ label: 'Daily calories', value: `${calories} kcal`,       color: 'var(--orange)' })
  if (protein)        stats.push({ label: 'Protein goal',   value: `${protein}g`,            color: 'var(--purple)' })

  if (stats.length === 0) return null

  return (
    <div className="dash-firstday-card">
      <div className="dash-firstday-header">
        <Target size={16} className="dash-firstday-icon" />
        <span className="dash-firstday-title">Your starting point</span>
        <button className="dash-firstday-edit" onClick={() => navigate('/onboarding?edit=1')}>Edit</button>
      </div>
      <div className="dash-firstday-stats">
        {stats.map(s => (
          <div key={s.label} className="dash-firstday-stat">
            <span className="dash-firstday-stat-val" style={{ color: s.color }}>{s.value}</span>
            <span className="dash-firstday-stat-label">{s.label}</span>
          </div>
        ))}
      </div>
      <p className="dash-firstday-note">Log your weight and meals daily to track progress here.</p>
    </div>
  )
}

// ─── Today's Focus (first-time empty state) ──────────────────────────────────

function TodaysFocus() {
  const navigate = useNavigate()
  const isIos = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)
  const items = [
    { emoji: '⚖️', text: 'Record today\'s weight',   path: '/log'                    },
    { emoji: '🥗', text: 'Log your first meal',      path: '/nutrition'               },
    { emoji: '💪', text: 'Log a workout',            path: '/workouts'                },
    isIos
      ? { emoji: '❤️', text: 'Import Apple Health',  path: '/import/apple-health'    }
      : { emoji: '🔌', text: 'Connect a data source', path: '/connected-accounts'    },
  ]
  return (
    <div className="dash-focus-card">
      <div className="dash-focus-header">
        <span className="dash-focus-title">Start here</span>
        <span className="dash-focus-sub">Your dashboard fills in as you log data.</span>
      </div>
      {items.map((item, i) => (
        <button key={i} className="dash-focus-item" onClick={() => navigate(item.path)}>
          <span className="dash-focus-emoji">{item.emoji}</span>
          <span className="dash-focus-text">{item.text}</span>
          <ChevronRight size={15} className="dash-focus-arrow" />
        </button>
      ))}
    </div>
  )
}

// ─── Section renderers ───────────────────────────────────────────────────────

interface SectionCtx {
  today: ReturnType<typeof useDashboardData>['today']
  yesterday: ReturnType<typeof useDashboardData>['yesterday']
  dataSource: ReturnType<typeof useDashboardData>['dataSource']
  nutritionSource: ReturnType<typeof useDashboardData>['nutritionSource']
  hasNutritionLog: ReturnType<typeof useDashboardData>['hasNutritionLog']
  todayProgress: ReturnType<typeof useHealthInsights>['todayProgress']
  nutritionGoals: ReturnType<typeof useNutritionSettings>['goals']
  sectionOrder: string[]
  menuFor: (id: string) => React.ComponentProps<typeof CardMenu>
}

function BodySection({ ctx }: { ctx: SectionCtx }) {
  const navigate = useNavigate()
  const { today, yesterday, dataSource, menuFor } = ctx
  const weightLbs     = today.weight ? kgToLbs(today.weight) : undefined
  const prevWeightLbs = yesterday.weight ? kgToLbs(yesterday.weight) : undefined
  const weightDelta   = weightLbs != null && prevWeightLbs != null ? delta(weightLbs, prevWeightLbs) : null
  const bodyFatDelta  = today.bodyFatPct != null && yesterday.bodyFatPct != null
    ? delta(today.bodyFatPct, yesterday.bodyFatPct) : null
  const muscleDelta   = today.muscleMassKg != null && yesterday.muscleMassKg != null
    ? delta(today.muscleMassKg, yesterday.muscleMassKg) : null
  const hasBody = !!(today.weight || today.bodyFatPct)
  const badge: DataBadgeMode | undefined = hasBody ? (dataSource === 'manual' ? 'manual' : 'imported') : undefined

  return (
    <Section title="Body" badgeMode={badge} badgeSource="Apple Health / Log" menuProps={menuFor('body')}>
      {hasBody ? (
        <>
          <MetricCard
            label="Weight"
            value={weightLbs}
            unit="lbs"
            sub={today.weight ? `${today.weight.toFixed(1)} kg` : undefined}
            trend={weightDelta != null ? (weightDelta < 0 ? 'down' : 'up') : undefined}
            trendLabel={weightDelta != null ? `${Math.abs(weightDelta)} lbs` : undefined}
            trendPositive={false}
            empty={weightLbs == null}
            emptyPrompt="Log weight"
            onEmptyClick={() => navigate('/log')}
          />
          <MetricCard
            label="Body Fat"
            value={today.bodyFatPct}
            unit="%"
            trend={bodyFatDelta != null ? (bodyFatDelta < 0 ? 'down' : 'up') : undefined}
            trendLabel={bodyFatDelta != null ? `${Math.abs(bodyFatDelta)}%` : undefined}
            trendPositive={false}
            empty={today.bodyFatPct == null}
            emptyPrompt="Import Apple Health"
            onEmptyClick={() => navigate('/import/apple-health')}
          />
          <MetricCard
            label="Muscle Mass"
            value={today.muscleMassKg ? kgToLbs(today.muscleMassKg) : undefined}
            unit="lbs"
            sub={today.muscleMassKg ? `${today.muscleMassKg} kg` : undefined}
            trend={muscleDelta != null ? (muscleDelta >= 0 ? 'up' : 'down') : undefined}
            trendLabel={muscleDelta != null ? `${Math.abs(muscleDelta)} kg` : undefined}
            trendPositive={true}
            empty={today.muscleMassKg == null}
            emptyPrompt="Import Apple Health"
            onEmptyClick={() => navigate('/import/apple-health')}
          />
        </>
      ) : (
        <EmptyState
          icon="🫀"
          message="No body data yet"
          primaryLabel="Import Apple Health"
          primaryPath="/import/apple-health"
          secondaryLabel="Log manually"
          secondaryPath="/log"
        />
      )}
    </Section>
  )
}

function ActivitySection({ ctx }: { ctx: SectionCtx }) {
  const navigate = useNavigate()
  const { today, todayProgress, nutritionGoals: _ng, menuFor } = ctx
  const steps    = today.steps
  const stepsPct = steps ? Math.round((steps / STEP_GOAL) * 100) : 0
  const hasActivity = steps != null || today.activeCalories != null || todayProgress.workoutLogged

  return (
    <Section title="Activity" badgeMode={hasActivity ? 'imported' : undefined} badgeSource="Apple Health" menuProps={menuFor('activity')}>
      <MetricCard
        label="Steps"
        value={steps ? steps.toLocaleString() : undefined}
        unit="steps"
        sub={steps ? `${stepsPct}% of ${STEP_GOAL.toLocaleString()} step goal` : undefined}
        trend={stepsPct >= 100 ? 'up' : 'neutral'}
        trendLabel={stepsPct >= 100 ? 'Goal hit' : steps ? `${100 - stepsPct}% left` : undefined}
        progress={steps ?? 0}
        progressMax={STEP_GOAL}
        progressColor={stepsPct >= 100 ? 'var(--green)' : 'var(--blue)'}
        empty={steps == null}
        emptyPrompt="Import Apple Health"
        onEmptyClick={() => navigate('/import/apple-health')}
      />
      <MetricCard
        label="Calories Burned"
        value={today.activeCalories ? today.activeCalories.toLocaleString() : undefined}
        unit="kcal"
        sub="Active energy"
        accentColor="var(--orange)"
        empty={today.activeCalories == null}
        emptyPrompt="Import Apple Health"
        onEmptyClick={() => navigate('/import/apple-health')}
      />
      <MetricCard
        label="Workout"
        value={todayProgress.workoutLogged
          ? (todayProgress.workoutType
              ? todayProgress.workoutType.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
              : 'Logged')
          : undefined}
        sub={todayProgress.workoutLogged ? `${todayProgress.workoutDuration ?? '?'}min` : undefined}
        accentColor="var(--yellow)"
        empty={!todayProgress.workoutLogged}
        emptyPrompt="Log workout"
        onEmptyClick={() => navigate('/workouts')}
      />
    </Section>
  )
}

function NutritionSection({ ctx }: { ctx: SectionCtx }) {
  const navigate = useNavigate()
  const { today, hasNutritionLog, nutritionSource, nutritionGoals, menuFor } = ctx
  const protein   = today.proteinG
  const calories  = today.caloriesIn
  const proteinPct = protein  ? Math.round((protein  / nutritionGoals.proteinG) * 100) : 0
  const caloriePct = calories ? Math.round((calories / nutritionGoals.calories)  * 100) : 0
  const hasNutrition = hasNutritionLog || !!protein
  const badge: DataBadgeMode | undefined = hasNutrition && nutritionSource !== 'mock'
    ? (nutritionSource as DataBadgeMode)
    : undefined

  return (
    <Section title="Nutrition" badgeMode={badge} badgeSource={nutritionSource === 'manual' ? 'Manual Log' : 'Imported'} menuProps={menuFor('nutrition')}>
      {hasNutritionLog || protein ? (
        <>
          <MetricCard
            label="Protein"
            value={protein}
            unit={`/ ${nutritionGoals.proteinG}g`}
            sub={protein ? `${proteinPct}% of daily goal` : undefined}
            trend={proteinPct >= 100 ? 'up' : 'neutral'}
            trendLabel={proteinPct >= 100 ? 'Goal hit' : protein ? `${nutritionGoals.proteinG - protein}g left` : undefined}
            trendPositive={true}
            progress={protein ?? 0}
            progressMax={nutritionGoals.proteinG}
            progressColor="var(--green)"
            accentColor="var(--green)"
            empty={!protein}
            emptyPrompt="Log a meal"
            onEmptyClick={() => navigate('/nutrition')}
          />
          <MetricCard
            label="Calories In"
            value={calories ? calories.toLocaleString() : undefined}
            unit={`/ ${nutritionGoals.calories.toLocaleString()}`}
            sub={calories ? `${caloriePct}% of budget` : undefined}
            progress={calories ?? 0}
            progressMax={nutritionGoals.calories}
            progressColor="var(--blue)"
            empty={!calories}
            emptyPrompt="Log a meal"
            onEmptyClick={() => navigate('/nutrition')}
          />
        </>
      ) : (
        <EmptyState
          icon="🥗"
          message="No nutrition logged today"
          primaryLabel="Log a meal"
          primaryPath="/nutrition"
        />
      )}
    </Section>
  )
}

function VitalsSection({ ctx }: { ctx: SectionCtx }) {
  const navigate = useNavigate()
  const { today, yesterday, menuFor } = ctx
  const hrvDelta = today.hrv != null && yesterday.hrv != null ? delta(today.hrv, yesterday.hrv) : null
  const hrDelta  = today.restingHeartRate != null && yesterday.restingHeartRate != null
    ? delta(today.restingHeartRate, yesterday.restingHeartRate) : null
  const hasVitals = today.hrv != null || today.restingHeartRate != null

  return (
    <Section title="Vitals" badgeMode={hasVitals ? 'imported' : undefined} badgeSource="Apple Health" menuProps={menuFor('vitals')}>
      <MetricCard
        label="HRV"
        value={today.hrv}
        unit="ms"
        sub="Heart rate variability"
        trend={hrvDelta != null ? (hrvDelta >= 0 ? 'up' : 'down') : undefined}
        trendLabel={hrvDelta != null && today.hrv && yesterday.hrv
          ? `${Math.abs(pct(today.hrv, yesterday.hrv))}%` : undefined}
        trendPositive={true}
        accentColor="var(--purple)"
        empty={today.hrv == null}
        emptyPrompt="Import Apple Health"
        onEmptyClick={() => navigate('/import/apple-health')}
      />
      <MetricCard
        label="Resting HR"
        value={today.restingHeartRate}
        unit="bpm"
        sub="Resting heart rate"
        trend={hrDelta != null ? (hrDelta < 0 ? 'down' : 'up') : undefined}
        trendLabel={hrDelta != null ? `${Math.abs(hrDelta)} bpm` : undefined}
        trendPositive={false}
        accentColor="var(--pink)"
        empty={today.restingHeartRate == null}
        emptyPrompt="Import Apple Health"
        onEmptyClick={() => navigate('/import/apple-health')}
      />
    </Section>
  )
}

// Map section IDs to their render components
const SECTION_RENDERERS: Record<string, React.ComponentType<{ ctx: SectionCtx }>> = {
  body:      BodySection,
  activity:  ActivitySection,
  nutrition: NutritionSection,
  vitals:    VitalsSection,
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate()
  const { mockMode } = useApp()
  const { today, yesterday, dataSource, nutritionSource, hasNutritionLog, loading: dataLoading } = useDashboardData()
  const { insights, todayProgress, loading: insightsLoading } = useHealthInsights(mockMode)
  const loading = dataLoading || insightsLoading
  const { isVisible, hide, moveUp, moveDown, pinToTop, sectionOrder } = useDashboardCards()
  const { goals: nutritionGoals } = useNutritionSettings()
  const [userName,    setUserName]    = useState<string | null>(null)
  const [profileData, setProfileData] = useState<ProfileData | null>(null)

  useEffect(() => {
    getProfile().then(p => {
      if (p?.name) setUserName(p.name)
      setProfileData(p)
    })
    function onProfileUpdated(e: Event) {
      const p = (e as CustomEvent<ProfileData>).detail
      setUserName(p.name ?? null)
      setProfileData(p)
    }
    window.addEventListener('profile-updated', onProfileUpdated)
    return () => window.removeEventListener('profile-updated', onProfileUpdated)
  }, [])

  const isMock  = dataSource === 'mock' && mockMode
  const isEmpty = dataSource === 'mock' && !mockMode

  function menuFor(id: string): React.ComponentProps<typeof CardMenu> {
    const ordered = REORDERABLE_IDS.filter(s => sectionOrder.includes(s))
    const orderIdx = ordered.indexOf(id)
    return {
      id,
      label: id.charAt(0).toUpperCase() + id.slice(1),
      canMoveUp:   orderIdx > 0,
      canMoveDown: orderIdx < ordered.length - 1,
      onHide:      () => hide(id),
      onMoveUp:    () => moveUp(id),
      onMoveDown:  () => moveDown(id),
      onPin:       () => pinToTop(id),
    }
  }

  const sectionCtx: SectionCtx = {
    today, yesterday, dataSource, nutritionSource, hasNutritionLog,
    todayProgress, nutritionGoals, sectionOrder,
    menuFor,
  }

  // Build ordered list of visible reorderable sections
  const orderedSections = sectionOrder
    .filter(id => REORDERABLE_IDS.includes(id) && isVisible(id))

  return (
    <div className="dashboard">

      {/* ── Greeting ── */}
      <header className="dash-header">
        <div>
          <h1 className="dash-greeting">{getGreeting()}{userName ? `, ${userName}` : ''}.</h1>
          <p className="dash-date">{formatDate()}</p>
        </div>
      </header>

      {/* ── Today at a glance (intelligence-first hero) ── */}
      {loading && !isEmpty && !isMock ? (
        <SkeletonHero />
      ) : (!isEmpty && !isMock) ? (
        <TodayCard
          today={today}
          todayProgress={todayProgress}
          nutritionGoals={nutritionGoals}
          dataSource={dataSource}
        />
      ) : null}

      {/* ── Quick Actions (primary CTA — always visible) ── */}
      {isVisible('quick-actions') && <QuickActions />}

      {/* ── Goal Ring ── */}
      {isVisible('goal-ring') && (
        <GoalRing snapshot={today} yesterday={yesterday} dataSource={dataSource} />
      )}

      {/* ── Empty state: no data yet ── */}
      {isEmpty && isVisible('import-status') && (
        <>
          <FirstDayCard profile={profileData} nutritionGoals={nutritionGoals} />
          <TodaysFocus />
        </>
      )}

      {/* ── Reorderable sections (Body, Activity, Nutrition, Vitals in user order) ── */}
      {loading && !isEmpty ? (
        <>
          <SkeletonSection />
          <SkeletonSection />
        </>
      ) : orderedSections.map(id => {
        const SectionComponent = SECTION_RENDERERS[id]
        if (!SectionComponent) return null
        return <SectionComponent key={id} ctx={sectionCtx} />
      })}

      {/* ── Daily Insights (below the fold — deeper analysis) ── */}
      {!isMock && (
        <DailyBrief insights={insights} loading={insightsLoading} />
      )}

      {/* ── Hidden sections notice ── */}
      {!isEmpty && REORDERABLE_IDS.some(id => !isVisible(id)) && (
        <button
          className="dash-hidden-notice"
          onClick={() => navigate('/settings')}
          aria-label="Some sections are hidden"
        >
          Some sections are hidden · Manage in Settings
        </button>
      )}

    </div>
  )
}
