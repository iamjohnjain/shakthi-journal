import { useState, useEffect } from 'react'
import { ArrowRight, Target, Plus, X, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useDashboardData } from '../hooks/useDashboardData'
import { getProfile } from '../db/profileStore'
import { getSetting } from '../db'
import type { ProfileData, NutritionGoals } from '../db'
import { getUserGoals, saveUserGoal, deleteUserGoal } from '../db/goalStore'
import type { UserGoal, GoalCategory } from '../db/goalStore'
import { kgToLbs } from '../data/config'
import './AthleticGoals.css'

// ─── Data-driven goal types ───────────────────────────────────────────────────

interface GoalStatus {
  current: string | null
  progress: number     // 0–100
  statusText: string
  nextAction: string
}

interface GoalConfig {
  id: string
  emoji: string
  title: string
  category: string
  description: string
  target: string
  getStatus: (
    data: ReturnType<typeof useDashboardData>,
    profile: ProfileData | null,
    nutGoals: Pick<NutritionGoals, 'proteinG' | 'calories'>,
  ) => GoalStatus
  relatedMetrics: string[]
}

// ─── Preset quick-add goals ───────────────────────────────────────────────────

const PRESET_GOALS: Array<{ emoji: string; title: string; category: GoalCategory }> = [
  { emoji: '🏃', title: 'Run first marathon', category: 'cardio' },
  { emoji: '🏋️', title: 'Bench 225 lbs', category: 'strength' },
  { emoji: '⚖️', title: 'Lose 25 lbs', category: 'weight' },
  { emoji: '😴', title: 'Sleep 8 hours every night', category: 'habit' },
  { emoji: '🗓️', title: 'Train 4x per week', category: 'habit' },
  { emoji: '💧', title: 'Drink 1 gallon of water daily', category: 'nutrition' },
  { emoji: '🏊', title: 'Finish an Ironman', category: 'milestone' },
  { emoji: '🎯', title: '5% body fat reduction', category: 'weight' },
]

// ─── Data-driven goal factory ─────────────────────────────────────────────────

