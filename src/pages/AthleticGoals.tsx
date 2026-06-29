import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { useDashboardData } from '../hooks/useDashboardData'
import { kgToLbs, GOALS } from '../data/config'
import './AthleticGoals.css'

// ─── Types ────────────────────────────────────────────────────────────────────

interface GoalConfig {
  id: string
  emoji: string
  title: string
  category: string
  description: string
  unit: string
  target: string
  getStatus: (data: ReturnType<typeof useDashboardData>) => {
    current: string | null
    progress: number     // 0–100
    statusText: string
    nextAction: string
  }
  relatedMetrics: string[]
}

// ─── Goal Definitions ─────────────────────────────────────────────────────────

const GOAL_CONFIGS: GoalConfig[] = [
  {
    id: 'abs',
    emoji: '💪',
    title: 'Visible Abs',
    category: 'Body Composition',
    description: 'Get to sub-12% body fat while maintaining muscle mass.',
    unit: '% body fat',
    target: '≤ 12% body fat',
    getStatus: (d) => {
      const bf = d.today.bodyFatPct
      if (bf == null) return {
        current: null,
        progress: 0,
        statusText: 'No body fat data — import Apple Health or log manually.',
        nextAction: 'Import Apple Health to see your current body fat %.',
      }
      const pct = Math.max(0, Math.min(100, Math.round((30 - bf) / (30 - 12) * 100)))
      const diff = +(bf - 12).toFixed(1)
      return {
        current: `${bf.toFixed(1)}%`,
        progress: pct,
        statusText: diff <= 0
          ? 'Goal reached! You\'re at or below 12% body fat.'
          : `${diff}% away from goal. Maintain a 300–500 kcal deficit and 200g+ protein daily.`,
        nextAction: diff <= 0
          ? 'Maintain current habits and monitor weekly.'
          : `Track body fat weekly. Focus on calorie deficit and high protein to lose fat while preserving muscle.`,
      }
    },
    relatedMetrics: ['Body fat %', 'Weight', 'Lean mass'],
  },

  {
    id: 'pullups',
    emoji: '🏋️',
    title: 'Pull-up Strength',
    category: 'Strength',
    description: 'Work toward 20+ strict pull-ups in one set.',
    unit: 'reps',
    target: '20+ reps',
    getStatus: () => ({
      current: null,
      progress: 0,
      statusText: 'Log pull-up workouts to track progress toward 20 reps.',
      nextAction: 'Log a "Pull-ups" exercise set in your next workout to start tracking.',
    }),
    relatedMetrics: ['Pull-up sets', 'Back workout frequency', 'Body weight'],
  },

  {
    id: 'vertical',
    emoji: '🏀',
    title: 'Vertical Jump',
    category: 'Athleticism',
    description: 'Improve vertical leap for basketball and volleyball.',
    unit: 'inches',
    target: '30+ inch vertical',
    getStatus: () => ({
      current: null,
      progress: 0,
      statusText: 'Manual entry needed — measure your standing vertical periodically.',
      nextAction: 'Include plyometric training: box jumps, broad jumps, depth drops. Measure monthly.',
    }),
    relatedMetrics: ['Bulgarian split squats', 'Leg press', 'Body weight'],
  },

  {
    id: 'dunk',
    emoji: '🏆',
    title: 'Dunk',
    category: 'Athleticism',
    description: 'Touch the rim, then work toward a clean dunk.',
    unit: '',
    target: 'Dunk on 10-ft rim',
    getStatus: () => ({
      current: null,
      progress: 0,
      statusText: 'Combine vertical training with weight management. Higher vertical = closer to a dunk.',
      nextAction: 'Track your reach + vertical progress. Plyometrics 2x/week. Optimize body weight.',
    }),
    relatedMetrics: ['Vertical jump', 'Leg power workouts', 'Body weight'],
  },

  {
    id: 'running',
    emoji: '🏃',
    title: 'Running Endurance',
    category: 'Cardio',
    description: 'Run a 5K without stopping, then build to 10K.',
    unit: '',
    target: '5K without stopping',
    getStatus: (d) => {
      const steps = d.today.steps
      if (!steps) return {
        current: null,
        progress: 0,
        statusText: 'No step data. Import Apple Health to track daily distance.',
        nextAction: 'Start with 3x20-min jogs per week. Increase duration 10% each week.',
      }
      return {
        current: `${steps.toLocaleString()} steps today`,
        progress: Math.min(100, Math.round(steps / 10000 * 100)),
        statusText: `${steps.toLocaleString()} steps today. Cardio base is building.`,
        nextAction: 'Add 2–3 running sessions per week. Track each run and gradually extend distance.',
      }
    },
    relatedMetrics: ['Daily steps', 'Running sessions', 'Resting HR'],
  },

  {
    id: 'weight',
    emoji: '⚖️',
    title: 'Body Weight Goal',
    category: 'Body Composition',
    description: 'Reach and maintain target weight of 190 lbs.',
    unit: 'lbs',
    target: `${GOALS.targetWeightLbs} lbs`,
    getStatus: (d) => {
      const w = d.today.weight
      if (!w) return {
        current: null,
        progress: 0,
        statusText: 'No weight data. Import Apple Health or log your weight daily.',
        nextAction: 'Weigh yourself every morning after waking, before eating. Log it daily.',
      }
      const wLbs = kgToLbs(w)
      const start = 215
      const target = GOALS.targetWeightLbs
      const pct = Math.max(0, Math.min(100, Math.round((start - wLbs) / (start - target) * 100)))
      const diff = +(wLbs - target).toFixed(1)
      return {
        current: `${wLbs} lbs`,
        progress: pct,
        statusText: diff <= 0
          ? `At goal weight of ${target} lbs!`
          : `${diff} lbs above ${target} lbs goal.`,
        nextAction: diff <= 0
          ? 'Maintain current weight within ±2 lbs by tracking weekly average.'
          : 'Aim for 0.5–1 lb/week loss via moderate calorie deficit and high protein.',
      }
    },
    relatedMetrics: ['Daily weight', 'Calories', 'Protein intake'],
  },

  {
    id: 'shoulders',
    emoji: '🔱',
    title: 'Shoulder & Arm Growth',
    category: 'Strength',
    description: 'Build broader shoulders and more defined arms.',
    unit: '',
    target: 'Shoulder press + lateral raise volume',
    getStatus: () => ({
      current: null,
      progress: 0,
      statusText: 'Log shoulder and arm workouts to track volume over time.',
      nextAction: 'Hit shoulders 2x/week: shoulder press + lateral raises + face pulls. Track total weekly volume.',
    }),
    relatedMetrics: ['Shoulder press sets', 'Lateral raises volume', 'Weekly push sessions'],
  },
]

