import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { kgToLbs } from '../data/config'
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
const GOAL_TYPES: GoalType[] = ['weight', 'bodyFat', 'steps', 'protein', 'sleep']

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
    label: 'Weight Goal', unit: 'lbs', color: 'var(--blue)',
    current: s => s.weight ? kgToLbs(s.weight) : undefined,
    start:   (p, s) => p?.startWeightKg ? kgToLbs(p.startWeightKg) : (s.weight ? +(kgToLbs(s.weight) + 15).toFixed(1) : undefined),
    goal:    p => p?.goalWeightKg ? kgToLbs(p.goalWeightKg) : undefined,
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
}

export default function GoalRing({ snapshot, yesterday, dataSource }: Props) {
  const navigate = useNavigate()
  const [typeIdx, setTypeIdx] = useState(0)
  const [profile,        setProfile]        = useState<ProfileData | null>(null)
  const [nutritionGoals, setNutritionGoals] = useState<Pick<NutritionGoals, 'proteinG'>>({ proteinG: 200 })
  const [animated,       setAnimated]       = useState(false)
  const [showDetail,     setShowDetail]     = useState(false)
  const isMock = dataSource === 'mock'

  useEffect(() => {
    getProfile().then(setProfile)
    getSetting<NutritionGoals | null>('nutrition-goals', null).then(ng => {
      if (ng?.proteinG) setNutritionGoals({ proteinG: ng.proteinG })
    })
  }, [])
  useEffect(() => {
    setAnimated(false)
    const t = setTimeout(() => setAnimated(true), 80)
    return () => clearTimeout(t)
  }, [typeIdx])

  const goalType = GOAL_TYPES[typeIdx]
  const cfg = CONFIGS[goalType]

  const current  = cfg.current(snapshot)
  const goalVal  = cfg.goal(profile, nutritionGoals)
  const startVal = cfg.start(profile, snapshot)
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
      <div className="goal-ring-card" onClick={() => setShowDetail(true)} role="button" tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && setShowDetail(true)}>

        <div className="goal-ring-header">
          <span className="goal-ring-type-label">{cfg.label}</span>
          <DataBadge mode={badgeMode} size="sm" />
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
                    {cfg.unit}
                  </text>
                  <text x="104" y="132" textAnchor="middle"
                    fill="rgba(255,255,255,0.26)" fontSize="10"
                    fontFamily="-apple-system,sans-serif">
                    {Math.round(pct)}% of goal
                  </text>
                </>
              ) : (
                <text x="104" y="104" textAnchor="middle" dominantBaseline="middle"
                  fill="rgba(255,255,255,0.25)" fontSize="14"
                  fontFamily="-apple-system,sans-serif">
                  No data yet
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
      {showDetail && (
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
                  ['Current',      hasData     ? `${cfg.format(current!)} ${cfg.unit}`    : '—',      undefined    ],
                  ['Start',        hasProfile  ? `${cfg.format(startVal!)} ${cfg.unit}`   : '— Set in Profile', undefined],
                  ['Goal',         goalVal != null ? `${cfg.format(goalVal)} ${cfg.unit}` : '— Set in Profile',   undefined],
                  ['Total change', change != null ? `${change > 0 ? '+' : ''}${cfg.format(Math.abs(change))} ${cfg.unit}` : '—', changeColor],
                  ['Remaining',    remaining != null ? `${cfg.format(remaining)} ${cfg.unit} to go` : '—', undefined],
                ] as [string, string, string | undefined][]).map(([label, val, color]) => (
                  <div key={label} className="goal-ring-modal-row">
                    <span className="goal-ring-modal-row-label">{label}</span>
                    <span className="goal-ring-modal-row-val" style={color ? { color } : undefined}>{val}</span>
                  </div>
                ))}
                {(() => {
                  const yestVal = yesterday ? cfg.current(yesterday) : undefined
                  const vstYest = yestVal != null && current != null ? current - yestVal : null
                  if (vstYest == null) return null
                  const c = (cfg.higherIsBetter ? vstYest > 0 : vstYest < 0) ? 'var(--green)' : 'var(--orange)'
                  return (
                    <div className="goal-ring-modal-row">
                      <span className="goal-ring-modal-row-label">vs Yesterday</span>
                      <span className="goal-ring-modal-row-val" style={{ color: c }}>
                        {vstYest > 0 ? '+' : ''}{cfg.format(Math.abs(vstYest))} {cfg.unit}
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
        </div>
      )}
    </>
  )
}
