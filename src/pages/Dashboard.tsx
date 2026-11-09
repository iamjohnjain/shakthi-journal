import { useState, useEffect, memo } from 'react'
import { TrendingDown, TrendingUp, Minus, Plus, Scale, ChevronLeft, ChevronRight, Target, Camera } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { kgToLbs, getGreeting, formatDate } from '../data/config'
import { getSetting } from '../db'
import { useDashboardData } from '../hooks/useDashboardData'
import { useDashboardCards, REORDERABLE_IDS } from '../hooks/useDashboardCards'
import { useNutritionSettings } from '../hooks/useNutritionSettings'
import { useHealthInsights } from '../hooks/useHealthInsights'
import { useApp } from '../context/AppContext'
import { getProfile } from '../db/profileStore'
import type { ProfileData } from '../db/profileStore'
import { getOwnedDevices, owns } from '../db/deviceStore'
import type { DeviceId } from '../db/deviceStore'
import GoalRing from '../components/GoalRing'
import { DailyBrief } from '../components/DailyBrief'
import { CardMenu } from '../components/CardMenu'
import TodayCard from '../components/TodayCard'
import QuickWeightModal from '../components/QuickWeightModal'
import { AvatarDisplay } from '../components/Avatar'
import { SkeletonHero, SkeletonSection } from '../components/Skeleton'
import { isInsideNativeApp } from '../layout/BottomNav'
import './Dashboard.css'

function todayDateStr() {
  return new Date().toISOString().split('T')[0]
}