// ─── Goal Card ────────────────────────────────────────────────────────────────

function GoalCard({ goal, data }: { goal: GoalConfig; data: ReturnType<typeof useDashboardData> }) {
  const status = goal.getStatus(data)

  return (
    <div className="goal-card">
      <div className="goal-card-header">
        <span className="goal-emoji">{goal.emoji}</span>
        <div className="goal-header-text">
          <h3 className="goal-title">{goal.title}</h3>
          <span className="goal-category">{goal.category}</span>
        </div>
        {status.current && (
          <div className="goal-current">
            <span className="goal-current-label">Now</span>
            <span className="goal-current-value">{status.current}</span>
          </div>
        )}
      </div>

      <p className="goal-description">{goal.description}</p>

      {/* Progress bar */}
      <div className="goal-progress-wrap">
        <div className="goal-progress-track">
          <div className="goal-progress-fill" style={{ width: `${status.progress}%` }} />
        </div>
        <div className="goal-progress-labels">
          <span>Start</span>
          <span className="goal-target-label">Target: {goal.target}</span>
          <span>{status.progress}%</span>
        </div>
      </div>

      {/* Status */}
      <div className="goal-status">{status.statusText}</div>

      {/* Next action */}
      <div className="goal-next-action">
        <ArrowRight size={13} />
        <span>{status.nextAction}</span>
      </div>

      {/* Related metrics */}
      <div className="goal-metrics">
        {goal.relatedMetrics.map(m => (
          <span key={m} className="goal-metric-chip">{m}</span>
        ))}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AthleticGoals() {
  const data = useDashboardData()
  const [activeCategory, setActiveCategory] = useState<string>('All')

  const categories = ['All', ...Array.from(new Set(GOAL_CONFIGS.map(g => g.category)))]
  const filtered = activeCategory === 'All'
    ? GOAL_CONFIGS
    : GOAL_CONFIGS.filter(g => g.category === activeCategory)

  if (data.loading) return <div className="goals-loading">Loading…</div>

  return (
    <div className="athletic-goals-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Athletic Goals</h1>
          <p className="page-subtitle">Your targets and what to do next</p>
        </div>
      </header>

      <div className="goals-filter">
        {categories.map(c => (
          <button key={c} className={`goals-filter-btn ${activeCategory === c ? 'active' : ''}`} onClick={() => setActiveCategory(c)}>
            {c}
          </button>
        ))}
      </div>

      <div className="goals-grid">
        {filtered.map(g => (
          <GoalCard key={g.id} goal={g} data={data} />
        ))}
      </div>
    </div>
  )
}
