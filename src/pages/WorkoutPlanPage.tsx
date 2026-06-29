import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { RefreshCw, Check, Calendar, ChevronDown, ChevronUp, Dumbbell, BookOpen, TrendingUp, CalendarDays, Clock, LayoutTemplate } from 'lucide-react'
import {
  getTrainingProfile, saveTrainingProfile, generateWeeklyPlan,
  saveWorkoutPlan, getActivePlan,
} from '../db/trainingStore'
import type { TrainingProfile, WorkoutPlan } from '../db/trainingStore'
import './WorkoutPlanPage.css'

const GOAL_OPTIONS = [
  { id: 'visible-abs',   label: 'Visible Abs',       emoji: '🔥' },
  { id: 'vertical-jump', label: 'Vertical Jump',      emoji: '⬆️' },
  { id: 'dunk',          label: 'Dunk a Basketball',  emoji: '🏀' },
  { id: 'strength',      label: 'Max Strength',       emoji: '💪' },
  { id: 'muscle-gain',   label: 'Muscle Gain',        emoji: '📈' },
  { id: 'running-endurance', label: 'Run Endurance',  emoji: '🏃' },
  { id: 'pull-ups',      label: 'Pull-up PRs',        emoji: '🧗' },
  { id: 'shoulders-arms',label: 'Shoulders & Arms',   emoji: '💎' },
  { id: 'general-health',label: 'General Health',     emoji: '❤️' },
]

const EQUIPMENT_OPTIONS = [
  { id: 'barbell',     label: 'Barbell' },
  { id: 'dumbbell',    label: 'Dumbbells' },
  { id: 'machine',     label: 'Machines' },
  { id: 'smith',       label: 'Smith Machine' },
  { id: 'cable',       label: 'Cable Station' },
  { id: 'bodyweight',  label: 'Bodyweight' },
]

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const INTENSITY_COLOR: Record<string, string> = {
  low: 'var(--green)', moderate: 'var(--blue)', high: 'var(--orange)',
}

function SubNav() {
  return (
    <nav className="workouts-subnav">
      <NavLink to="/workouts" end className={({ isActive }) => `wsn-item ${isActive ? 'wsn-item--active' : ''}`}>
        <Dumbbell size={14} /><span>Today</span>
      </NavLink>
      <NavLink to="/workouts/plan" className={({ isActive }) => `wsn-item ${isActive ? 'wsn-item--active' : ''}`}>
        <CalendarDays size={14} /><span>Plan</span>
      </NavLink>
      <NavLink to="/workouts/history" className={({ isActive }) => `wsn-item ${isActive ? 'wsn-item--active' : ''}`}>
        <Clock size={14} /><span>History</span>
      </NavLink>
      <NavLink to="/workouts/progress" className={({ isActive }) => `wsn-item ${isActive ? 'wsn-item--active' : ''}`}>
        <TrendingUp size={14} /><span>Progress</span>
      </NavLink>
      <NavLink to="/workouts/templates" className={({ isActive }) => `wsn-item ${isActive ? 'wsn-item--active' : ''}`}>
        <LayoutTemplate size={14} /><span>Templates</span>
      </NavLink>
      <NavLink to="/workouts/library" className={({ isActive }) => `wsn-item ${isActive ? 'wsn-item--active' : ''}`}>
        <BookOpen size={14} /><span>Library</span>
      </NavLink>
    </nav>
  )
}

