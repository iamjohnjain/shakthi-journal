import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X, CheckCircle2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { kgToLbs, localDateStr } from '../data/config'
import { useUnits } from '../hooks/useUnits'
import { getProfile, saveProfile } from '../db/profileStore'
import { getSetting, getSyncHistory } from '../db'
import type { ProfileData, NutritionGoals } from '../db'
import type { DailySnapshot } from '../types/health'
import { isInsideNativeApp, openNativeHealthSync } from '../layout/BottomNav'
import QuickWeightModal from './QuickWeightModal'
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

/** "2h ago" / "Yesterday" / "Mar 4" — close enough for a quiet status line,
    not trying to be a precise countdown. */
function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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

export default function GoalRing({ snapshot, yesterday, latestWeight, latestBodyFat, latestSleep }: Props) {
  const navigate = useNavigate()
  const units = useUnits()
  const [typeIdx, setTypeIdx] = useState(0)
  const [profile,        setProfile]        = useState<ProfileData | null>(null)
  const [nutritionGoals, setNutritionGoals] = useState<Pick<NutritionGoals, 'proteinG'>>({ proteinG: 200 })
  const [stepGoal,       setStepGoal]       = useState(10_000)
  const [animated,       setAnimated]       = useState(false)
  const [showDetail,     setShowDetail]     = useState(false)
  const [showWeightLog,  setShowWeightLog]  = useState(false)
  const [lastSyncedAt,   setLastSyncedAt]   = useState<string | null>(null)
  const [editingGoal,    setEditingGoal]    = useState(false)
  const [editStart,      setEditStart]      = useState('')
  const [editGoal,       setEditGoal]       = useState('')
  const [editDate,       setEditDate]       = useState('')
  const [savingEdit,     setSavingEdit]     = useState(false)

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
    getSyncHistory(1).then(h => setLastSyncedAt(h[0]?.completedAt ?? null))
  }, [])
  useEffect(() => {
    setAnimated(false)
    const t = setTimeout(() => setAnimated(true), 80)
    return () => clearTimeout(t)
  }, [typeIdx])
  useEffect(() => {
    if (!showDetail) setEditingGoal(false)
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
  const isStaleWeight = goalType === 'weight' && rawCurrent == null && current != null
  const neverWeighed  = goalType === 'weight' && current == null
  const isStaleData = goalType === 'weight' ? rawCurrent == null : goalType === 'steps' ? current == null : false

  function triggerSync() {
    if (isInsideNativeApp()) openNativeHealthSync()
    else navigate('/import/apple-health')
  }
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

  function openEditGoal() {
    setEditStart(startVal != null ? String(startVal) : '')
    setEditGoal(goalVal != null ? String(goalVal) : '')
    setEditDate(profile?.goalDate ?? '')
    setEditingGoal(true)
  }

  async function saveEditGoal() {
    if (!profile) return
    setSavingEdit(true)
    const toKg = (v: string): number | undefined => {
      if (v === '') return undefined
      const n = Number(v)
      return units.weight === 'kg' ? n : +(n / 2.20462).toFixed(2)
    }
    await saveProfile({
      ...profile,
      name: profile.name || 'Me',
      startWeightKg: toKg(editStart) ?? profile.startWeightKg,
      goalWeightKg: toKg(editGoal) ?? profile.goalWeightKg,
      goalDate: editDate || undefined,
    })
    setProfile(await getProfile())
    setSavingEdit(false)
    setEditingGoal(false)
  }

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
        onTouchEnd={handleTouchEnd}
        style={{ '--goal-glow': cfg.color } as React.CSSProperties}>

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

        {(goalType === 'weight' || goalType === 'steps') && (
          <div className="goal-ring-sync-line">
            <span>{lastSyncedAt ? `Last synced ${relativeTime(lastSyncedAt)}` : 'Never synced'}</span>
            {isStaleData && (
              <button className="goal-ring-sync-btn" onClick={e => { e.stopPropagation(); triggerSync() }}>
                Sync now
              </button>
            )}
          </div>
        )}

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
                  Set your baseline below to track progress from your starting point.
                </p>
              )}

              {goalType === 'weight' && latestWeight && (
                <p className="goal-ring-modal-weight-note">
                  Weight from {weightSourceLabel(latestWeight.sourceId)} on {latestWeight.date}.
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

              {/* ── Weight-goal pace: on-track status or a lose/gain-per-week suggestion.
                     Silent for 'no-data'/'no-target' — nothing useful to say yet, and an
                     empty state here would just be more text to scan past. ── */}
              {goalType === 'weight' && !editingGoal && pace &&
                (pace.status === 'reached' || pace.status === 'on-track' || pace.status === 'behind' || pace.status === 'past-due') && (
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

              {/* ── Inline goal editor — start weight, goal weight, target date ── */}
              {goalType === 'weight' && editingGoal && (
                <div className="goal-ring-edit-form">
                  <label className="goal-ring-edit-field">
                    <span>Start weight ({displayUnit})</span>
                    <input type="number" inputMode="decimal" step="0.1" value={editStart}
                      onChange={e => setEditStart(e.target.value)} placeholder="—" />
                  </label>
                  <label className="goal-ring-edit-field">
                    <span>Goal weight ({displayUnit})</span>
                    <input type="number" inputMode="decimal" step="0.1" value={editGoal}
                      onChange={e => setEditGoal(e.target.value)} placeholder="—" />
                  </label>
                  <label className="goal-ring-edit-field">
                    <span>Target date</span>
                    <input type="date" value={editDate} min={localDateStr()}
                      onChange={e => setEditDate(e.target.value)} />
                  </label>
                </div>
              )}

              <div className="goal-ring-modal-actions">
                {goalType === 'weight' && editingGoal ? (
                  <>
                    <button className="goal-ring-modal-btn" onClick={() => setEditingGoal(false)} disabled={savingEdit}>
                      Cancel
                    </button>
                    <button className="goal-ring-modal-btn goal-ring-modal-btn--primary" onClick={saveEditGoal} disabled={savingEdit}>
                      {savingEdit ? 'Saving…' : 'Save'}
                    </button>
                  </>
                ) : goalType === 'weight' ? (
                  <>
                    <button className="goal-ring-modal-btn" onClick={() => setShowWeightLog(true)}>
                      Log Weight
                    </button>
                    <button className="goal-ring-modal-btn goal-ring-modal-btn--primary" onClick={openEditGoal}>
                      Edit Goal
                    </button>
                  </>
                ) : (
                  <>
                    <button className="goal-ring-modal-btn goal-ring-modal-btn--primary"
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
            </div>
          </div>
        </div>,
        document.body
      )}

      {showWeightLog && (
        <QuickWeightModal onClose={() => setShowWeightLog(false)} onSaved={() => {}} />
      )}
    </>
  )
}
