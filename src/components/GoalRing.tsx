import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { kgToLbs } from '../data/config'
import { useUnits } from '../hooks/useUnits'
import { getProfile } from '../db/profileStore'
import { getSetting } from '../db'
import type { ProfileData, NutritionGoals } from '../db'
import type { DailySnapshot } from '../types/health'
import DataBadge from './DataBadge'
import type { DataBadgeMode } from './DataBadge'
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
  color: string
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
    label: 'Weight Goal', unit: 'lbs', color: 'var(--blue)',
    current: s => s.weight ?? undefined,
    start:   (p, s) => p?.startWeightKg ?? (s.weight ? +(s.weight + 6.8).toFixed(1) : undefined),
    goal:    p => p?.goalWeightKg ?? undefined,
    higherIsBetter: false,
    format:  v => v.toFixed(1),
    desc:    'toward target weight',
  },
  bodyFat: {
    label: 'Body Fat Goal', unit: '%', color: 'var(--teal)',
    current: s => s.bodyFatPct,
    start:   (p, _s) => p?.startBodyFatPct,
    goal:    p => p?.goalBodyFatPct ?? undefined,
    higherIsBetter: false,
    format:  v => v.toFixed(1),
    desc:    'toward target body fat',
  },
  steps: {
    label: 'Daily Steps', unit: 'steps', color: 'var(--green)',
    current: s => s.steps,
    start:   (_p, _s) => 0,
    goal:    () => STEP_GOAL_DAY,
    higherIsBetter: true,
    format:  v => Math.round(v).toLocaleString(),
    desc:    "today's step goal",
  },
  protein: {
    label: 'Protein Goal', unit: 'g', color: 'var(--orange)',
    current: s => s.proteinG,
    start:   (_p, _s) => 0,
    goal:    (_p, ng) => ng.proteinG,
    higherIsBetter: true,
    format:  v => Math.round(v).toString(),
    desc:    "today's protein goal",
  },
  sleep: {
    label: 'Sleep Goal', unit: 'h', color: 'var(--purple)',
    current: s => s.sleepHours,
    start:   (_p, _s) => 0,
    goal:    () => SLEEP_GOAL_H,
    higherIsBetter: true,
    format:  v => v.toFixed(1),
    desc:    "last night's sleep",
  },
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

interface Props {
  snapshot: DailySnapshot
  yesterday?: DailySnapshot
  dataSource: string
  /** True only in developer mock mode (simulated data). `dataSource` also
      reads 'mock' when there's simply no real data yet for the day — that's
      not the same thing, and shouldn't be badged "MOCK DATA". */
  mockMode?: boolean
  latestWeight?: import('../hooks/useDashboardData').LatestWeightInfo
  latestBodyFat?: import('../hooks/useDashboardData').LatestBodyFatInfo
  latestSleep?: import('../hooks/useDashboardData').LatestSleepInfo
}

