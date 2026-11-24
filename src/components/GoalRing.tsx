import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence } from 'motion/react'
import { ChevronLeft, ChevronRight, X, CheckCircle2, RefreshCw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { kgToLbs, localDateStr } from '../data/config'
import { useUnits } from '../hooks/useUnits'
import { getProfile } from '../db/profileStore'
import { getSetting, setSetting } from '../db'
import { calcNutrition } from '../lib/nutritionMath'
import { DEFAULT_GOALS } from '../hooks/useNutritionSettings'
import type { ProfileData, NutritionGoals } from '../db'
import type { DailySnapshot } from '../types/health'
import { isInsideNativeApp, triggerSilentHealthSync } from '../layout/BottomNav'
import { useLastSynced } from '../hooks/useLastSynced'
import { useBlockPullToRefresh } from '../hooks/useBlockPullToRefresh'
import QuickWeightModal from './QuickWeightModal'
import WeightGoalEditor from './WeightGoalEditor'
import './GoalRing.css'

const SLEEP_GOAL_H  = 8       // universally recommended
const STEP_GOAL_DAY = 10_000  // universal daily target

type GoalType = 'weight' | 'bodyFat' | 'steps' | 'protein' | 'sleep'
// Only metrics every iPhone provides via Apple Health, with no optional equipment
// required — bodyFat/protein/sleep need a scale, manual logging, or a wearable.
const GOAL_TYPES: GoalType[] = ['weight', 'steps']

interface GoalCfg {
  label: string
  unit: string
  current: (s: DailySnapshot) => number | undefined
  start:   (p: ProfileData | null, s: DailySnapshot) => number | undefined
  goal:    (p: ProfileData | null, ng: Pick<NutritionGoals, 'proteinG'>) => number | undefined
  higherIsBetter: boolean
  format:  (v: number) => string
  desc:    string
}

const CONFIGS: Record<GoalType, GoalCfg> = {
  weight: {
    // Raw kg here — converted to the user's chosen display unit (lbs/kg) in
    // the component below, since CONFIGS is a static table with no access
    // to the unit-system setting.
    label: 'Weight Goal', unit: 'lbs',
    current: s => s.weight ?? undefined,
    start:   (p, s) => p?.startWeightKg ?? (s.weight ? +(s.weight + 6.8).toFixed(1) : undefined),
    goal:    p => p?.goalWeightKg ?? undefined,
    higherIsBetter: false,
    format:  v => v.toFixed(1),
    desc:    'toward target weight',
  },
  bodyFat: {
    label: 'Body Fat Goal', unit: '%',
    current: s => s.bodyFatPct,
    start:   (p, _s) => p?.startBodyFatPct,
    goal:    p => p?.goalBodyFatPct ?? undefined,
    higherIsBetter: false,
    format:  v => v.toFixed(1),
    desc:    'toward target body fat',
  },
  steps: {
    label: 'Daily Steps', unit: 'steps',
    current: s => s.steps,
    start:   (_p, _s) => 0,
    goal:    () => STEP_GOAL_DAY,
    higherIsBetter: true,
    format:  v => Math.round(v).toLocaleString(),
    desc:    "today's step goal",
  },
  protein: {
    label: 'Protein Goal', unit: 'g',
    current: s => s.proteinG,
    start:   (_p, _s) => 0,
    goal:    (_p, ng) => ng.proteinG,
    higherIsBetter: true,
    format:  v => Math.round(v).toString(),
    desc:    "today's protein goal",
  },
  sleep: {
    label: 'Sleep Goal', unit: 'h',
    current: s => s.sleepHours,
    start:   (_p, _s) => 0,
    goal:    () => SLEEP_GOAL_H,
    higherIsBetter: true,
    format:  v => v.toFixed(1),
    desc:    "last night's sleep",
  },
}

// How strong the card's background wash reads — kept equal across goal
// types so cards in the same swipeable row read as one consistent set,
// not a mix of differently-lit cards. Same gradient-brand hues either way.
const GLOW_INTENSITY: Record<GoalType, number> = {
  weight: 0.18, steps: 0.18, bodyFat: 0.18, protein: 0.18, sleep: 0.18,
}

function clamp(v: number) { return Math.min(100, Math.max(0, v)) }

function shortDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function ringPct(current: number, start: number, goal: number, higher: boolean): number {
  if (start === goal) return 0
  return clamp(higher
    ? (current - start) / (goal - start) * 100
    : (start - current) / (start - goal) * 100)
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000)
}