function offsetDateStr(dateStr: string, deltaDays: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + deltaDays)
  return d.toISOString().split('T')[0]
}

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
  title, children, menuProps,
}: {
  title: string
  children: React.ReactNode
  menuProps?: React.ComponentProps<typeof CardMenu>
}) {
  return (
    <section className="dash-section">
      <div className="dash-section-header">
        <h2 className="dash-section-title">{title}</h2>
        <div className="dash-section-header-right">
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
  const [showWeightModal, setShowWeightModal] = useState(false)

  function syncData() {
    if (isInsideNativeApp()) {
      openNativeHealthSync()
    } else {
      // No HealthKit outside the native wrapper — the closest equivalent
      // action on web is the Apple Health file import flow.
      navigate('/import/apple-health')
    }
  }

  return (
    <div className="quick-actions" role="group" aria-label="Quick actions">
      <button className="quick-action-btn" onClick={() => setShowWeightModal(true)} aria-label="Log Weight">
        <span className="quick-action-icon" style={{ color: 'var(--purple)' }} aria-hidden="true">
          <Scale size={17} />
        </span>
        <span className="quick-action-label" aria-hidden="true">Log Weight</span>
      </button>
      <button className="quick-action-btn" onClick={() => navigate('/nutrition?quick=photo')} aria-label="Snap Meal">
        <span className="quick-action-icon" style={{ color: 'var(--orange)' }} aria-hidden="true">
          <Camera size={17} />
        </span>
        <span className="quick-action-label" aria-hidden="true">Snap Meal</span>
      </button>
      <button className="quick-action-btn" onClick={syncData} aria-label="Sync Data">
        <span className="quick-action-icon quick-action-icon--emoji" aria-hidden="true">❤️🔄</span>
        <span className="quick-action-label" aria-hidden="true">Sync Data</span>
      </button>
      {showWeightModal && (
        <QuickWeightModal onClose={() => setShowWeightModal(false)} onSaved={() => {}} />
      )}
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
  const inNative = isInsideNativeApp()
  const items = [
    { emoji: '⚖️', text: 'Record today\'s weight',   path: '/log'                    },
    { emoji: '🥗', text: 'Log your first meal',      path: '/nutrition'               },
    { emoji: '💪', text: 'Log a workout',            path: '/workouts'                },
    inNative
      ? { emoji: '❤️', text: 'Sync Apple Health',    path: '/connected-accounts'     }
      : (typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent))
        ? { emoji: '❤️', text: 'Import Apple Health', path: '/import/apple-health'   }
        : { emoji: '🔌', text: 'Connect a data source', path: '/connected-accounts'  },
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
  todayProgress: ReturnType<typeof useHealthInsights>['todayProgress']
  stepGoal: number
  sectionOrder: string[]
  inNative: boolean
  menuFor: (id: string) => React.ComponentProps<typeof CardMenu>
  /** From onboarding's "which of these do you have?" step. `null` means the
      user was never asked (pre-feature account, or skipped) — treat that as
      "show everything" so nothing regresses for existing users. */
  ownedDevices: DeviceId[] | null
}

function openNativeHealthSync() {
  const w = window as unknown as { webkit?: { messageHandlers?: { shakthiNative?: { postMessage: (m: unknown) => void } } } }
  w?.webkit?.messageHandlers?.shakthiNative?.postMessage({ type: 'openHealthSync' })
}

function BodySection({ ctx }: { ctx: SectionCtx }) {
  const navigate = useNavigate()
  const { today, yesterday, inNative, menuFor, ownedDevices } = ctx
  const weightLbs     = today.weight ? kgToLbs(today.weight) : undefined
  const prevWeightLbs = yesterday.weight ? kgToLbs(yesterday.weight) : undefined
  const weightDelta   = weightLbs != null && prevWeightLbs != null ? delta(weightLbs, prevWeightLbs) : null
  const bodyFatDelta  = today.bodyFatPct != null && yesterday.bodyFatPct != null
    ? delta(today.bodyFatPct, yesterday.bodyFatPct) : null
  const muscleDelta   = today.muscleMassKg != null && yesterday.muscleMassKg != null
    ? delta(today.muscleMassKg, yesterday.muscleMassKg) : null
  const hasBody = !!(today.weight || today.bodyFatPct)
  // Body fat / muscle mass only ever come from a smart scale — prompting
  // "Import Apple Health" for someone who never said they own one just
  // clutters the dashboard with a card that can't do anything for them.
  const hasScale = owns(ownedDevices, 'renpho')
  const showBodyFat    = today.bodyFatPct    != null || hasScale
  const showMuscleMass = today.muscleMassKg  != null || hasScale

  return (
    <Section title="Body" menuProps={menuFor('body')}>
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
          {showBodyFat && (
            <MetricCard
              label="Body Fat"
              value={today.bodyFatPct}
              unit="%"
              trend={bodyFatDelta != null ? (bodyFatDelta < 0 ? 'down' : 'up') : undefined}
              trendLabel={bodyFatDelta != null ? `${Math.abs(bodyFatDelta)}%` : undefined}
              trendPositive={false}
              empty={today.bodyFatPct == null}
              emptyPrompt={inNative ? 'Sync Apple Health' : 'Import Apple Health'}
              onEmptyClick={inNative ? openNativeHealthSync : () => navigate('/import/apple-health')}
            />
          )}
          {showMuscleMass && (
            <MetricCard
              label="Muscle Mass"
              value={today.muscleMassKg ? kgToLbs(today.muscleMassKg) : undefined}
              unit="lbs"
              sub={today.muscleMassKg ? `${today.muscleMassKg} kg` : undefined}
              trend={muscleDelta != null ? (muscleDelta >= 0 ? 'up' : 'down') : undefined}
              trendLabel={muscleDelta != null ? `${Math.abs(muscleDelta)} kg` : undefined}
              trendPositive={true}
              empty={today.muscleMassKg == null}
              emptyPrompt={inNative ? 'Sync Apple Health' : 'Import Apple Health'}
              onEmptyClick={inNative ? openNativeHealthSync : () => navigate('/import/apple-health')}
            />
          )}
        </>
      ) : (
        <EmptyState
          icon="🫀"
          message="No body data yet"
          primaryLabel={inNative ? 'Sync Apple Health' : 'Import Apple Health'}
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
  const { today, todayProgress, stepGoal, inNative, menuFor } = ctx
  const steps    = today.steps
  const stepsPct = steps ? Math.round((steps / stepGoal) * 100) : 0

  return (
    <Section title="Activity" menuProps={menuFor('activity')}>
      <MetricCard
        label="Steps"
        value={steps ? steps.toLocaleString() : undefined}
        unit="steps"
        sub={steps ? `${stepsPct}% of ${stepGoal.toLocaleString()} step goal` : undefined}
        trend={stepsPct >= 100 ? 'up' : 'neutral'}
        trendLabel={stepsPct >= 100 ? 'Goal hit' : steps ? `${100 - stepsPct}% left` : undefined}
        progress={steps ?? 0}
        progressMax={stepGoal}
        progressColor={stepsPct >= 100 ? 'var(--green)' : 'var(--blue)'}
        empty={steps == null}
        emptyPrompt={inNative ? 'Sync Apple Health' : 'Import Apple Health'}
        onEmptyClick={inNative ? openNativeHealthSync : () => navigate('/import/apple-health')}
      />
      <MetricCard
        label="Calories Burned"
        value={today.activeCalories ? today.activeCalories.toLocaleString() : undefined}
        unit="kcal"
        sub="Active energy"
        accentColor="var(--orange)"
        empty={today.activeCalories == null}
        emptyPrompt={inNative ? 'Sync Apple Health' : 'Import Apple Health'}
        onEmptyClick={inNative ? openNativeHealthSync : () => navigate('/import/apple-health')}
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


function VitalsSection({ ctx }: { ctx: SectionCtx }) {
  const navigate = useNavigate()
  const { today, yesterday, inNative, menuFor, ownedDevices } = ctx
  const hrvDelta = today.hrv != null && yesterday.hrv != null ? delta(today.hrv, yesterday.hrv) : null
  const hrDelta  = today.restingHeartRate != null && yesterday.restingHeartRate != null
    ? delta(today.restingHeartRate, yesterday.restingHeartRate) : null
  const hasVitals = today.hrv != null || today.restingHeartRate != null
  // HRV/resting-HR only come from a wearable. No data and no wearable
  // means an empty card promising a sync that can't produce anything —
  // hide the whole section rather than clutter the dashboard with it.
  const hasWearable = owns(ownedDevices, 'apple_watch') || owns(ownedDevices, 'ringconn')
  if (!hasVitals && !hasWearable) return null

  return (
    <Section title="Vitals" menuProps={menuFor('vitals')}>
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
        emptyPrompt={inNative ? 'Sync Apple Health' : 'Import Apple Health'}
        onEmptyClick={inNative ? openNativeHealthSync : () => navigate('/import/apple-health')}
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
        emptyPrompt={inNative ? 'Sync Apple Health' : 'Import Apple Health'}
        onEmptyClick={inNative ? openNativeHealthSync : () => navigate('/import/apple-health')}
      />
    </Section>
  )
}

// Map section IDs to their render components
const SECTION_RENDERERS: Record<string, React.ComponentType<{ ctx: SectionCtx }>> = {
  body:     BodySection,
  activity: ActivitySection,
  vitals:   VitalsSection,
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate()
  const { mockMode } = useApp()
  const [viewDate, setViewDate] = useState(todayDateStr)
  const { today, yesterday, dataSource, isToday, latestWeight, latestBodyFat, latestSleep, loading: dataLoading } = useDashboardData(viewDate)
  const { insights, todayProgress, loading: insightsLoading } = useHealthInsights(mockMode)
  const loading = dataLoading || insightsLoading
  const { isVisible, hide, moveUp, moveDown, pinToTop, sectionOrder } = useDashboardCards()
  const { goals: nutritionGoals } = useNutritionSettings()
  const [userName,    setUserName]    = useState<string | null>(null)
  const [profileData, setProfileData] = useState<ProfileData | null>(null)
  const [stepGoal,    setStepGoal]    = useState(10_000)
  const [ownedDevices, setOwnedDevices] = useState<DeviceId[] | null>(null)

  useEffect(() => {
    getProfile().then(p => {
      if (p?.name) setUserName(p.name)
      setProfileData(p)
    })
    getSetting<number>('step-goal', 10_000).then(setStepGoal)
    getOwnedDevices().then(setOwnedDevices)
    function onProfileUpdated(e: Event) {
      const p = (e as CustomEvent<ProfileData>).detail
      setUserName(p.name || null)
      setProfileData(p)
    }
    window.addEventListener('profile-updated', onProfileUpdated)
    return () => window.removeEventListener('profile-updated', onProfileUpdated)
  }, [])

  const isMock    = dataSource === 'mock' && mockMode
  const isEmpty   = dataSource === 'mock' && !mockMode
  const inNative  = isInsideNativeApp()

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
    today, yesterday, dataSource,
    todayProgress, stepGoal, sectionOrder,
    inNative,
    menuFor,
    ownedDevices,
  }

  // Build ordered list of visible reorderable sections
  const orderedSections = sectionOrder
    .filter(id => REORDERABLE_IDS.includes(id) && isVisible(id))

  const viewDateObj = new Date(viewDate + 'T12:00:00')
  const canGoForward = viewDate < todayDateStr()

  return (
    <div className="dashboard">

      {/* ── Greeting ── */}
      <header className="dash-header">
        <div>
          <h1 className="dash-greeting">{isToday ? `${getGreeting()}${userName ? `, ${userName}` : ''}.` : 'Looking back.'}</h1>
          <p className="dash-date">{formatDate(viewDateObj)}</p>
        </div>
        <button className="dash-avatar-btn" onClick={() => navigate('/profile')} aria-label="Profile">
          <AvatarDisplay name={userName ?? 'Guest'} avatarId={profileData?.avatarId} photoDataUrl={profileData?.photoDataUrl} size="sm" />
        </button>
      </header>

      {/* ── Date nav — browse a previous day's dashboard ── */}
      <div className="dash-date-nav">
        <button className="dash-date-nav-btn" onClick={() => setViewDate(d => offsetDateStr(d, -1))} aria-label="Previous day">
          <ChevronLeft size={16} />
        </button>
        <span className="dash-date-nav-label">{isToday ? 'Today' : formatDate(viewDateObj)}</span>
        <button className="dash-date-nav-btn" onClick={() => setViewDate(d => offsetDateStr(d, 1))} disabled={!canGoForward} aria-label="Next day">
          <ChevronRight size={16} />
        </button>
        {!isToday && (
          <button className="dash-date-nav-today" onClick={() => setViewDate(todayDateStr())}>Jump to Today</button>
        )}
      </div>

      {isToday && (
        <>
          {/* ── Quick Actions (immediately below greeting) ── */}
          {isVisible('quick-actions') && <QuickActions />}

          {/* ── Goal Ring (weight goal circle) — always shown on Today; falls
               back to the last logged weight (or a "log now" prompt) when
               nothing's been entered yet today, instead of disappearing. ── */}
          {isVisible('goal-ring') && (
            <GoalRing snapshot={today} yesterday={yesterday} dataSource={dataSource} mockMode={mockMode} latestWeight={latestWeight ?? undefined} latestBodyFat={latestBodyFat ?? undefined} latestSleep={latestSleep ?? undefined} />
          )}

          {/* ── "Here's where things stand" ── */}
          {loading && !isEmpty && !isMock ? (
            <SkeletonHero />
          ) : (!isEmpty && !isMock) ? (
            <>
              <p className="dash-section-standin">Here's where things stand</p>
              <TodayCard
                today={today}
                todayProgress={todayProgress}
                dataSource={dataSource}
              />
            </>
          ) : null}

          {/* ── Empty state: no data yet ── */}
          {isEmpty && isVisible('import-status') && (
            <>
              <FirstDayCard profile={profileData} nutritionGoals={nutritionGoals} />
              <TodaysFocus />
            </>
          )}
        </>
      )}

      {/* ── Past-day empty state ── */}
      {!isToday && isEmpty && !loading && (
        <div className="dash-empty-card">
          <span className="dash-empty-icon">📭</span>
          <p className="dash-empty-msg">No data recorded for {formatDate(viewDateObj)}.</p>
        </div>
      )}

      {/* ── Reorderable sections (Body, Activity, Vitals in user order) — any viewed date ── */}
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

      {/* ── Daily Insights (below the fold — deeper analysis) — today only, these are prescriptive ── */}
      {isToday && !isMock && (
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