export default function GoalRing({ snapshot, yesterday, dataSource, mockMode, latestWeight, latestBodyFat, latestSleep }: Props) {
  const navigate = useNavigate()
  const units = useUnits()
  const [typeIdx, setTypeIdx] = useState(0)
  const [profile,        setProfile]        = useState<ProfileData | null>(null)
  const [nutritionGoals, setNutritionGoals] = useState<Pick<NutritionGoals, 'proteinG'>>({ proteinG: 200 })
  const [stepGoal,       setStepGoal]       = useState(10_000)
  const [animated,       setAnimated]       = useState(false)
  const [showDetail,     setShowDetail]     = useState(false)
  const isMock = !!mockMode

  function sourceLabel(sourceId: string): string {
    if (sourceId === 'renpho')      return 'RENPHO via Apple Health'
    if (sourceId === 'apple_watch') return 'Apple Watch'
    if (sourceId === 'ringconn')    return 'RingConn via Apple Health'
    return 'Apple Health'
  }
  // Keep old name as alias so existing weight/bodyFat calls don't change
  const weightSourceLabel = sourceLabel

  useEffect(() => {
    getProfile().then(setProfile)
    getSetting<NutritionGoals | null>('nutrition-goals', null).then(ng => {
      if (ng?.proteinG) setNutritionGoals({ proteinG: ng.proteinG })
    })
    getSetting<number>('step-goal', 10_000).then(setStepGoal)
  }, [])
  useEffect(() => {
    setAnimated(false)
    const t = setTimeout(() => setAnimated(true), 80)
    return () => clearTimeout(t)
  }, [typeIdx])

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

  const badgeMode: DataBadgeMode = isMock ? 'mock' : dataSource === 'manual' ? 'manual' : 'imported'
  // Nothing to badge when the ring is showing its empty state for real (not mock mode).
  const showBadge = isMock || current != null

  const touchStartX = useRef<number>(0)
  const didSwipe = useRef<boolean>(false)

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
    didSwipe.current = false
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) > 40) {
      didSwipe.current = true
      if (dx < 0) next(); else prev()
    }
  }

  function handleCardClick() {
    if (didSwipe.current) { didSwipe.current = false; return }
    setShowDetail(true)
  }

  const R = 88
  const C = 2 * Math.PI * R
  const strokeOffset = C - (pct / 100) * C

  function prev() { setTypeIdx(i => (i - 1 + GOAL_TYPES.length) % GOAL_TYPES.length) }
  function next() { setTypeIdx(i => (i + 1) % GOAL_TYPES.length) }

  const changeColor = change != null
    ? (cfg.higherIsBetter ? (change > 0 ? 'var(--green)' : 'var(--orange)') : (change < 0 ? 'var(--green)' : 'var(--orange)'))
    : undefined

  return (
    <>
      <div className="goal-ring-card" onClick={handleCardClick} role="button" tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && setShowDetail(true)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}>

        <div className="goal-ring-header">
          <span className="goal-ring-type-label">{cfg.label}</span>
          {showBadge && <DataBadge mode={badgeMode} size="sm" />}
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
              </defs>
              {/* Track */}
              <circle cx="104" cy="104" r={R} fill="none"
                stroke="rgba(255,255,255,0.07)" strokeWidth="14" />
              {/* Progress arc */}
              <circle cx="104" cy="104" r={R} fill="none"
                stroke={cfg.color} strokeWidth="14" strokeLinecap="round"
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
                  style={i === typeIdx ? { background: cfg.color } : undefined} />
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

        <div className="goal-ring-tap-hint">Tap to see details</div>
      </div>

      {/* ── Detail Modal ── */}
      {showDetail && createPortal(
        <div className="goal-ring-overlay" onClick={() => setShowDetail(false)}>
          <div className="goal-ring-modal" onClick={e => e.stopPropagation()}>
            <div className="goal-ring-modal-header">
              <span className="goal-ring-modal-title">{cfg.label}</span>
              <button className="goal-ring-modal-close" onClick={() => setShowDetail(false)} aria-label="Close">
                <X size={20} />
              </button>
            </div>
            <div className="goal-ring-modal-body">
              <div className="goal-ring-modal-pct">
                <span className="goal-ring-modal-pct-num" style={{ color: cfg.color }}>
                  {Math.round(pct)}%
                </span>
                <span className="goal-ring-modal-pct-label">{cfg.desc}</span>
              </div>

              <div className="goal-ring-modal-rows">
                {([
                  ['Current',      hasData     ? (goalType === 'weight' && latestWeight ? `${cfg.format(current!)} ${displayUnit} · ${sourceLabel(latestWeight.sourceId)} · ${latestWeight.date}` : goalType === 'bodyFat' && latestBodyFat ? `${cfg.format(current!)} ${displayUnit} · ${sourceLabel(latestBodyFat.sourceId)} · ${latestBodyFat.date}` : goalType === 'sleep' && latestSleep ? `${cfg.format(current!)} ${displayUnit} · ${sourceLabel(latestSleep.sourceId)} · ${latestSleep.date}` : `${cfg.format(current!)} ${displayUnit}`) : '—',      undefined    ],
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
                {(() => {
                  const yestValRaw = yesterday ? cfg.current(yesterday) : undefined
                  const yestVal = yestValRaw != null ? toDisplay(yestValRaw) : undefined
                  const vstYest = yestVal != null && current != null ? current - yestVal : null
                  if (vstYest == null) return null
                  const c = (cfg.higherIsBetter ? vstYest > 0 : vstYest < 0) ? 'var(--green)' : 'var(--orange)'
                  return (
                    <div className="goal-ring-modal-row">
                      <span className="goal-ring-modal-row-label">vs Yesterday</span>
                      <span className="goal-ring-modal-row-val" style={{ color: c }}>
                        {vstYest > 0 ? '+' : ''}{cfg.format(Math.abs(vstYest))} {displayUnit}
                      </span>
                    </div>
                  )
                })()}
              </div>

              {!hasProfile && goalType !== 'steps' && goalType !== 'protein' && goalType !== 'sleep' && (
                <p className="goal-ring-modal-setup-hint">
                  Set your baseline in Profile to track progress from your starting point.
                </p>
              )}

              {goalType === 'weight' && latestWeight && (
                <p className="goal-ring-modal-weight-note">
                  Weight from {weightSourceLabel(latestWeight.sourceId)} on {latestWeight.date}. Tap "Edit Goal" to update your start weight.
                </p>
              )}

              {goalType === 'bodyFat' && latestBodyFat && (
                <p className="goal-ring-modal-weight-note">
                  Body fat from {sourceLabel(latestBodyFat.sourceId)} on {latestBodyFat.date}. Sync RENPHO via Apple Health to keep this current.
                </p>
              )}

              {goalType === 'sleep' && latestSleep && (
                <p className="goal-ring-modal-weight-note">
                  Sleep from {sourceLabel(latestSleep.sourceId)} on {latestSleep.date}. Open RingConn → ensure Apple Health sync is enabled for Sleep.
                </p>
              )}

              {goalType === 'sleep' && !latestSleep && (
                <p className="goal-ring-modal-weight-note">
                  No sleep data found. In the native app, tap Sync Now after enabling RingConn → Apple Health sync for Sleep, HRV, and Heart Rate.
                </p>
              )}

              <div className="goal-ring-modal-actions">
                <button className="goal-ring-modal-btn goal-ring-modal-btn--primary"
                  onClick={() => { setShowDetail(false); navigate('/profile') }}>
                  Edit Goal
                </button>
                <button className="goal-ring-modal-btn"
                  onClick={() => { setShowDetail(false); navigate('/compare') }}>
                  View Compare
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