function PlanDayCard({ day }: { day: WorkoutPlan['days'][0] }) {
  const [open, setOpen] = useState(false)
  const isRest = day.type === 'rest' || day.type === 'active-recovery'

  return (
    <div className={`plan-day-card ${isRest ? 'plan-day-card--rest' : ''}`}>
      <div className="plan-day-card-top" onClick={() => !isRest && setOpen(o => !o)}>
        <div className="plan-day-dow">{DOW_LABELS[day.dayOfWeek]}</div>
        <div className="plan-day-info">
          <span className={`plan-day-type plan-day-type--${day.type}`}>{day.type.replace('-', ' ')}</span>
          <span className="plan-day-name">{day.name}</span>
          {!isRest && (
            <span className="plan-day-meta" style={{ color: INTENSITY_COLOR[day.intensity] }}>
              {day.durationMin}min · {day.intensity}
            </span>
          )}
        </div>
        {!isRest && (
          <div className="plan-day-toggle">{open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</div>
        )}
      </div>

      {open && !isRest && (
        <div className="plan-day-body">
          <p className="plan-day-rationale">{day.rationale}</p>
          <div className="plan-exercises">
            {day.exercises.map((ex, i) => (
              <div key={i} className="plan-exercise-row">
                <span className="plan-ex-name">{ex.name}</span>
                <span className="plan-ex-volume">{ex.sets}×{ex.reps}</span>
                {ex.equipment && <span className="plan-ex-eq">{ex.equipment}</span>}
                {ex.notes && <span className="plan-ex-notes">{ex.notes}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function WorkoutPlanPage() {
  const [profile,  setProfile]  = useState<TrainingProfile | null>(null)
  const [plan,     setPlan]     = useState<WorkoutPlan | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)

  // Form state
  const [goals,        setGoals]        = useState<string[]>(['general-health'])
  const [daysPerWeek,  setDaysPerWeek]  = useState(4)
  const [preferredDays,setPreferredDays]= useState<string[]>(['monday','wednesday','friday','saturday'])
  const [minutesPer,   setMinutesPer]   = useState(60)
  const [equipment,    setEquipment]    = useState<string[]>(['barbell','dumbbell','machine','cable','bodyweight'])
  const [preference,   setPreference]   = useState<TrainingProfile['trainingPreference']>('lifting')
  const [phase,        setPhase]        = useState<TrainingProfile['currentPhase']>('maintenance')
  const [restPref,     setRestPref]     = useState<TrainingProfile['restDayPreference']>('auto')

  useEffect(() => {
    Promise.all([getTrainingProfile(), getActivePlan()]).then(([p, pl]) => {
      if (p) {
        setProfile(p)
        setGoals(p.goals)
        setDaysPerWeek(p.daysPerWeek)
        setPreferredDays(p.preferredDays)
        setMinutesPer(p.minutesPerWorkout)
        setEquipment(p.equipment)
        setPreference(p.trainingPreference)
        setPhase(p.currentPhase)
        setRestPref(p.restDayPreference)
      } else {
        setShowForm(true)
      }
      if (pl) setPlan(pl)
    })
  }, [])

  function toggleGoal(id: string) {
    setGoals(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id])
  }
  function toggleEquip(id: string) {
    setEquipment(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id])
  }
  function toggleDay(d: string) {
    setPreferredDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])
  }

  async function handleGeneratePlan() {
    setSaving(true)
    try {
      const profileData = {
        goals, daysPerWeek, preferredDays, minutesPerWorkout: minutesPer,
        equipment, trainingPreference: preference, currentPhase: phase, restDayPreference: restPref,
      }
      const savedProfile = await saveTrainingProfile(profileData)
      setProfile(savedProfile)
      const newPlan = generateWeeklyPlan(savedProfile)
      await saveWorkoutPlan(newPlan)
      setPlan(newPlan)
      setShowForm(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="workout-plan-page">
      <SubNav />

      <header className="page-header">
        <div>
          <h1 className="page-title">Training Plan</h1>
          <p className="page-subtitle">
            {profile ? `${profile.daysPerWeek} days/week · ${profile.goals.map(g => GOAL_OPTIONS.find(o => o.id === g)?.label ?? g).join(', ')}` : 'Set up your training profile'}
          </p>
        </div>
        {profile && !showForm && (
          <button className="wpp-btn-outline" onClick={() => setShowForm(true)}>
            <RefreshCw size={14} /> Edit
          </button>
        )}
      </header>

      {saved && (
        <div className="wpp-saved-banner">
          <Check size={14} /> Plan generated and saved!
        </div>
      )}

      {/* Training profile form */}
      {showForm && (
        <div className="wpp-form">
          <section className="wpp-section">
            <h3 className="wpp-section-title">Main Goals</h3>
            <p className="wpp-section-hint">Pick what you're training toward (select all that apply)</p>
            <div className="wpp-goal-grid">
              {GOAL_OPTIONS.map(g => (
                <button key={g.id}
                  className={`wpp-goal-btn ${goals.includes(g.id) ? 'wpp-goal-btn--on' : ''}`}
                  onClick={() => toggleGoal(g.id)}>
                  <span className="wpp-goal-emoji">{g.emoji}</span>
                  <span className="wpp-goal-label">{g.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="wpp-section">
            <h3 className="wpp-section-title">Weekly Schedule</h3>
            <div className="wpp-row">
              <div className="wpp-field">
                <label className="wpp-label">Days per week</label>
                <div className="wpp-days-btns">
                  {[2,3,4,5,6].map(n => (
                    <button key={n}
                      className={`wpp-num-btn ${daysPerWeek === n ? 'wpp-num-btn--on' : ''}`}
                      onClick={() => setDaysPerWeek(n)}>{n}</button>
                  ))}
                </div>
              </div>
              <div className="wpp-field">
                <label className="wpp-label">Minutes per session</label>
                <div className="wpp-days-btns">
                  {[30,45,60,75,90].map(n => (
                    <button key={n}
                      className={`wpp-num-btn ${minutesPer === n ? 'wpp-num-btn--on' : ''}`}
                      onClick={() => setMinutesPer(n)}>{n}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="wpp-field" style={{ marginTop: 12 }}>
              <label className="wpp-label">Preferred training days</label>
              <div className="wpp-day-chips">
                {DAY_NAMES.map(d => {
                  const key = d.toLowerCase()
                  return (
                    <button key={key}
                      className={`wpp-day-chip ${preferredDays.includes(key) ? 'wpp-day-chip--on' : ''}`}
                      onClick={() => toggleDay(key)}>{d.slice(0, 3)}</button>
                  )
                })}
              </div>
            </div>
          </section>

          <section className="wpp-section">
            <h3 className="wpp-section-title">Equipment Available</h3>
            <div className="wpp-equip-list">
              {EQUIPMENT_OPTIONS.map(e => (
                <button key={e.id}
                  className={`wpp-equip-btn ${equipment.includes(e.id) ? 'wpp-equip-btn--on' : ''}`}
                  onClick={() => toggleEquip(e.id)}>{e.label}</button>
              ))}
            </div>
          </section>

          <section className="wpp-section">
            <h3 className="wpp-section-title">Preferences</h3>
            <div className="wpp-row">
              <div className="wpp-field">
                <label className="wpp-label">Training style</label>
                <select className="wpp-select" value={preference} onChange={e => setPreference(e.target.value as TrainingProfile['trainingPreference'])}>
                  <option value="lifting">Lifting-focused</option>
                  <option value="athletic">Athletic / Power</option>
                  <option value="cardio">Cardio-focused</option>
                  <option value="balanced">Balanced</option>
                </select>
              </div>
              <div className="wpp-field">
                <label className="wpp-label">Current phase</label>
                <select className="wpp-select" value={phase} onChange={e => setPhase(e.target.value as TrainingProfile['currentPhase'])}>
                  <option value="cutting">Cut (lose fat)</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="gaining">Gain (muscle)</option>
                  <option value="performance">Performance</option>
                </select>
              </div>
            </div>
            <div className="wpp-field" style={{ marginTop: 12 }}>
              <label className="wpp-label">Rest day preference</label>
              <div className="wpp-day-chips">
                {(['auto','fixed','minimal','recovery'] as const).map(r => (
                  <button key={r}
                    className={`wpp-day-chip ${restPref === r ? 'wpp-day-chip--on' : ''}`}
                    onClick={() => setRestPref(r)}>{r}</button>
                ))}
              </div>
            </div>
          </section>

          <div className="wpp-actions">
            {profile && <button className="wpp-btn-outline" onClick={() => setShowForm(false)}>Cancel</button>}
            <button className="wpp-btn-primary" onClick={handleGeneratePlan} disabled={saving || goals.length === 0}>
              <Calendar size={15} />
              {saving ? 'Generating…' : plan ? 'Regenerate Plan' : 'Generate Plan'}
            </button>
          </div>
        </div>
      )}

      {/* Active plan */}
      {plan && !showForm && (
        <div className="wpp-plan">
          <div className="wpp-plan-header">
            <div>
              <div className="wpp-plan-title">This Week's Plan</div>
              <div className="wpp-plan-subtitle">Week of {plan.weekStartDate}</div>
            </div>
            <button className="wpp-btn-outline" onClick={handleGeneratePlan} disabled={saving}>
              <RefreshCw size={13} /> {saving ? '…' : 'Regenerate'}
            </button>
          </div>
          <div className="wpp-days">
            {plan.days.map((d, i) => <PlanDayCard key={i} day={d} />)}
          </div>
        </div>
      )}

      {!plan && !showForm && profile && (
        <div className="wpp-empty">
          <span>No plan generated yet.</span>
          <button className="wpp-btn-primary" onClick={() => setShowForm(true)}>
            <Calendar size={15} /> Create Plan
          </button>
        </div>
      )}
    </div>
  )
}