function makeGoals(profile: ProfileData | null): GoalConfig[] {
  const goals: GoalConfig[] = []

  if (profile?.goalWeightKg) {
    const goalLbs  = Math.round(kgToLbs(profile.goalWeightKg))
    const startLbs = profile.startWeightKg ? Math.round(kgToLbs(profile.startWeightKg)) : null
    goals.push({
      id: 'weight',
      emoji: '⚖️',
      title: 'Body Weight Goal',
      category: 'Body Composition',
      description: `Reach and maintain ${goalLbs} lbs.`,
      target: `${goalLbs} lbs`,
      relatedMetrics: ['Daily weight', 'Calories', 'Protein intake'],
      getStatus: (d) => {
        const w = d.today.weight
        if (!w) return {
          current: null, progress: 0,
          statusText: 'No weight data — import Apple Health or log your weight daily.',
          nextAction: 'Weigh yourself every morning. Log it via Daily Log.',
        }
        const wLbs = Math.round(kgToLbs(w) * 10) / 10
        const start = startLbs ?? (wLbs + 10)
        const range = start - goalLbs
        const pct   = range > 0 ? Math.max(0, Math.min(100, Math.round((start - wLbs) / range * 100))) : 100
        const diff  = +(wLbs - goalLbs).toFixed(1)
        return {
          current: `${wLbs} lbs`,
          progress: pct,
          statusText: diff <= 0
            ? `At goal weight of ${goalLbs} lbs — great work!`
            : `${diff} lbs above ${goalLbs} lbs goal.`,
          nextAction: diff <= 0
            ? 'Maintain current weight within ±2 lbs by tracking weekly average.'
            : 'Aim for 0.5–1 lb/week change via a moderate calorie adjustment and high protein.',
        }
      },
    })
  }

  if (profile?.goalBodyFatPct) {
    const goalBF  = profile.goalBodyFatPct
    const startBF = profile.startBodyFatPct ?? null
    goals.push({
      id: 'bodyfat',
      emoji: '💪',
      title: 'Body Fat Goal',
      category: 'Body Composition',
      description: `Reach ${goalBF}% body fat while maintaining muscle mass.`,
      target: `≤ ${goalBF}% body fat`,
      relatedMetrics: ['Body fat %', 'Weight', 'Lean mass'],
      getStatus: (d) => {
        const bf = d.today.bodyFatPct
        if (bf == null) return {
          current: null, progress: 0,
          statusText: 'No body fat data — import Apple Health or log manually.',
          nextAction: 'Import Apple Health data with body composition metrics to track body fat.',
        }
        const start = startBF ?? (bf + 5)
        const range = start - goalBF
        const pct   = range > 0 ? Math.max(0, Math.min(100, Math.round((start - bf) / range * 100))) : 100
        const diff  = +(bf - goalBF).toFixed(1)
        return {
          current: `${bf.toFixed(1)}%`,
          progress: pct,
          statusText: diff <= 0
            ? `At or below your ${goalBF}% target — goal reached!`
            : `${diff}% above ${goalBF}% goal. Maintain a moderate calorie deficit and high protein.`,
          nextAction: diff <= 0
            ? 'Maintain current habits and monitor weekly.'
            : 'Track body fat weekly. Focus on calorie deficit and high protein.',
        }
      },
    })
  }

  goals.push({
    id: 'protein',
    emoji: '🥩',
    title: 'Daily Protein',
    category: 'Nutrition',
    description: 'Consistently hit your daily protein target to support muscle building and recovery.',
    target: 'Your protein goal',
    relatedMetrics: ['Protein logged', 'Total calories', 'Meal frequency'],
    getStatus: (d, _p, ng) => {
      const protein = d.today.proteinG
      if (protein == null) return {
        current: null, progress: 0,
        statusText: 'No protein data logged today.',
        nextAction: 'Log your meals via the Nutrition tab or Daily Log to track protein intake.',
      }
      const pct  = Math.min(100, Math.round((protein / ng.proteinG) * 100))
      const diff = ng.proteinG - protein
      return {
        current: `${Math.round(protein)}g`,
        progress: pct,
        statusText: diff <= 0
          ? `Protein goal hit — ${Math.round(protein)}g logged!`
          : `${Math.round(protein)}g of ${ng.proteinG}g target. ${Math.round(diff)}g to go.`,
        nextAction: diff <= 0
          ? 'Strong day. Keep this habit consistent across the week.'
          : `Log meals consistently. A shake (~25g), chicken (~50g), or Greek yogurt (~17g) helps close the gap.`,
      }
    },
  })

  goals.push({
    id: 'activity',
    emoji: '🏃',
    title: 'Daily Activity',
    category: 'Cardio',
    description: 'Build a consistent movement base through daily steps and cardio.',
    target: '10,000 steps / day',
    relatedMetrics: ['Daily steps', 'Active calories', 'Resting HR'],
    getStatus: (d) => {
      const steps = d.today.steps
      if (!steps) return {
        current: null, progress: 0,
        statusText: 'No step data. Import Apple Health to track daily movement.',
        nextAction: 'Connect Apple Health to see your daily steps and cardio activity here.',
      }
      const pct = Math.min(100, Math.round(steps / 10_000 * 100))
      return {
        current: `${steps.toLocaleString()} steps`,
        progress: pct,
        statusText: pct >= 100
          ? `${steps.toLocaleString()} steps — daily goal hit!`
          : `${steps.toLocaleString()} steps so far. ${(10_000 - steps).toLocaleString()} to goal.`,
        nextAction: pct >= 100
          ? 'Strong movement day. Rest or add a light recovery walk.'
          : 'A 25-min walk after dinner adds ~2,500 steps. Aim for consistent daily movement.',
      }
    },
  })

  return goals
}

// ─── Data-driven goal card ────────────────────────────────────────────────────

function GoalCard({ goal, data, profile, nutGoals }: {
  goal: GoalConfig
  data: ReturnType<typeof useDashboardData>
  profile: ProfileData | null
  nutGoals: Pick<NutritionGoals, 'proteinG' | 'calories'>
}) {
  const status = goal.getStatus(data, profile, nutGoals)

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

      <div className="goal-status">{status.statusText}</div>

      <div className="goal-next-action">
        <ArrowRight size={13} />
        <span>{status.nextAction}</span>
      </div>

      <div className="goal-metrics">
        {goal.relatedMetrics.map(m => (
          <span key={m} className="goal-metric-chip">{m}</span>
        ))}
      </div>
    </div>
  )
}

// ─── User-created goal card ───────────────────────────────────────────────────