type PaceStatus = 'reached' | 'no-data' | 'no-target' | 'past-due' | 'on-track' | 'behind'

interface Pace {
  status: PaceStatus
  requiredPerWeek: number | null  // still-needed pace, in the "good" direction, per week
  actualPerWeek: number | null    // pace achieved since startDate, per week
}

/** Weight-goal-only pace math: is the user's rate of progress since their
    start date fast enough to reach goalWeightKg by goalDate? All weight
    values are expected pre-converted to the user's display unit (lbs/kg) —
    this is pure arithmetic, not a new source of truth for the goal itself. */
function computePace(opts: {
  start?: number; current?: number; goal?: number
  startDate?: string; goalDate?: string
  higherIsBetter: boolean
}): Pace {
  const { start, current, goal, startDate, goalDate, higherIsBetter } = opts
  if (current == null || goal == null) return { status: 'no-data', requiredPerWeek: null, actualPerWeek: null }

  const remaining = higherIsBetter ? goal - current : current - goal
  if (remaining <= 0) return { status: 'reached', requiredPerWeek: null, actualPerWeek: null }

  if (!goalDate) return { status: 'no-target', requiredPerWeek: null, actualPerWeek: null }

  const today = localDateStr()
  const daysRemaining = daysBetween(today, goalDate)
  if (daysRemaining <= 0) {
    return { status: 'past-due', requiredPerWeek: +(remaining * 7).toFixed(2), actualPerWeek: null }
  }

  const requiredPerWeek = (remaining / daysRemaining) * 7

  let actualPerWeek: number | null = null
  if (start != null && startDate) {
    const daysElapsed = Math.max(1, daysBetween(startDate, today))
    const progressSoFar = higherIsBetter ? current - start : start - current
    actualPerWeek = (progressSoFar / daysElapsed) * 7
  }

  const onTrack = actualPerWeek != null && actualPerWeek >= requiredPerWeek * 0.92
  return {
    status: onTrack ? 'on-track' : 'behind',
    requiredPerWeek: +requiredPerWeek.toFixed(2),
    actualPerWeek: actualPerWeek != null ? +actualPerWeek.toFixed(2) : null,
  }
}

interface Props {
  snapshot: DailySnapshot
  dataSource: string
  /** True only in developer mock mode (simulated data). `dataSource` also
      reads 'mock' when there's simply no real data yet for the day — that's
      not the same thing, and shouldn't be badged "MOCK DATA". */
  mockMode?: boolean
  latestWeight?: import('../hooks/useDashboardData').LatestWeightInfo
  latestBodyFat?: import('../hooks/useDashboardData').LatestBodyFatInfo
  latestSleep?: import('../hooks/useDashboardData').LatestSleepInfo
}

