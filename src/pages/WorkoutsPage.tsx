import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  Plus, ChevronDown, ChevronUp, Trash2, Dumbbell,
  Lightbulb, Flame,
  ChevronLeft, ChevronRight, Copy, Clipboard,
  LayoutTemplate, Check, X, AlertTriangle, Play,
} from 'lucide-react'
import ActiveWorkout from './ActiveWorkout'
import {
  saveWorkout, updateWorkout, deleteWorkout, getAllTimePRs, annotateExercises, estimateOneRM,
  getWorkoutsForDate, getWorkoutDateTypes,
  getWorkoutsForWeekDates,
  getLastExercisePerformance, suggestNextWorkingSet,
  WORKOUT_TYPES, CARDIO_SUBTYPES, EXERCISE_LIBRARY, BODY_AREAS,
} from '../db/workoutStore'
import type { ExerciseLastPerf, NextSetSuggestion } from '../db/workoutStore'
import {
  estimateWorkoutCalories, seedExerciseLibraryIfEmpty,
  getAllExerciseNames, capitalizeExerciseName, rememberCustomExercise,
} from '../db/trainingStore'
import { getTemplates, workoutToTemplate } from '../db/templateStore'
import type { WorkoutTemplate } from '../db/templateStore'
import { useWorkoutSuggestion } from '../hooks/useWorkoutSuggestion'
import { getProfile } from '../db/profileStore'
import type { ProfileData } from '../db/profileStore'
import type { WorkoutSession, ExerciseSet, WorkoutExerciseEntry, CardioEntry } from '../db'
import { useScrollLock } from '../hooks/useScrollLock'
import { useSwipeToClose } from '../hooks/useSwipeToClose'
import { localDateStr, addLocalDays, formatDate } from '../data/config'
import DatePickerCalendar from '../components/DatePickerCalendar'
import WorkoutsSubNav from '../components/WorkoutsSubNav'
import WheelPicker from '../components/WheelPicker'
import './WorkoutsPage.css'

const DEFAULT_BODY_WEIGHT_KG = 80  // ~176 lbs fallback when profile has no weight

function todayStr() { return localDateStr() }

// ─── ISO Week helpers ─────────────────────────────────────────────────────────

function getISOWeek(date: Date): { week: number; year: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return {
    week: Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7),
    year: d.getUTCFullYear(),
  }
}

function getWeekDates(isoWeek: number, year: number): string[] {
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const weekStart = new Date(jan4)
  weekStart.setUTCDate(jan4.getUTCDate() - (jan4.getUTCDay() || 7) + 1 + (isoWeek - 1) * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setUTCDate(weekStart.getUTCDate() + i)
    return d.toISOString().split('T')[0]
  })
}

function addWeeks(week: number, year: number, delta: number): { week: number; year: number } {
  const d = new Date(getWeekDates(week, year)[0] + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + delta * 7)
  return getISOWeek(d)
}

const DOW_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function formatWeekLabel(dates: string[]) {
  if (!dates.length) return ''
  const a = new Date(dates[0] + 'T12:00:00')
  const b = new Date(dates[6] + 'T12:00:00')
  const sameMonth = a.getMonth() === b.getMonth()
  return sameMonth
    ? `${MONTH_SHORT[a.getMonth()]} ${a.getDate()}–${b.getDate()}`
    : `${MONTH_SHORT[a.getMonth()]} ${a.getDate()} – ${MONTH_SHORT[b.getMonth()]} ${b.getDate()}`
}

const EQUIPMENT_OPTS = [
  { id: 'barbell',    short: 'Bar'  },
  { id: 'dumbbell',   short: 'DB'   },
  { id: 'machine',    short: 'Mach' },
  { id: 'cable',      short: 'Cable'},
  { id: 'smith',      short: 'Smith'},
  { id: 'bodyweight', short: 'BW'   },
] as const

const FALLBACK_EXERCISE_NAMES = EXERCISE_LIBRARY.map(e => e.name)

// ─── Sub-nav ──────────────────────────────────────────────────────────────────

// ─── Suggestion card ──────────────────────────────────────────────────────────

function SuggestionCard({ onLog }: { onLog: () => void }) {
  const { suggestion, loading } = useWorkoutSuggestion()
  if (loading || !suggestion || suggestion.type === 'rest') return null
  return (
    <div className="ws-suggestion">
      <Lightbulb size={15} className="ws-sugg-icon-luc" />
      <div className="ws-sugg-body">
        <div className="ws-sugg-label">Suggested today</div>
        <div className="ws-sugg-name">{suggestion.name}</div>
        {suggestion.warning && <div className="ws-sugg-warning">⚠️ {suggestion.warning}</div>}
        <div className="ws-sugg-meta">{suggestion.durationMin}min · {suggestion.intensity}</div>
      </div>
      <button className="ws-sugg-log-btn" onClick={onLog}>
        Log it <ChevronRight size={13} />
      </button>
    </div>
  )
}

// ─── Weekly calendar ──────────────────────────────────────────────────────────

interface WeekCalendarProps {
  selectedDate: string
  onSelectDate: (d: string) => void
  copiedWorkout: WorkoutSession | null
  onPasteDay: (date: string) => void
  onMarkRest: (date: string) => void
  refreshKey: number
}