function UserGoalCard({ goal, onDelete }: { goal: UserGoal; onDelete: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  const daysLeft = goal.targetDate
    ? Math.ceil((new Date(goal.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  const isOverdue = daysLeft != null && daysLeft < 0
  const catLabel = goal.category.charAt(0).toUpperCase() + goal.category.slice(1)

  return (
    <div className={`goal-card goal-card--user ${goal.completed ? 'goal-card--completed' : ''}`}>
      <div className="goal-card-header">
        <span className="goal-emoji">{goal.emoji}</span>
        <div className="goal-header-text">
          <h3 className="goal-title">{goal.title}</h3>
          <span className="goal-category">{catLabel}</span>
        </div>
        <div className="goal-user-actions">
          {!confirmDelete ? (
            <button
              className="goal-delete-btn"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete goal"
            >
              <Trash2 size={14} />
            </button>
          ) : (
            <div className="goal-delete-confirm">
              <button onClick={onDelete} className="goal-delete-confirm-yes">Delete</button>
              <button onClick={() => setConfirmDelete(false)} className="goal-delete-confirm-no">Keep</button>
            </div>
          )}
        </div>
      </div>

      {goal.description && <p className="goal-description">{goal.description}</p>}

      {daysLeft != null && (
        <div className={`goal-deadline ${isOverdue ? 'goal-deadline--overdue' : ''}`}>
          📅 {isOverdue
            ? `${Math.abs(daysLeft)} days overdue`
            : daysLeft === 0 ? 'Due today'
            : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`
          }
        </div>
      )}
    </div>
  )
}

// ─── Add goal modal ───────────────────────────────────────────────────────────

function AddGoalModal({ onSave, onClose }: {
  onSave: (goal: Omit<UserGoal, 'id' | 'createdAt' | 'updatedAt'>) => void
  onClose: () => void
}) {
  const [emoji,       setEmoji]       = useState('🎯')
  const [title,       setTitle]       = useState('')
  const [description, setDescription] = useState('')
  const [category,    setCategory]    = useState<GoalCategory>('milestone')
  const [targetDate,  setTargetDate]  = useState('')

  function applyPreset(p: typeof PRESET_GOALS[0]) {
    setEmoji(p.emoji)
    setTitle(p.title)
    setCategory(p.category)
  }

  function handleSave() {
    const trimmed = title.trim()
    if (!trimmed) return
    onSave({
      emoji,
      title: trimmed,
      description: description.trim() || undefined,
      category,
      targetDate: targetDate || undefined,
    })
  }

  return (
    <div className="goal-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Add a goal">
      <div className="goal-modal" onClick={e => e.stopPropagation()}>
        <div className="goal-modal-header">
          <h2 className="goal-modal-title">Add a Goal</h2>
          <button className="goal-modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="goal-presets">
          <p className="goal-presets-label">Quick add</p>
          <div className="goal-presets-list">
            {PRESET_GOALS.map(p => (
              <button
                key={p.title}
                className={`goal-preset-btn ${title === p.title ? 'goal-preset-btn--active' : ''}`}
                onClick={() => applyPreset(p)}
              >
                {p.emoji} {p.title}
              </button>
            ))}
          </div>
        </div>

        <div className="goal-modal-divider">or write your own</div>

        <div className="goal-form">
          <div className="goal-form-emoji-row">
            <input
              className="goal-emoji-input"
              value={emoji}
              onChange={e => setEmoji(e.target.value.slice(-2) || '🎯')}
              maxLength={4}
              aria-label="Goal emoji"
            />
            <input
              className="goal-title-input"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Goal title (e.g. Run first 5K)"
              aria-label="Goal title"
              autoFocus
            />
          </div>

          <textarea
            className="goal-desc-input"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Description — why this goal matters (optional)"
            rows={2}
            aria-label="Goal description"
          />

          <div className="goal-form-row">
            <select
              className="goal-category-select"
              value={category}
              onChange={e => setCategory(e.target.value as GoalCategory)}
              aria-label="Goal category"
            >
              <option value="strength">💪 Strength</option>
              <option value="weight">⚖️ Weight</option>
              <option value="nutrition">🥗 Nutrition</option>
              <option value="cardio">🏃 Cardio</option>
              <option value="habit">🔄 Habit</option>
              <option value="milestone">🏆 Milestone</option>
            </select>

            <div className="goal-date-wrap">
              <label className="goal-date-label" htmlFor="goal-date">Target date</label>
              <input
                id="goal-date"
                type="date"
                className="goal-date-input"
                value={targetDate}
                onChange={e => setTargetDate(e.target.value)}
                aria-label="Target date (optional)"
              />
            </div>
          </div>

          <button
            className="goal-save-btn"
            onClick={handleSave}
            disabled={!title.trim()}
          >
            Add Goal
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Empty data-driven state ──────────────────────────────────────────────────

function NoGoalsCard({ onSetup }: { onSetup: () => void }) {
  return (
    <div className="goal-empty-card">
      <Target size={32} style={{ opacity: 0.25, marginBottom: 12 }} />
      <p className="goal-empty-title">No profile goals set</p>
      <p className="goal-empty-desc">
        Complete your profile to set a goal weight and body fat target.
        Your progress goals will appear here once configured.
      </p>
      <button className="goal-empty-btn" onClick={onSetup}>Set up profile</button>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AthleticGoals() {
  const navigate = useNavigate()
  const data = useDashboardData()
  const [profile,      setProfile]      = useState<ProfileData | null>(null)
  const [nutGoals,     setNutGoals]     = useState<Pick<NutritionGoals, 'proteinG' | 'calories'>>({ proteinG: 200, calories: 2300 })
  const [userGoals,    setUserGoals]    = useState<UserGoal[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string>('All')

  useEffect(() => {
    getProfile().then(setProfile)
    getSetting<NutritionGoals | null>('nutrition-goals', null).then(ng => {
      if (ng) setNutGoals({ proteinG: ng.proteinG, calories: ng.calories })
    })
    getUserGoals().then(setUserGoals)
  }, [])

  if (data.loading) return <div className="goals-loading">Loading…</div>

  const goalConfigs  = makeGoals(profile)
  const categories   = ['All', ...Array.from(new Set(goalConfigs.map(g => g.category)))]
  const filteredData = activeCategory === 'All'
    ? goalConfigs
    : goalConfigs.filter(g => g.category === activeCategory)

  async function handleAddGoal(goal: Omit<UserGoal, 'id' | 'createdAt' | 'updatedAt'>) {
    const saved = await saveUserGoal(goal)
    setUserGoals(prev => [saved, ...prev])
    setShowAddModal(false)
  }

  async function handleDeleteGoal(id: string) {
    await deleteUserGoal(id)
    setUserGoals(prev => prev.filter(g => g.id !== id))
  }

  return (
    <div className="athletic-goals-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Goals</h1>
          <p className="page-subtitle">Your targets and what to do next</p>
        </div>
        <button
          className="goal-add-btn"
          onClick={() => setShowAddModal(true)}
          aria-label="Add a goal"
        >
          <Plus size={16} />
          Add Goal
        </button>
      </header>

      {/* ── Data-driven progress goals ── */}
      {goalConfigs.length > 0 && (
        <section>
          <h2 className="goals-section-title">Your Progress</h2>

          {categories.length > 2 && (
            <div className="goals-filter">
              {categories.map(c => (
                <button
                  key={c}
                  className={`goals-filter-btn ${activeCategory === c ? 'active' : ''}`}
                  onClick={() => setActiveCategory(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          <div className="goals-grid">
            {filteredData.map(g => (
              <GoalCard key={g.id} goal={g} data={data} profile={profile} nutGoals={nutGoals} />
            ))}
          </div>
        </section>
      )}

      {goalConfigs.length === 0 && userGoals.length === 0 && (
        <NoGoalsCard onSetup={() => navigate('/onboarding?edit=1')} />
      )}

      {/* ── User-created custom goals ── */}
      {userGoals.length > 0 && (
        <section>
          <h2 className="goals-section-title">Your Goals</h2>
          <div className="goals-grid">
            {userGoals.map(g => (
              <UserGoalCard
                key={g.id}
                goal={g}
                onDelete={() => handleDeleteGoal(g.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Add goal hint when list is short ── */}
      {goalConfigs.length > 0 && userGoals.length === 0 && (
        <div className="goal-add-hint">
          <button className="goal-add-hint-btn" onClick={() => setShowAddModal(true)}>
            <Plus size={14} />
            Add a personal goal — marathon, bench 225, sleep 8h…
          </button>
        </div>
      )}

      {/* ── Add goal modal ── */}
      {showAddModal && (
        <AddGoalModal
          onSave={handleAddGoal}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  )
}