export default function GoalRing({ snapshot, latestWeight, latestBodyFat, latestSleep }: Props) {
  const navigate = useNavigate()
  const units = useUnits()
  const [typeIdx, setTypeIdx] = useState(0)
  const [profile,        setProfile]        = useState<ProfileData | null>(null)
  const [nutritionGoals, setNutritionGoals] = useState<Pick<NutritionGoals, 'proteinG' | 'calories'>>({ proteinG: 200, calories: 2300 })
  const [stepGoal,       setStepGoal]       = useState(10_000)
  const [animated,       setAnimated]       = useState(false)
  const [showDetail,     setShowDetail]     = useState(false)
  const [showWeightLog,  setShowWeightLog]  = useState(false)
  const lastSyncedAt = useLastSynced()
  const [editingGoal,    setEditingGoal]    = useState(false)

  // The most direct, reliable fix for "swiping anywhere while this modal
  // is open must never trigger a background sync": PullToRefresh itself
  // refuses to engage at all while this is true, checked at the very top
  // of its own touch handlers — independent of DOM propagation/portal
  // boundaries, which the earlier touch-interception approach kept
  // finding new gaps in (stopPropagation doesn't cross into a separate
  // portaled subtree; a drag that starts ON the modal itself was never
  // blocked at all, by design, to preserve the modal's own scrolling).
  useBlockPullToRefresh(showDetail)

  function sourceLabel(sourceId: string): string {
    if (sourceId === 'renpho')      return 'RENPHO via Apple Health'
    if (sourceId === 'apple_watch') return 'Apple Watch'
    if (sourceId === 'ringconn')    return 'RingConn via Apple Health'
    return 'Apple Health'
  }

  useEffect(() => {
    getProfile().then(setProfile)
    getSetting<NutritionGoals | null>('nutrition-goals', null).then(ng => {
      if (ng?.proteinG) setNutritionGoals(prev => ({ ...prev, proteinG: ng.proteinG }))
      if (ng?.calories) setNutritionGoals(prev => ({ ...prev, calories: ng.calories }))
    })
    getSetting<number>('step-goal', 10_000).then(setStepGoal)
  }, [])
  useEffect(() => {
    setAnimated(false)
    const t = setTimeout(() => setAnimated(true), 80)
    return () => clearTimeout(t)
  }, [typeIdx])
  useEffect(() => {
    if (!showDetail) setEditingGoal(false)
  }, [showDetail])
  // Locks background page scroll while this modal is open. `document.body`
  // was the wrong lock target — this app's `.app-shell` is `overflow:
  // hidden; height: 100dvh` and never scrolls at all; `.page-content` (a
  // DIFFERENT, nested element) is the actual scrolling box. Locking body
  // did nothing, which is exactly why the page behind the modal could
  // still visibly scroll/move. Locks `.page-content` itself instead, plus
  // `touch-action: none` as a second layer — WKWebView can otherwise still
  // rubber-band/momentum-scroll an `overflow: hidden` element from an
  // in-flight touch that started before the lock was applied.
  useEffect(() => {
    if (!showDetail) return
    const scrollEl = document.querySelector<HTMLElement>('.page-content')
    const prevOverflow = scrollEl?.style.overflow
    const prevTouchAction = scrollEl?.style.touchAction
    if (scrollEl) {
      scrollEl.style.overflow = 'hidden'
      scrollEl.style.touchAction = 'none'
    }

    // Belt-and-suspenders beyond the above: WKWebView can still let an
    // in-flight touch rubber-band/momentum-scroll an `overflow: hidden`
    // element it already "owns" the gesture for, if that touch started
    // before the lock applied — `overflow`/`touch-action` alone aren't
    // reliably enough to stop it on iOS specifically (the well-known "CSS
    // body-scroll-lock doesn't actually work on iOS Safari/WKWebView"
    // problem).
    //
    // The first version of this only called `preventDefault()`, which
    // stops the BROWSER's own default scroll behavior but does nothing to
    // stop the event from continuing to propagate — `PullToRefresh`'s own
    // `onTouchStart`/`onTouchMove` (React-attached, bubble phase) kept
    // firing regardless and updating ITS OWN `pull`/`refreshing` state,
    // which is exactly what was still visibly showing "Release to sync"
    // behind the dimmed overlay. `stopPropagation()` (on every touch
    // phase, not just `touchmove`) is what actually stops the event from
    // ever reaching PullToRefresh's handlers at all. The modal's own
    // internal scrolling (its `overflow-y: auto` body) is explicitly
    // exempted so you can still scroll WITHIN the sheet.
    function isOutsideModal(e: TouchEvent): boolean {
      const target = e.target as HTMLElement | null
      return !target?.closest?.('.goal-ring-modal')
    }
    function blockBackgroundTouchMove(e: TouchEvent) {
      if (!isOutsideModal(e)) return
      e.preventDefault()
      e.stopPropagation()
    }
    function blockBackgroundTouch(e: TouchEvent) {
      if (!isOutsideModal(e)) return
      e.stopPropagation()
    }
    document.addEventListener('touchmove', blockBackgroundTouchMove, { passive: false, capture: true })
    document.addEventListener('touchstart', blockBackgroundTouch, { passive: false, capture: true })
    document.addEventListener('touchend', blockBackgroundTouch, { passive: false, capture: true })
    document.addEventListener('touchcancel', blockBackgroundTouch, { passive: false, capture: true })

    return () => {
      if (scrollEl) {
        scrollEl.style.overflow = prevOverflow ?? ''
        scrollEl.style.touchAction = prevTouchAction ?? ''
      }
      document.removeEventListener('touchmove', blockBackgroundTouchMove, { capture: true })
      document.removeEventListener('touchstart', blockBackgroundTouch, { capture: true })
      document.removeEventListener('touchend', blockBackgroundTouch, { capture: true })
      document.removeEventListener('touchcancel', blockBackgroundTouch, { capture: true })
    }
  }, [showDetail])

  const goalType = GOAL_TYPES[typeIdx]
  const cfg = CONFIGS[goalType]

  // Weight values flow through CONFIGS in raw kg; converted here to whichever
  // unit the user has chosen in Settings → Unit System. Other goal types pass
  // through unchanged.
  const toDisplay = (v: number) => goalType === 'weight'
    ? (units.weight === 'kg' ? +v.toFixed(1) : kgToLbs(v))
    : v
  const displayUnit = goalType === 'weight' ? units.weight : cfg.unit

  const rawCurrent = cfg.current(snapshot)
  // Weight isn't a daily reset like steps — if today's own reading is missing,
  // fall back to the last known weigh-in rather than showing a blank ring.
  const weightFallback = goalType === 'weight' && rawCurrent == null && latestWeight
    ? latestWeight.valueKg
    : undefined
  const current  = (rawCurrent ?? weightFallback) != null ? toDisplay(rawCurrent ?? weightFallback!) : undefined
  // Always lbs regardless of the display unit setting — WeightGoalEditor's
  // fields are lbs-only, so this is what seeds its Current Weight field with
  // the live reading instead of a stale profile snapshot (see its own prop doc).
  const currentWeightLbsForEditor = (rawCurrent ?? weightFallback) != null
    ? kgToLbs(rawCurrent ?? weightFallback!)
    : undefined
  const isStaleWeight = goalType === 'weight' && rawCurrent == null && current != null
  const neverWeighed  = goalType === 'weight' && current == null
  const goalValRaw  = goalType === 'steps' ? stepGoal : cfg.goal(profile, nutritionGoals)
  const startValRaw = cfg.start(profile, snapshot)
  const goalVal  = goalValRaw  != null ? toDisplay(goalValRaw)  : undefined
  const startVal = startValRaw != null ? toDisplay(startValRaw) : undefined
  const pct = goalVal != null && current != null && startVal != null
    ? ringPct(current, startVal, goalVal, cfg.higherIsBetter)
    : goalVal != null && current != null
    ? clamp(cfg.higherIsBetter ? (current / goalVal * 100) : 0)
    : 0

  const change     = current != null && startVal != null ? current - startVal : null
  const remaining  = current != null && goalVal != null ? Math.abs(goalVal - current) : null
  const hasData    = current != null
  const hasProfile = startVal != null

  const pace = goalType === 'weight'
    ? computePace({
        start: startVal, current, goal: goalVal,
        startDate: profile?.startDate, goalDate: profile?.goalDate,
        higherIsBetter: cfg.higherIsBetter,
      })
    : null
  const showPace = !!pace && (pace.status === 'reached' || pace.status === 'on-track' || pace.status === 'behind' || pace.status === 'past-due')

  // Calories/day needed to hit the weight goal by the target date — same
  // rate→calorie conversion as the onboarding nutrition step (calcNutrition),
  // just run in reverse: here the date is fixed and the rate comes from
  // computePace's requiredPerWeek instead of a user-picked rate.
  const calorieTarget = (() => {
    if (goalType !== 'weight' || !pace) return null
    if (pace.status !== 'behind' && pace.status !== 'on-track') return null
    if (pace.requiredPerWeek == null || profile?.goalWeightKg == null) return null
    const goalWeightLbs = kgToLbs(profile.goalWeightKg)
    // computePace's requiredPerWeek is always a positive magnitude — negate
    // it for a gain goal (higherIsBetter) so calcNutrition adds calories for
    // a surplus instead of subtracting them for a deficit.
    const rateLbsPerWeek = cfg.higherIsBetter ? -pace.requiredPerWeek : pace.requiredPerWeek
    return calcNutrition(goalWeightLbs, profile?.activityLevel || 'moderate', rateLbsPerWeek).calories
  })()

  function openEditGoal() {
    setEditingGoal(true)
  }

  const touchStartX = useRef<number>(0)
  const touchStartY = useRef<number>(0)
  const didSwipe = useRef<boolean>(false)
  const overlayTouchStart = useRef<{ x: number; y: number } | null>(null)
  const overlayDidSwipe = useRef<boolean>(false)

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    didSwipe.current = false
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current
    // A horizontal swipe changes which goal type is shown. A VERTICAL
    // swipe (e.g. a pull-to-refresh gesture, or just an accidental drag)
    // previously fell through this check entirely — only `dx` was ever
    // looked at — so the browser's trailing synthetic click still fired
    // afterward and opened the detail modal (plus triggered a sync) as if
    // it had been a deliberate tap. Treat any swipe with either axis past
    // the threshold as "not a tap," regardless of direction.
    if (Math.abs(dx) > 40) {
      didSwipe.current = true
      if (dx < 0) next(); else prev()
    } else if (Math.abs(dy) > 40) {
      didSwipe.current = true
    }
  }

  // Opening the detail modal always kicks off a fresh native HealthKit sync
  // first — the modal itself re-renders live once `native-health-sync-complete`
  // lands (the Dashboard-level data hook already listens for that and bumps
  // its tick, which flows back down into this component's props), so
  // "Current"/"Last Synced" update in place instead of showing whatever was
  // last synced before the user even opened the card. Uses the SILENT sync
  // variant deliberately — a native sheet in front of the user on every
  // single open would be far more intrusive than this background refresh.
  function openDetail() {
    if (isInsideNativeApp()) triggerSilentHealthSync()
    setShowDetail(true)
  }

  function handleCardClick() {
    if (didSwipe.current) { didSwipe.current = false; return }
    openDetail()
  }

  const R = 88
  const C = 2 * Math.PI * R
  // A real, logged value at 0% progress reads as "nothing is happening yet,"
  // not "just getting started" — floor the drawn arc (never the displayed
  // percentage text) at a small sliver whenever there's an actual value to
  // show, so the ring itself always looks like progress is underway.
  const displayPct = hasData ? Math.max(pct, 4) : pct
  const strokeOffset = C - (displayPct / 100) * C

  function prev() { setTypeIdx(i => (i - 1 + GOAL_TYPES.length) % GOAL_TYPES.length) }
  function next() { setTypeIdx(i => (i + 1) % GOAL_TYPES.length) }

  const changeColor = change != null
    ? (cfg.higherIsBetter ? (change > 0 ? 'var(--green)' : 'var(--accent)') : (change < 0 ? 'var(--green)' : 'var(--accent)'))
    : undefined

  return (
    <>
      <div className="goal-ring-card" onClick={handleCardClick} role="button" tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && openDetail()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{ '--goal-glow-op': GLOW_INTENSITY[goalType] } as React.CSSProperties}>

        <div className="goal-ring-header">
          <span className="goal-ring-type-label">{cfg.label}</span>
        </div>

        <div className="goal-ring-body">
          <button className="goal-ring-nav" onClick={e => { e.stopPropagation(); prev() }} aria-label="Previous goal">
            <ChevronLeft size={18} />
          </button>

          <div className="goal-ring-svg-wrap">
            <svg width={208} height={208} viewBox="0 0 208 208">
              <defs>
                <filter id={`gr-glow-${goalType}`}>
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                {/* Shared across every goal type — the same brand gradient as
                    the Start/Share buttons, instead of a different flat hue
                    per metric (blue for weight, green for steps, etc.). */}
                <linearGradient id="gr-ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FB8A4C" />
                  <stop offset="50%" stopColor="#A66BF5" />
                  <stop offset="100%" stopColor="#5B7FFF" />
                </linearGradient>
              </defs>
              {/* Track */}
              <circle cx="104" cy="104" r={R} fill="none"
                stroke="rgba(255,255,255,0.07)" strokeWidth="14" />
              {/* Progress arc */}
              <circle cx="104" cy="104" r={R} fill="none"
                stroke="url(#gr-ring-gradient)" strokeWidth="14" strokeLinecap="round"
                strokeDasharray={`${C} ${C}`}
                strokeDashoffset={animated ? strokeOffset : C}
                transform="rotate(-90 104 104)"
                filter={`url(#gr-glow-${goalType})`}
                style={{ transition: 'stroke-dashoffset 1.3s cubic-bezier(0.4,0,0.2,1)' }}
              />
              {/* Center: value */}
              {hasData ? (
                <>
                  <text x="104" y="88" textAnchor="middle" dominantBaseline="middle"
                    fill="#fff" fontSize="36" fontWeight="700"
                    fontFamily="-apple-system,'SF Pro Display',sans-serif"
                    style={{ letterSpacing: '-1px' }}>
                    {cfg.format(current!)}
                  </text>
                  <text x="104" y="114" textAnchor="middle"
                    fill="rgba(255,255,255,0.38)" fontSize="12"
                    fontFamily="-apple-system,sans-serif">
                    {displayUnit}
                  </text>
                  <text x="104" y="132" textAnchor="middle"
                    fill="rgba(255,255,255,0.26)" fontSize="10"
                    fontFamily="-apple-system,sans-serif">
                    {isStaleWeight && latestWeight ? `Last entered ${shortDate(latestWeight.date)}` : `${Math.round(pct)}% of goal`}
                  </text>
                </>
              ) : (
                <text x="104" y="104" textAnchor="middle" dominantBaseline="middle"
                  fill="rgba(255,255,255,0.25)" fontSize="14"
                  fontFamily="-apple-system,sans-serif">
                  {neverWeighed ? 'No weigh-ins yet' : 'No data yet'}
                </text>
              )}
            </svg>

            {/* Dot pagination */}
            <div className="goal-ring-dots">
              {GOAL_TYPES.map((_, i) => (
                <span key={i} className={`goal-ring-dot ${i === typeIdx ? 'goal-ring-dot--active' : ''}`}
                  style={i === typeIdx ? { background: 'var(--gradient-brand)' } : undefined} />
              ))}
            </div>

            {neverWeighed && (
              <button
                className="goal-ring-cta"
                onClick={e => { e.stopPropagation(); navigate('/log') }}
              >
                Log your weight
              </button>
            )}
          </div>

          <button className="goal-ring-nav" onClick={e => { e.stopPropagation(); next() }} aria-label="Next goal">
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Stats row */}
        <div className="goal-ring-stats">
          <div className="goal-ring-stat">
            <span className="goal-ring-stat-val">{startVal != null ? cfg.format(startVal) : '—'}</span>
            <span className="goal-ring-stat-label">Start</span>
          </div>
          <div className="goal-ring-stat goal-ring-stat--center">
            <span className="goal-ring-stat-val" style={{ color: changeColor }}>
              {change != null ? `${change > 0 ? '+' : ''}${cfg.format(Math.abs(change))}` : '—'}
            </span>
            <span className="goal-ring-stat-label">
              {change == null ? 'No data' : (cfg.higherIsBetter ? change > 0 : change < 0) ? 'Progress' : 'Change'}
            </span>
          </div>
          <div className="goal-ring-stat goal-ring-stat--right">
            <span className="goal-ring-stat-val">{goalVal != null ? cfg.format(goalVal) : '—'}</span>
            <span className="goal-ring-stat-label">Goal</span>
          </div>
        </div>

        {(goalType === 'weight' || goalType === 'steps') && (
          // "Synced Now" when there's a last-synced timestamp at all — not a
          // relative time ("2h ago"/"Yesterday"), just the fact that a sync
          // has happened. "Sync Now" (styled as a call to action, not plain
          // status text) when there's none yet. Tapping it doesn't need its
          // own handler — it's part of the card, and opening the card
          // already triggers a silent sync (see openDetail() above).
          <div className={`goal-ring-sync-chip ${!lastSyncedAt ? 'goal-ring-sync-chip--cta' : ''}`}>
            <RefreshCw size={11} className="goal-ring-sync-icon" />
            <span>{lastSyncedAt ? 'Synced Now' : 'Sync Now'}</span>
          </div>
        )}

        <div className="goal-ring-tap-hint">Tap To See Details</div>
      </div>

      {/* ── Detail Modal ── */}
      {showDetail && createPortal(
        <div
          className="goal-ring-overlay"
          onTouchStart={e => { overlayTouchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }}
          onTouchEnd={e => {
            const start = overlayTouchStart.current
            if (!start) return
            const dx = e.changedTouches[0].clientX - start.x
            const dy = e.changedTouches[0].clientY - start.y
            if (Math.hypot(dx, dy) > 10) overlayDidSwipe.current = true
          }}
          onClick={() => {
            // A drag/swipe that happens to end with the finger over the
            // backdrop must not count as a "tap to dismiss" — without
            // this, swiping on/near the modal could close it, which then
            // lets a very next tap reopen it (and resync) again,
            // producing exactly the repeated "sync pops up" loop this is
            // meant to prevent.
            if (overlayDidSwipe.current) { overlayDidSwipe.current = false; return }
            setShowDetail(false)
          }}
        >
          <div className="goal-ring-modal" onClick={e => e.stopPropagation()}>
            <div className="goal-ring-modal-header">
              <span className="goal-ring-modal-title">{cfg.label}</span>
              <button className="goal-ring-modal-close" onClick={() => setShowDetail(false)} aria-label="Close">
                <X size={20} />
              </button>
            </div>
            <div className="goal-ring-modal-body">
              {/* Editing a weight goal shows ONLY the editor — the %/rows/
                  setup-hint above are read-only summaries of the same data
                  the editor is about to change, and stacking everything at
                  once was exactly why opening "Edit Goal" previously meant
                  scrolling to reach the bottom of the form. */}
              {!(goalType === 'weight' && editingGoal) && (
                <>
                  <div className="goal-ring-modal-pct">
                    <span className="goal-ring-modal-pct-num goal-ring-modal-pct-num--gradient">
                      {Math.round(pct)}%
                    </span>
                    <span className="goal-ring-modal-pct-label">{cfg.desc}</span>
                  </div>

                  <div className="goal-ring-modal-rows">
                    {([
                      ['Current',      hasData ? `${cfg.format(current!)} ${displayUnit}` : '—', undefined],
                      ['Start',        hasProfile  ? `${cfg.format(startVal!)} ${displayUnit}`   : '— Set in Profile', undefined],
                      ['Goal',         goalVal != null ? `${cfg.format(goalVal)} ${displayUnit}` : '— Set in Profile',   undefined],
                      ['Total change', change != null ? `${change > 0 ? '+' : ''}${cfg.format(Math.abs(change))} ${displayUnit}` : '—', changeColor],
                      ['Remaining',    remaining != null ? `${cfg.format(remaining)} ${displayUnit} to go` : '—', undefined],
                    ] as [string, string, string | undefined][]).map(([label, val, color]) => (
                      <div key={label} className="goal-ring-modal-row">
                        <span className="goal-ring-modal-row-label">{label}</span>
                        <span className="goal-ring-modal-row-val" style={color ? { color } : undefined}>{val}</span>
                      </div>
                    ))}
                  </div>

                  {!hasProfile && goalType !== 'steps' && goalType !== 'protein' && goalType !== 'sleep' && (
                    <p className="goal-ring-modal-setup-hint">
                      Set your baseline below to track progress from your starting point.
                    </p>
                  )}
                </>
              )}

              {goalType === 'bodyFat' && latestBodyFat && (
                <p className="goal-ring-modal-weight-note">
                  Sync RENPHO via Apple Health to keep this current.
                </p>
              )}

              {goalType === 'sleep' && latestSleep && (
                <p className="goal-ring-modal-weight-note">
                  Open RingConn → ensure Apple Health sync is enabled for Sleep.
                </p>
              )}

              {goalType === 'sleep' && !latestSleep && (
                <p className="goal-ring-modal-weight-note">
                  No sleep data found. In the native app, tap Sync Now after enabling RingConn → Apple Health sync for Sleep, HRV, and Heart Rate.
                </p>
              )}

              {/* ── Weight-goal progress card: pace status + calorie target share
                     one bordered card instead of two separately-colored panels,
                     so the modal reads as one coherent section here. Pace is
                     silent for 'no-data'/'no-target' — nothing useful to say
                     yet, and an empty state would just be more text to scan
                     past. ── */}
              {goalType === 'weight' && !editingGoal && (showPace || calorieTarget != null) && (
                <div className="goal-ring-progress-card">
                  {showPace && pace && (
                    <div className={`goal-ring-pace goal-ring-pace--${pace.status}`}>
                      {pace.status === 'reached' && (
                        <><CheckCircle2 size={16} /> <span>Goal reached — nice work.</span></>
                      )}
                      {pace.status === 'past-due' && (
                        <span>Your target date has passed — update it below to keep tracking.</span>
                      )}
                      {pace.status === 'on-track' && (
                        <><CheckCircle2 size={16} /> <span>On track for your goal date.</span></>
                      )}
                      {pace.status === 'behind' && pace.requiredPerWeek != null && (
                        <span>
                          {cfg.higherIsBetter ? 'Gain' : 'Lose'} ~{cfg.format(Math.abs(pace.requiredPerWeek))} {displayUnit}/week
                          ({Math.abs(pace.requiredPerWeek / 7).toFixed(2)} {displayUnit}/day)
                          to reach your goal by {profile?.goalDate ? shortDate(profile.goalDate) : ''}.
                        </span>
                      )}
                    </div>
                  )}

                  {calorieTarget != null && (
                    <div className="goal-ring-calorie-target">
                      <div className="goal-ring-calorie-target-row">
                        <span>Current goal: {nutritionGoals.calories} cal</span>
                        <span>Needed: {calorieTarget} cal</span>
                      </div>
                      <div className="goal-ring-calorie-target-track">
                        <div className="goal-ring-calorie-target-marker goal-ring-calorie-target-marker--current"
                          style={{ left: `${clamp((nutritionGoals.calories ?? 0) / Math.max(nutritionGoals.calories ?? 0, calorieTarget) * 100)}%` }} />
                        <div className="goal-ring-calorie-target-marker goal-ring-calorie-target-marker--needed"
                          style={{ left: `${clamp(calorieTarget / Math.max(nutritionGoals.calories ?? 0, calorieTarget) * 100)}%` }} />
                      </div>
                      <p className="goal-ring-calorie-target-note">
                        ~{calorieTarget} cal/day to hit your goal by {profile?.goalDate ? shortDate(profile.goalDate) : 'your target date'}.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* ── Inline goal editor — same shared Current/Goal/Target Date +
                     pace editor as the Nutrition page's Weight-Loss Rate tab,
                     so editing a weight goal looks and behaves identically no
                     matter which screen it's opened from. ── */}
              {goalType === 'weight' && editingGoal && (
                <WeightGoalEditor
                  liveCurrentWeightLbs={currentWeightLbsForEditor}
                  onCancel={() => setEditingGoal(false)}
                  onSaved={async result => {
                    const current = await getSetting<NutritionGoals>('nutrition-goals', DEFAULT_GOALS)
                    await setSetting('nutrition-goals', { ...current, ...result })
                    setNutritionGoals(prev => ({ ...prev, calories: result.calories, proteinG: result.proteinG }))
                    setProfile(await getProfile())
                    setEditingGoal(false)
                  }}
                />
              )}

              <div className="goal-ring-modal-actions">
                {goalType === 'weight' && editingGoal ? null : goalType === 'weight' ? (
                  <>
                    <button className="goal-ring-modal-btn" onClick={() => setShowWeightLog(true)}>
                      Log Weight
                    </button>
                    <button className="goal-ring-modal-btn" onClick={openEditGoal}>
                      Edit Goal
                    </button>
                  </>
                ) : (
                  <>
                    <button className="goal-ring-modal-btn"
                      onClick={() => { setShowDetail(false); navigate('/profile') }}>
                      Edit Goal
                    </button>
                    <button className="goal-ring-modal-btn"
                      onClick={() => { setShowDetail(false); navigate('/compare') }}>
                      View Compare
                    </button>
                  </>
                )}
              </div>

              {goalType === 'weight' && !editingGoal && latestWeight && (
                <p className="goal-ring-modal-last-synced">
                  Last Synced · {shortDate(latestWeight.date)}
                </p>
              )}
              {goalType === 'bodyFat' && latestBodyFat && (
                <p className="goal-ring-modal-last-synced">
                  Last synced: {sourceLabel(latestBodyFat.sourceId)} · {shortDate(latestBodyFat.date)}
                </p>
              )}
              {goalType === 'sleep' && latestSleep && (
                <p className="goal-ring-modal-last-synced">
                  Last synced: {sourceLabel(latestSleep.sourceId)} · {shortDate(latestSleep.date)}
                </p>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      <AnimatePresence>
        {showWeightLog && (
          <QuickWeightModal onClose={() => setShowWeightLog(false)} onSaved={() => {}} />
        )}
      </AnimatePresence>
    </>
  )
}