function WeekCalendar({ selectedDate, onSelectDate, copiedWorkout, onPasteDay, onMarkRest, refreshKey }: WeekCalendarProps) {
  const today = todayStr()
  const [weekInfo, setWeekInfo] = useState(() => getISOWeek(new Date()))
  const [weekDates, setWeekDates] = useState<string[]>([])
  const [dayWorkouts, setDayWorkouts] = useState<Map<string, WorkoutSession[]>>(new Map())
  useEffect(() => {
    const dates = getWeekDates(weekInfo.week, weekInfo.year)
    setWeekDates(dates)
    getWorkoutsForWeekDates(dates).then(setDayWorkouts)
  }, [weekInfo, refreshKey])

  function prevWeek() { setWeekInfo(w => addWeeks(w.week, w.year, -1)) }
  function nextWeek() { setWeekInfo(w => addWeeks(w.week, w.year, +1)) }
  function goToday()  { setWeekInfo(getISOWeek(new Date())) }

  function getDotColor(workouts: WorkoutSession[]) {
    if (!workouts.length) return null
    const hasLift   = workouts.some(w => w.type === 'lifting')
    const hasCardio = workouts.some(w => w.type === 'cardio')
    if (hasLift && hasCardio) return 'both'
    if (hasLift)   return 'lift'
    if (hasCardio) return 'cardio'
    return null
  }

  const currentWeek = getISOWeek(new Date())
  const isCurrentWeek = weekInfo.week === currentWeek.week && weekInfo.year === currentWeek.year

  return (
    <div className="week-cal">
      <div className="week-cal-header">
        <button className="week-cal-nav" onClick={prevWeek}><ChevronLeft size={16} /></button>
        <div className="week-cal-label">
          <span className="week-cal-wnum">W{weekInfo.week}</span>
          <span className="week-cal-range">{formatWeekLabel(weekDates)}</span>
        </div>
        {!isCurrentWeek && (
          <button className="week-cal-today" onClick={goToday}>Today</button>
        )}
        <button className="week-cal-nav" onClick={nextWeek}><ChevronRight size={16} /></button>
      </div>

      <div className="week-cal-days">
        {weekDates.map((date, i) => {
          const workouts = dayWorkouts.get(date) ?? []
          const dot = getDotColor(workouts)
          const isToday = date === today
          const isSelected = date === selectedDate
          const d = new Date(date + 'T12:00:00')

          return (
            <div key={date} className="week-cal-day-wrap">
              <button
                className={`week-cal-day ${isToday ? 'week-cal-day--today' : ''} ${isSelected ? 'week-cal-day--selected' : ''} ${dot ? `week-cal-day--has-${dot}` : ''}`}
                onClick={() => onSelectDate(date)}>
                <span className="week-cal-dow">{DOW_SHORT[i]}</span>
                <span className="week-cal-date">{d.getUTCDate()}</span>
                <span className={`week-cal-dot ${dot ? `week-cal-dot--${dot}` : ''}`} />
              </button>
              {isSelected && (
                <div className="week-cal-day-actions">
                  {copiedWorkout && (
                    <button className="wcda-btn wcda-btn--paste" onClick={() => onPasteDay(date)}>
                      <Clipboard size={11} />Paste
                    </button>
                  )}
                  <button className="wcda-btn" onClick={() => onMarkRest(date)}>Rest</button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── SetRow ───────────────────────────────────────────────────────────────────

type ExSet = ExerciseSet & { equipment?: string }

const REPS_VALUES   = Array.from({ length: 31 }, (_, i) => i)                 // 0-30
const WEIGHT_VALUES = Array.from({ length: 201 }, (_, i) => i * 2.5)          // 0-500 in 2.5lb steps

function SetRow({
  idx, set, onChange, onRemove, prMap, exerciseName, defaultEquipment,
}: {
  idx: number; set: ExSet; onChange: (u: ExSet) => void; onRemove: () => void
  prMap: Map<string, number>; exerciseName: string; defaultEquipment?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const e1rm = !set.isWarmup && set.reps > 0 && set.weightLbs > 0
    ? Math.round(set.weightLbs * (1 + set.reps / 30)) : null
  const currentPR = prMap.get(exerciseName) ?? 0
  const isPR = e1rm != null && e1rm > currentPR
  const activeEq = set.equipment ?? defaultEquipment

  return (
    <div className={`set-row-wrap ${set.isWarmup ? 'set-row-wrap--warmup' : ''}`}>
      <div className={`set-row ${isPR ? 'set-row--pr' : ''}`}>
        <button
          className={`set-warmup-btn ${set.isWarmup ? 'set-warmup-btn--on' : ''}`}
          onClick={() => onChange({ ...set, isWarmup: !set.isWarmup })}
          aria-label={set.isWarmup ? 'Unmark warm-up' : 'Mark as warm-up'}
          title="Warm-up set"
        >
          W
        </button>
        <span className="set-num">{idx + 1}</span>
        <button className="set-value-btn" onClick={() => setExpanded(e => !e)}>
          {set.reps || 0}<span className="set-value-unit">reps</span>
        </button>
        <span className="set-x">×</span>
        <button className="set-value-btn" onClick={() => setExpanded(e => !e)}>
          {set.weightLbs || 0}<span className="set-value-unit">lbs</span>
        </button>
        {e1rm && <span className="set-e1rm">{e1rm}lb</span>}
        {isPR && <span className="set-pr-badge">PR!</span>}
        <button className="set-remove" onClick={onRemove} aria-label="Remove set">×</button>
      </div>

      {expanded && (
        <div className="set-expand">
          <div className="set-expand-wheels">
            <div className="set-expand-col">
              <span className="set-expand-label">Reps</span>
              <WheelPicker values={REPS_VALUES} value={set.reps || 0} onChange={v => onChange({ ...set, reps: +v })} itemHeight={32} />
            </div>
            <div className="set-expand-col">
              <span className="set-expand-label">Weight</span>
              <WheelPicker values={WEIGHT_VALUES} value={set.weightLbs || 0} onChange={v => onChange({ ...set, weightLbs: +v })} itemHeight={32} />
            </div>
          </div>
          <div className="set-eq-picker">
            {EQUIPMENT_OPTS.map(opt => (
              <button key={opt.id} title={opt.id}
                className={`set-eq-btn ${activeEq === opt.id ? 'set-eq-btn--on' : ''}`}
                onClick={() => onChange({ ...set, equipment: opt.id })}>{opt.short}</button>
            ))}
          </div>
          <button className="set-expand-done" onClick={() => setExpanded(false)}>Done</button>
        </div>
      )}
    </div>
  )
}

// ─── ExerciseBlock ────────────────────────────────────────────────────────────

type ExEntry = WorkoutExerciseEntry & { equipment?: string }

function ExerciseBlock({
  ex, onChange, onRemove, prMap, exerciseNames, onMoveUp, onMoveDown, canMoveUp, canMoveDown,
}: {
  ex: ExEntry; onChange: (u: ExEntry) => void; onRemove: () => void; prMap: Map<string, number>
  exerciseNames: string[]
  onMoveUp: () => void; onMoveDown: () => void; canMoveUp: boolean; canMoveDown: boolean
}) {
  // Warm-up sets don't count as "working volume" — matches how they're
  // excluded from e1RM/PR and the progressive-overload suggestion.
  const volume = ex.sets.reduce((n, s) => n + (s.isWarmup ? 0 : s.weightLbs * s.reps), 0)
  const [lastPerf, setLastPerf] = useState<ExerciseLastPerf | null>(null)
  const [suggestion, setSuggestion] = useState<NextSetSuggestion | null>(null)

  useEffect(() => {
    if (!ex.name.trim()) { setLastPerf(null); setSuggestion(null); return }
    getLastExercisePerformance(ex.name).then(setLastPerf)
    suggestNextWorkingSet(ex.name, ex.equipment).then(setSuggestion)
  }, [ex.name, ex.equipment])

  function addSet() {
    const last = ex.sets[ex.sets.length - 1]
    onChange({ ...ex, sets: [...ex.sets, { reps: last?.reps ?? 0, weightLbs: last?.weightLbs ?? 0, equipment: (last as ExSet)?.equipment ?? ex.equipment }] })
  }

  function useSuggestion() {
    if (!suggestion) return
    onChange({ ...ex, sets: [...ex.sets, { reps: suggestion.reps, weightLbs: suggestion.weightLbs, equipment: ex.equipment }] })
  }

  function daysAgo(date: string) {
    const diff = Math.round((Date.now() - new Date(date + 'T12:00:00').getTime()) / 86400000)
    if (diff === 0) return 'today'
    if (diff === 1) return 'yesterday'
    return `${diff}d ago`
  }

  return (
    <div className="exercise-block">
      <div className="exercise-block-header">
        <div className="exercise-reorder-col">
          <button className="exercise-reorder-btn" onClick={onMoveUp} disabled={!canMoveUp} aria-label="Move exercise up">
            <ChevronUp size={13} />
          </button>
          <button className="exercise-reorder-btn" onClick={onMoveDown} disabled={!canMoveDown} aria-label="Move exercise down">
            <ChevronDown size={13} />
          </button>
        </div>
        <input list="exercise-datalist" className="exercise-name-input" placeholder="Exercise name"
          value={ex.name}
          onChange={e => onChange({ ...ex, name: e.target.value })}
          onBlur={e => { if (e.target.value.trim()) onChange({ ...ex, name: capitalizeExerciseName(e.target.value) }) }} />
        <datalist id="exercise-datalist">
          {exerciseNames.map(n => <option key={n} value={n} />)}
        </datalist>
        <button className="exercise-remove-btn" onClick={onRemove}>Remove</button>
      </div>

      {lastPerf && (
        <div className="exercise-last-perf">
          <span className="elp-label">Last</span>
          <span className="elp-val">{lastPerf.weight} × {lastPerf.reps}</span>
          <span className="elp-sep">·</span>
          <span className="elp-date">{daysAgo(lastPerf.date)}</span>
          {lastPerf.isAllTimePB && <span className="elp-pb">PB</span>}
        </div>
      )}

      {suggestion && (
        <div className="exercise-suggestion">
          <Lightbulb size={13} className="exercise-suggestion-icon" />
          <span className="exercise-suggestion-text">{suggestion.reason}</span>
          <button className="exercise-suggestion-use" onClick={useSuggestion}>
            Use {suggestion.weightLbs} × {suggestion.reps}
          </button>
        </div>
      )}

      {ex.sets.map((s, i) => (
        <SetRow key={i} idx={i} set={s as ExSet} prMap={prMap} exerciseName={ex.name}
          defaultEquipment={ex.equipment}
          onChange={upd => { const n = [...ex.sets]; n[i] = upd; onChange({ ...ex, sets: n }) }}
          onRemove={() => onChange({ ...ex, sets: ex.sets.filter((_, j) => j !== i) })} />
      ))}
      <div className="exercise-block-footer">
        <button className="add-set-btn" onClick={addSet}>+ Add Set</button>
        {volume > 0 && <span className="exercise-volume">{volume.toLocaleString()} lbs volume</span>}
      </div>
    </div>
  )
}

// ─── Cardio section ───────────────────────────────────────────────────────────

function CardioSection({ entry, onChange }: { entry: Partial<CardioEntry>; onChange: (u: Partial<CardioEntry>) => void }) {
  return (
    <div className="cardio-section">
      <h4 className="cardio-section-title">Cardio Details</h4>
      <div className="cardio-grid">
        <div className="cardio-field">
          <label className="cardio-label">Distance (km)</label>
          <input type="number" inputMode="decimal" className="cardio-input" placeholder="0.0" step={0.1} min={0}
            value={entry.distanceKm ?? ''} onChange={e => onChange({ ...entry, distanceKm: e.target.value ? +e.target.value : undefined })} />
        </div>
        <div className="cardio-field">
          <label className="cardio-label">Avg HR (bpm)</label>
          <input type="number" inputMode="numeric" className="cardio-input" placeholder="—" min={40} max={220}
            value={entry.avgHeartRate ?? ''} onChange={e => onChange({ ...entry, avgHeartRate: e.target.value ? +e.target.value : undefined })} />
        </div>
        <div className="cardio-field">
          <label className="cardio-label">Calories (override)</label>
          <input type="number" inputMode="numeric" className="cardio-input" placeholder="Auto-calculated"
            value={entry.calories ?? ''} onChange={e => onChange({ ...entry, calories: e.target.value ? +e.target.value : undefined })} />
        </div>
        <div className="cardio-field">
          <label className="cardio-label">Source</label>
          <select className="cardio-select" value={entry.source ?? 'Manual'} onChange={e => onChange({ ...entry, source: e.target.value })}>
            <option value="Manual">Manual</option>
            <option value="Apple Health">Apple Health</option>
            <option value="Strava">Strava</option>
            <option value="Mock">[MOCKED]</option>
          </select>
        </div>
      </div>
    </div>
  )
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return createPortal(
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-box" onClick={e => e.stopPropagation()}>
        <AlertTriangle size={20} className="confirm-icon" />
        <p className="confirm-msg">{message}</p>
        <div className="confirm-btns">
          <button className="confirm-cancel" onClick={onCancel}>Cancel</button>
          <button className="confirm-delete" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── WorkoutCard ──────────────────────────────────────────────────────────────

function WorkoutCard({ w, prMap, exerciseNames, onDelete, onCopy }: {
  w: WorkoutSession
  prMap: Map<string, number>
  exerciseNames: string[]
  onDelete: () => void
  onCopy: () => void
}) {
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [exercises, setExercises] = useState<ExEntry[]>(w.exercises)
  const cals  = w.overrideCalories ?? w.estimatedCalories
  const subtype = w.cardioSubtype
  const typeLabel = w.type === 'cardio' && subtype
    ? CARDIO_SUBTYPES.find(s => s.id === subtype)?.label ?? subtype
    : (WORKOUT_TYPES.find(t => t.id === w.type)?.label ?? w.type)
  const hasPR = exercises.some(ex => ex.sets.some(s => {
    if ((s as ExSet).isWarmup || !s.reps || !s.weightLbs) return false
    return estimateOneRM(s.weightLbs, s.reps) > (prMap.get(ex.name) ?? 0)
  }))

  function persist(next: ExEntry[]) {
    setExercises(next)
    annotateExercises(next).then(annotated => updateWorkout(w.id, { exercises: annotated }, { silent: true }))
  }

  return (
    <>
      <div className={`workout-card ${hasPR ? 'workout-card--pr' : ''}`}>
        <div className="workout-card-top" onClick={() => setOpen(o => !o)}>
          <div className="workout-card-left">
            <span className={`workout-type-pill workout-type-pill--${w.type}`}>{typeLabel}</span>
            <div className="workout-card-title">{w.title}</div>
            <div className="workout-card-meta">
              {w.durationMin}min{w.rpe ? ` · RPE ${w.rpe}` : ''}
              {cals ? (
                <span className={`wc-cal wc-cal--${w.caloriesConfidence ?? 'medium'}`}>
                  <Flame size={11} />{cals} kcal{w.caloriesConfidence === 'low' ? ' est.' : ''}
                </span>
              ) : null}
              {hasPR && <span className="workout-pr-badge">🏆 PR</span>}
            </div>
          </div>
          <div className="workout-card-toggle">{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</div>
        </div>

        {open && (
          <div className="workout-card-body">
            {w.bodyAreas?.length ? (
              <div className="workout-areas">{w.bodyAreas.map(a => <span key={a} className="area-chip">{a}</span>)}</div>
            ) : null}
            {w.cardioEntries?.map((c, i) => (
              <div key={i} className="wc-cardio-row">
                <span className="wc-cardio-source">{c.source}</span>
                {c.distanceKm ? <span>{c.distanceKm.toFixed(1)} km</span> : null}
                {c.avgHeartRate ? <span>{c.avgHeartRate} bpm</span> : null}
              </div>
            ))}
            {w.type === 'lifting' && (
              <div className="log-exercises">
                <div className="log-exercises-header">
                  <span className="log-section-title">Exercises</span>
                  <button className="add-exercise-btn"
                    onClick={() => persist([...exercises, { name: '', sets: [{ reps: 0, weightLbs: 0 }], equipment: 'barbell' }])}>
                    + Exercise
                  </button>
                </div>
                {exercises.map((ex, i) => (
                  <ExerciseBlock key={i} ex={ex} prMap={prMap} exerciseNames={exerciseNames}
                    onChange={upd => { const n = [...exercises]; n[i] = upd; persist(n) }}
                    onRemove={() => persist(exercises.filter((_, j) => j !== i))}
                    canMoveUp={i > 0} canMoveDown={i < exercises.length - 1}
                    onMoveUp={() => { const n = [...exercises]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; persist(n) }}
                    onMoveDown={() => { const n = [...exercises]; [n[i], n[i + 1]] = [n[i + 1], n[i]]; persist(n) }} />
                ))}
              </div>
            )}
            {cals && (
              <div className="wc-calories-row">
                <Flame size={13} /><span>{cals} kcal · {w.caloriesSource ?? 'Estimated'}</span>
                {w.caloriesConfidence && (
                  <span className={`wc-cal-badge wc-cal-badge--${w.caloriesConfidence}`}>
                    {w.caloriesConfidence.toUpperCase()}
                  </span>
                )}
              </div>
            )}
            {w.notes && <p className="workout-notes-view">{w.notes}</p>}
            <div className="workout-card-actions">
              <button className="wc-action-btn" onClick={onCopy}><Copy size={13} /> Copy</button>
              <button className="wc-action-btn wc-action-btn--del" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={13} /> Delete
              </button>
            </div>
          </div>
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          message={`Delete "${w.title}"? This cannot be undone.`}
          onConfirm={() => { setConfirmDelete(false); onDelete() }}
          onCancel={() => setConfirmDelete(false)} />
      )}
    </>
  )
}

// ─── LogModal ─────────────────────────────────────────────────────────────────

interface LogModalProps {
  prMap: Map<string, number>
  initialTemplate?: WorkoutTemplate
  prefilledDate?: string
  onClose: () => void
  onSaved: () => void
}

function LogModal({ prMap, initialTemplate, prefilledDate, onClose, onSaved }: LogModalProps) {
  const [primaryType, setPrimaryType] = useState<'lifting' | 'cardio'>('lifting')
  const [cardioSubtype, setCardioSubtype] = useState('running')
  const [title,       setTitle]       = useState(initialTemplate?.name ?? '')
  const [durationMin, setDurationMin] = useState(initialTemplate?.estimatedDurationMin ?? 60)
  const [rpe,         setRpe]         = useState<number | ''>('')
  const [bodyAreas,   setBodyAreas]   = useState<string[]>([])
  const [exercises,   setExercises]   = useState<ExEntry[]>(
    initialTemplate?.exercises?.length
      ? initialTemplate.exercises.map(ex => ({ ...ex, equipment: (ex as ExEntry).equipment ?? 'barbell' }))
      : [{ name: '', sets: [{ reps: 0, weightLbs: 0 }], equipment: 'barbell' }]
  )
  const [cardioEntry, setCardioEntry] = useState<Partial<CardioEntry>>({ source: 'Manual' })
  const [notes, setNotes] = useState(initialTemplate?.notes ?? '')
  const [saving, setSaving] = useState(false)

  useScrollLock()
  const swipe = useSwipeToClose(onClose)

  // Templates
  const [showTemplates, setShowTemplates] = useState(false)
  const [templates,     setTemplates]     = useState<WorkoutTemplate[]>([])
  const [showSaveAsTmpl,setShowSaveAsTmpl]= useState(false)
  const [tmplName,      setTmplName]      = useState('')
  const [tmplSaved,     setTmplSaved]     = useState(false)

  useEffect(() => { getTemplates().then(setTemplates) }, [])

  const [exerciseNames, setExerciseNames] = useState<string[]>(FALLBACK_EXERCISE_NAMES)
  useEffect(() => { getAllExerciseNames().then(setExerciseNames) }, [])

  const [bodyWeightKg, setBodyWeightKg] = useState(DEFAULT_BODY_WEIGHT_KG)
  useEffect(() => {
    getProfile().then(p => {
      if (p?.startWeightKg) setBodyWeightKg(p.startWeightKg)
    })
  }, [])

  const isLifting = primaryType === 'lifting'
  const logType   = isLifting ? 'lifting' : cardioSubtype
  const weightKg  = bodyWeightKg

  const calPreview = estimateWorkoutCalories(logType, durationMin, weightKg, {
    rpe: typeof rpe === 'number' ? rpe : undefined,
    avgHeartRate: cardioEntry.avgHeartRate,
    distanceKm: cardioEntry.distanceKm,
    manualCalories: cardioEntry.calories,
  })

  function applyTemplate(t: WorkoutTemplate) {
    setExercises(t.exercises.map(ex => ({ ...ex, equipment: (ex as ExEntry).equipment ?? 'barbell' })))
    if (t.estimatedDurationMin) setDurationMin(t.estimatedDurationMin)
    if (t.notes && !notes) setNotes(t.notes)
    if (!title) setTitle(t.name)
    setShowTemplates(false)
  }

  async function handleSaveAsTemplate() {
    if (!tmplName.trim()) return
    await workoutToTemplate(tmplName, exercises.filter(ex => ex.name.trim()), {
      notes: notes || undefined,
      estimatedDurationMin: durationMin,
    })
    setTmplSaved(true)
    setShowSaveAsTmpl(false)
    setTimeout(() => setTmplSaved(false), 2500)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const cal = estimateWorkoutCalories(logType, durationMin, weightKg, {
        rpe: typeof rpe === 'number' ? rpe : undefined,
        avgHeartRate: cardioEntry.avgHeartRate,
        distanceKm: cardioEntry.distanceKm,
        manualCalories: cardioEntry.calories,
      })
      const hasCardioData = !isLifting || cardioEntry.distanceKm || cardioEntry.avgHeartRate || cardioEntry.calories
      const cardioEntries: CardioEntry[] = hasCardioData
        ? [{ type: logType, durationMin, source: cardioEntry.source ?? 'Manual', ...cardioEntry } as CardioEntry]
        : []

      const payload = {
        date: prefilledDate ?? todayStr(),
        type: isLifting ? 'lifting' : 'cardio',
        cardioSubtype: isLifting ? undefined : cardioSubtype,
        title: title || (isLifting ? 'Lifting' : (CARDIO_SUBTYPES.find(s => s.id === cardioSubtype)?.label ?? 'Cardio')),
        durationMin,
        rpe: typeof rpe === 'number' ? rpe : undefined,
        bodyAreas: bodyAreas.length ? bodyAreas : undefined,
        exercises: isLifting ? exercises.filter(ex => ex.name.trim()) : [],
        cardioEntries: cardioEntries.length ? cardioEntries : undefined,
        notes: notes || undefined,
        estimatedCalories: cal.calories,
        caloriesCalcMethod: cal.method,
        caloriesConfidence: cal.confidence,
        caloriesSource: cal.source,
      }

      await saveWorkout(payload)
      void Promise.all(payload.exercises.map(ex => rememberCustomExercise(ex.name)))
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="log-modal-overlay" onClick={onClose}>
      <div className="log-modal" onClick={e => e.stopPropagation()} style={swipe.style}>
        <div className="log-modal-header" {...swipe.handlers}>
          <div className="modal-grabber" />
          <h2 className="log-modal-title">Log Workout</h2>
          <button className="log-modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="log-modal-body">
          {/* ── Primary type picker ── */}
          <div className="log-primary-type">
            {(['lifting', 'cardio'] as const).map(t => (
              <button key={t}
                className={`log-type-card ${primaryType === t ? `log-type-card--on log-type-card--${t}` : ''}`}
                onClick={() => setPrimaryType(t)}>
                <span className="log-type-card-icon">{t === 'lifting' ? '🏋️' : '🏃'}</span>
                <span className="log-type-card-label">{t === 'lifting' ? 'Lifting' : 'Cardio'}</span>
                <span className="log-type-card-desc">
                  {t === 'lifting' ? 'Weights, strength, muscle' : 'Running, cycling, sport'}
                </span>
              </button>
            ))}
          </div>

          {/* ── Cardio subtype ── */}
          {!isLifting && (
            <div className="log-subtype-row">
              {CARDIO_SUBTYPES.map(s => (
                <button key={s.id}
                  className={`log-subtype-chip ${cardioSubtype === s.id ? 'log-subtype-chip--on' : ''}`}
                  onClick={() => setCardioSubtype(s.id)}>{s.label}</button>
              ))}
            </div>
          )}

          {/* ── Title ── */}
          <input className="log-title-input" placeholder="Session title (optional)"
            value={title} onChange={e => setTitle(e.target.value)} />

          {/* ── Duration + RPE ── */}
          <div className="log-row">
            <div className="log-field">
              <label className="log-label">Duration (min)</label>
              <input type="number" inputMode="numeric" className="log-num-input" value={durationMin} min={5} max={300} step={5}
                onChange={e => setDurationMin(+e.target.value)} />
            </div>
            <div className="log-field">
              <label className="log-label">RPE (1–10)</label>
              <input type="number" inputMode="numeric" className="log-num-input" value={rpe} min={1} max={10}
                onChange={e => setRpe(e.target.value ? +e.target.value : '')} />
            </div>
          </div>

          {/* ── Body areas (lifting) ── */}
          {isLifting && (
            <div className="log-areas">
              {BODY_AREAS.map(a => (
                <button key={a}
                  className={`area-chip-btn ${bodyAreas.includes(a) ? 'area-chip-btn--on' : ''}`}
                  onClick={() => setBodyAreas(p => p.includes(a) ? p.filter(x => x !== a) : [...p, a])}>
                  {a}
                </button>
              ))}
            </div>
          )}

          {/* ── Cardio details ── */}
          {!isLifting && <CardioSection entry={cardioEntry} onChange={setCardioEntry} />}

          {/* ── Template actions (lifting) ── */}
          {isLifting && (
            <div className="log-tmpl-bar">
              <button className="log-tmpl-btn" onClick={() => setShowTemplates(s => !s)}>
                <LayoutTemplate size={13} />{showTemplates ? 'Hide templates' : 'Load template'}
              </button>
              {exercises.some(ex => ex.name.trim()) && (
                <button className="log-tmpl-btn" onClick={() => setShowSaveAsTmpl(true)}>
                  <Copy size={13} />Save as template
                </button>
              )}
            </div>
          )}

          {showTemplates && templates.length > 0 && (
            <div className="log-template-list">
              {templates.map(t => (
                <button key={t.id} className="log-template-item" onClick={() => applyTemplate(t)}>
                  <span className="log-tmpl-name">{t.name}</span>
                  <span className="log-tmpl-meta">{t.exercises.length} exercises</span>
                </button>
              ))}
            </div>
          )}
          {showTemplates && templates.length === 0 && (
            <p className="log-tmpl-empty">No templates yet. Save a workout as a template after logging it.</p>
          )}

          {showSaveAsTmpl && (
            <div className="log-save-tmpl">
              <input className="log-tmpl-name-input" placeholder="Template name…"
                value={tmplName} onChange={e => setTmplName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveAsTemplate()} />
              <button className="log-tmpl-save-btn" onClick={handleSaveAsTemplate} disabled={!tmplName.trim()}>
                <Check size={14} /> Save
              </button>
              <button className="log-tmpl-cancel-btn" onClick={() => setShowSaveAsTmpl(false)}>×</button>
            </div>
          )}
          {tmplSaved && <div className="log-tmpl-saved"><Check size={13} /> Saved as template!</div>}

          {/* ── Exercises (lifting) ── */}
          {isLifting && (
            <div className="log-exercises">
              <div className="log-exercises-header">
                <span className="log-section-title">Exercises</span>
                <button className="add-exercise-btn"
                  onClick={() => setExercises(p => [...p, { name: '', sets: [{ reps: 0, weightLbs: 0 }], equipment: 'barbell' }])}>
                  + Exercise
                </button>
              </div>
              {exercises.map((ex, i) => (
                <ExerciseBlock key={i} ex={ex} prMap={prMap} exerciseNames={exerciseNames}
                  onChange={upd => { const n = [...exercises]; n[i] = upd; setExercises(n) }}
                  onRemove={() => setExercises(p => p.filter((_, j) => j !== i))}
                  canMoveUp={i > 0} canMoveDown={i < exercises.length - 1}
                  onMoveUp={() => setExercises(p => {
                    const n = [...p]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n
                  })}
                  onMoveDown={() => setExercises(p => {
                    const n = [...p]; [n[i], n[i + 1]] = [n[i + 1], n[i]]; return n
                  })} />
              ))}
            </div>
          )}

          {/* ── Notes ── */}
          <textarea className="log-notes" placeholder="Notes (optional)…" value={notes} rows={2}
            onChange={e => setNotes(e.target.value)} />

          {/* ── Calorie preview ── */}
          <div className={`log-cal-preview log-cal-preview--${calPreview.confidence}`}>
            <Flame size={13} />
            <span><strong>{calPreview.calories} kcal</strong></span>
            <span className="log-cal-label">{calPreview.label}</span>
            <span className="log-cal-conf">{calPreview.confidence} confidence · {calPreview.source}</span>
          </div>
        </div>

        <div className="log-modal-footer">
          <button className="log-modal-save" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Workout'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── Template picker (quick-start "+ Template" from the Today page) ──────────

function TemplatePickerSheet({ onPick, onClose }: { onPick: (t: WorkoutTemplate) => void; onClose: () => void }) {
  const [templates, setTemplates] = useState<WorkoutTemplate[] | null>(null)
  useScrollLock()
  const swipe = useSwipeToClose(onClose)

  useEffect(() => { getTemplates().then(setTemplates) }, [])

  return createPortal(
    <div className="aw-picker-overlay" onClick={onClose}>
      <div className="aw-picker" onClick={e => e.stopPropagation()} style={swipe.style}>
        <div className="aw-picker-search" {...swipe.handlers}>
          <span className="log-section-title">Choose a template</span>
          <button className="aw-picker-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="aw-picker-list">
          {templates === null ? (
            <p className="log-tmpl-empty">Loading…</p>
          ) : templates.length === 0 ? (
            <p className="log-tmpl-empty">No templates yet — create one in Templates first.</p>
          ) : (
            templates.map(t => (
              <button key={t.id} className="aw-picker-item" onClick={() => onPick(t)}>
                {t.name}
                <span className="log-tmpl-meta" style={{ marginLeft: 8 }}>{t.exercises.length} exercises</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WorkoutsPage() {
  const navigate = useNavigate()
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [dayWorkouts,  setDayWorkouts]  = useState<WorkoutSession[]>([])
  const [prMap,        setPrMap]        = useState<Map<string, number>>(new Map())
  const [exerciseNames, setExerciseNames] = useState<string[]>(FALLBACK_EXERCISE_NAMES)
  const [workoutDateTypes, setWorkoutDateTypes] = useState<Map<string, 'lift' | 'cardio' | 'both'>>(new Map())
  const [loaded,       setLoaded]       = useState(false)
  const [showModal,    setShowModal]    = useState(false)
  const [showActiveWorkout, setShowActiveWorkout] = useState(false)
  const [copiedWorkout, setCopiedWorkout]  = useState<WorkoutSession | null>(null)
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [calendarKey,   setCalendarKey]   = useState(0)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [templateToLog, setTemplateToLog] = useState<WorkoutTemplate | null>(null)
  const seeded = useRef(false)

  const loadDay = useCallback(async (date: string) => {
    const [day, prs, dateTypes] = await Promise.all([
      getWorkoutsForDate(date),
      getAllTimePRs(),
      getWorkoutDateTypes(400),
    ])
    setDayWorkouts(day)
    setPrMap(prs)
    setWorkoutDateTypes(dateTypes)
    setLoaded(true)
  }, [])

  useEffect(() => {
    loadDay(selectedDate)
    if (!seeded.current) { seeded.current = true; seedExerciseLibraryIfEmpty() }
  }, [loadDay, selectedDate])

  useEffect(() => { getProfile().then(setProfile) }, [])
  useEffect(() => { getAllExerciseNames().then(setExerciseNames) }, [])

  function refreshCalendar() { setCalendarKey(k => k + 1) }

  async function handlePasteDay(date: string) {
    if (!copiedWorkout) return
    await saveWorkout({ ...copiedWorkout, date, id: undefined as unknown as string } as Parameters<typeof saveWorkout>[0])
    refreshCalendar()
    if (date === selectedDate) loadDay(date)
    else setSelectedDate(date)
  }

  async function handleMarkRest(date: string) {
    await saveWorkout({ date, type: 'cardio', title: 'Rest Day', durationMin: 0, exercises: [], cardioEntries: [] })
    refreshCalendar()
    if (date === selectedDate) loadDay(date)
  }

  function handleCopy(w: WorkoutSession) { setCopiedWorkout(w) }

  async function handleDelete(id: string) {
    await deleteWorkout(id)
    refreshCalendar()
    loadDay(selectedDate)
  }

  const selectedDateObj = new Date(selectedDate + 'T12:00:00')
  const dateLabel = formatDate(selectedDateObj)
  const dateLabelShort = selectedDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const isToday = selectedDate === todayStr()
  const canGoForward = selectedDate < todayStr()
  const markedWorkoutDates = new Set(workoutDateTypes.keys())
  const dotColorFor: Record<'lift' | 'cardio' | 'both', string> = {
    lift: 'var(--green)',
    cardio: 'var(--blue)',
    both: 'linear-gradient(90deg, var(--green) 50%, var(--blue) 50%)',
  }

  return (
    <div className="workouts-page">
      <WorkoutsSubNav />

      {showActiveWorkout ? (
        <ActiveWorkout
          prMap={prMap}
          profile={profile}
          onFinish={session => {
            void session
            setShowActiveWorkout(false)
            loadDay(selectedDate)
            refreshCalendar()
          }}
          onClose={() => setShowActiveWorkout(false)}
        />
      ) : (
        <>
          <header className="page-header" style={{ marginTop: '8px' }}>
            <div>
              <h1 className="page-title">{isToday ? 'Today' : dateLabel}</h1>
              {isToday && <p className="page-subtitle">{dateLabel}</p>}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button className="start-workout-btn" onClick={() => setShowActiveWorkout(true)}>
                <Play size={15} /> Start
              </button>
              <button className="log-workout-btn" onClick={() => setShowModal(true)}>
                <Plus size={16} /> Log
              </button>
              <button className="log-workout-btn" onClick={() => setShowTemplatePicker(true)}>
                <LayoutTemplate size={15} /> Template
              </button>
            </div>
          </header>

          <div className="wk-date-nav">
            <button className="wk-date-nav-btn" onClick={() => setSelectedDate(d => addLocalDays(d, -1))} aria-label="Previous day">
              <ChevronLeft size={16} />
            </button>
            <button className="wk-date-nav-label" onClick={() => setShowDatePicker(true)}>
              {isToday ? 'Today' : dateLabelShort}
            </button>
            <button className="wk-date-nav-btn" onClick={() => setSelectedDate(d => addLocalDays(d, 1))} disabled={!canGoForward} aria-label="Next day">
              <ChevronRight size={16} />
            </button>
            {!isToday && (
              <button className="wk-date-nav-today" onClick={() => setSelectedDate(todayStr())}>Jump to Today</button>
            )}
          </div>

          {showDatePicker && (
            <DatePickerCalendar
              value={selectedDate}
              markedDates={markedWorkoutDates}
              maxDate={todayStr()}
              onChange={setSelectedDate}
              onClose={() => setShowDatePicker(false)}
              dotBackground={date => {
                const t = workoutDateTypes.get(date)
                return t ? dotColorFor[t] : undefined
              }}
            />
          )}

          {loaded && markedWorkoutDates.size === 0 ? (
            <div className="workouts-first-empty">
              <div className="workouts-first-empty-icon">
                <Dumbbell size={44} />
              </div>
              <h2 className="workouts-first-empty-title">Your training log starts here</h2>
              <p className="workouts-first-empty-desc">
                Log your first session to start tracking strength, cardio, and personal records.
                Every workout is saved and your history builds automatically.
              </p>
              <button
                className="workouts-first-empty-cta"
                onClick={() => setShowModal(true)}
              >
                Log Workout
              </button>
              <button
                className="workouts-first-empty-secondary"
                onClick={() => navigate('/workouts/templates')}
              >
                Create Workout Template
              </button>
            </div>
          ) : (
            <>
              {isToday && <SuggestionCard onLog={() => setShowModal(true)} />}

              {copiedWorkout && (
                <div className="copy-banner">
                  <Clipboard size={13} />
                  <span>Workout copied: <strong>{copiedWorkout.title}</strong> — select a day and tap Paste</span>
                  <button onClick={() => setCopiedWorkout(null)}><X size={13} /></button>
                </div>
              )}

              <WeekCalendar
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
                copiedWorkout={copiedWorkout}
                onPasteDay={handlePasteDay}
                onMarkRest={handleMarkRest}
                refreshKey={calendarKey}
              />

              {/* Selected day */}
              <div className="day-section">
                <div className="day-section-header">
                  <h2 className="workouts-section-title">Sessions</h2>
                </div>

                {dayWorkouts.length > 0 ? (
                  dayWorkouts.map(w => (
                    <WorkoutCard key={w.id} w={w} prMap={prMap} exerciseNames={exerciseNames}
                      onDelete={() => handleDelete(w.id)}
                      onCopy={() => handleCopy(w)} />
                  ))
                ) : (
                  <div className="workouts-empty-today">
                    <span>{isToday ? 'No workout logged today.' : 'No workouts on this day.'}</span>
                    <button onClick={() => setShowModal(true)}>Log one →</button>
                  </div>
                )}
              </div>
            </>
          )}

          {(showModal || templateToLog) && (
            <LogModal
              prMap={prMap}
              initialTemplate={templateToLog ?? undefined}
              prefilledDate={selectedDate}
              onClose={() => { setShowModal(false); setTemplateToLog(null) }}
              onSaved={() => { loadDay(selectedDate); refreshCalendar() }} />
          )}

          {showTemplatePicker && (
            <TemplatePickerSheet
              onPick={t => { setShowTemplatePicker(false); setTemplateToLog(t) }}
              onClose={() => setShowTemplatePicker(false)}
            />
          )}
        </>
      )}
    </div>
  )
}
