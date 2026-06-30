import { useState, useEffect, useCallback, useRef } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  Plus, ChevronDown, ChevronUp, Trash2, Dumbbell,
  BookOpen, TrendingUp, CalendarDays, Lightbulb, Flame,
  ChevronLeft, ChevronRight, Copy, Clipboard, Pencil,
  LayoutTemplate, Check, X, AlertTriangle, Clock, Play,
} from 'lucide-react'
import ActiveWorkout from './ActiveWorkout'
import {
  saveWorkout, updateWorkout, deleteWorkout, getAllTimePRs,
  getWorkoutsForDate, getWorkoutDates,
  getWorkoutsForWeekDates,
  getLastExercisePerformance,
  WORKOUT_TYPES, CARDIO_SUBTYPES, EXERCISE_LIBRARY, BODY_AREAS,
} from '../db/workoutStore'
import type { ExerciseLastPerf } from '../db/workoutStore'
import { estimateWorkoutCalories, seedExerciseLibraryIfEmpty } from '../db/trainingStore'
import { getTemplates, workoutToTemplate } from '../db/templateStore'
import type { WorkoutTemplate } from '../db/templateStore'
import { useWorkoutSuggestion } from '../hooks/useWorkoutSuggestion'
import { getProfile } from '../db/profileStore'
import type { ProfileData } from '../db/profileStore'
import type { WorkoutSession, ExerciseSet, WorkoutExerciseEntry, CardioEntry } from '../db'
import './WorkoutsPage.css'

const DEFAULT_BODY_WEIGHT_KG = 80  // ~176 lbs fallback when profile has no weight

function todayStr() { return new Date().toISOString().split('T')[0] }

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

const ALL_EXERCISE_NAMES = EXERCISE_LIBRARY.map(e => e.name)

// ─── Sub-nav ──────────────────────────────────────────────────────────────────

function WorkoutsSubNav() {
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

function SetRow({
  idx, set, onChange, onRemove, prMap, exerciseName, defaultEquipment,
}: {
  idx: number; set: ExSet; onChange: (u: ExSet) => void; onRemove: () => void
  prMap: Map<string, number>; exerciseName: string; defaultEquipment?: string
}) {
  const e1rm = set.reps > 0 && set.weightLbs > 0
    ? Math.round(set.weightLbs * (1 + set.reps / 30)) : null
  const currentPR = prMap.get(exerciseName) ?? 0
  const isPR = e1rm != null && e1rm > currentPR && set.reps > 0 && set.weightLbs > 0
  const activeEq = set.equipment ?? defaultEquipment

  return (
    <div className={`set-row ${isPR ? 'set-row--pr' : ''}`}>
      <span className="set-num">{idx + 1}</span>
      <input type="number" className="set-input" placeholder="Reps" value={set.reps || ''} min={0} max={999}
        onChange={e => onChange({ ...set, reps: +e.target.value })} />
      <input type="number" className="set-input" placeholder="lbs" value={set.weightLbs || ''} min={0} step={5}
        onChange={e => onChange({ ...set, weightLbs: +e.target.value })} />
      <div className="set-eq-picker">
        {EQUIPMENT_OPTS.map(opt => (
          <button key={opt.id} title={opt.id}
            className={`set-eq-btn ${activeEq === opt.id ? 'set-eq-btn--on' : ''}`}
            onClick={() => onChange({ ...set, equipment: opt.id })}>{opt.short}</button>
        ))}
      </div>
      {e1rm && <span className="set-e1rm">{e1rm}lb</span>}
      {isPR && <span className="set-pr-badge">PR!</span>}
      <button className="set-remove" onClick={onRemove}>×</button>
    </div>
  )
}

// ─── ExerciseBlock ────────────────────────────────────────────────────────────

type ExEntry = WorkoutExerciseEntry & { equipment?: string }

function ExerciseBlock({ ex, onChange, onRemove, prMap }: {
  ex: ExEntry; onChange: (u: ExEntry) => void; onRemove: () => void; prMap: Map<string, number>
}) {
  const volume = ex.sets.reduce((n, s) => n + s.weightLbs * s.reps, 0)
  const [lastPerf, setLastPerf] = useState<ExerciseLastPerf | null>(null)

  useEffect(() => {
    if (!ex.name.trim()) { setLastPerf(null); return }
    getLastExercisePerformance(ex.name).then(setLastPerf)
  }, [ex.name])

  function addSet() {
    const last = ex.sets[ex.sets.length - 1]
    onChange({ ...ex, sets: [...ex.sets, { reps: last?.reps ?? 0, weightLbs: last?.weightLbs ?? 0, equipment: (last as ExSet)?.equipment ?? ex.equipment }] })
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
        <input list="exercise-datalist" className="exercise-name-input" placeholder="Exercise name"
          value={ex.name} onChange={e => onChange({ ...ex, name: e.target.value })} />
        <datalist id="exercise-datalist">
          {ALL_EXERCISE_NAMES.map(n => <option key={n} value={n} />)}
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
          <span className="elp-sep">·</span>
          <span className="elp-suggest">Try {lastPerf.suggestedWeight} lbs</span>
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
          <input type="number" className="cardio-input" placeholder="0.0" step={0.1} min={0}
            value={entry.distanceKm ?? ''} onChange={e => onChange({ ...entry, distanceKm: e.target.value ? +e.target.value : undefined })} />
        </div>
        <div className="cardio-field">
          <label className="cardio-label">Avg HR (bpm)</label>
          <input type="number" className="cardio-input" placeholder="—" min={40} max={220}
            value={entry.avgHeartRate ?? ''} onChange={e => onChange({ ...entry, avgHeartRate: e.target.value ? +e.target.value : undefined })} />
        </div>
        <div className="cardio-field">
          <label className="cardio-label">Calories (override)</label>
          <input type="number" className="cardio-input" placeholder="Auto-calculated"
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
  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-box" onClick={e => e.stopPropagation()}>
        <AlertTriangle size={20} className="confirm-icon" />
        <p className="confirm-msg">{message}</p>
        <div className="confirm-btns">
          <button className="confirm-cancel" onClick={onCancel}>Cancel</button>
          <button className="confirm-delete" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  )
}

// ─── WorkoutCard ──────────────────────────────────────────────────────────────

function WorkoutCard({ w, onDelete, onEdit, onCopy }: {
  w: WorkoutSession
  onDelete: () => void
  onEdit: () => void
  onCopy: () => void
}) {
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const hasPR = w.exercises.some(ex => ex.sets.some(s => s.isPR))
  const cals  = w.overrideCalories ?? w.estimatedCalories
  const subtype = w.cardioSubtype
  const typeLabel = w.type === 'cardio' && subtype
    ? CARDIO_SUBTYPES.find(s => s.id === subtype)?.label ?? subtype
    : (WORKOUT_TYPES.find(t => t.id === w.type)?.label ?? w.type)

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
            {w.exercises.map((ex, ei) => (
              <div key={ei} className="workout-exercise-view">
                <div className="wev-name">{ex.name}</div>
                {ex.sets.map((s, si) => (
                  <div key={si} className={`wev-set ${s.isPR ? 'wev-set--pr' : ''}`}>
                    <span className="wev-set-num">{si + 1}</span>
                    <span>{s.reps} × {s.weightLbs} lbs</span>
                    {(s as ExSet).equipment && <span className="wev-eq">{(s as ExSet).equipment}</span>}
                    {s.e1rm ? <span className="wev-e1rm">{s.e1rm}lb e1RM</span> : null}
                    {s.isPR && <span className="wev-pr">PR</span>}
                  </div>
                ))}
              </div>
            ))}
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
              <button className="wc-action-btn" onClick={onEdit}><Pencil size={13} /> Edit</button>
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
  initialWorkout?: WorkoutSession
  prefilledDate?: string
  onClose: () => void
  onSaved: () => void
}

function LogModal({ prMap, initialWorkout, prefilledDate, onClose, onSaved }: LogModalProps) {
  const [primaryType, setPrimaryType] = useState<'lifting' | 'cardio'>(
    initialWorkout ? (initialWorkout.type === 'lifting' ? 'lifting' : 'cardio') : 'lifting'
  )
  const [cardioSubtype, setCardioSubtype] = useState(
    // Use stored cardioSubtype if present; fall back to type field for legacy workouts (pre-v5 stored subtype as type)
    initialWorkout?.cardioSubtype
      ?? (initialWorkout?.type && initialWorkout.type !== 'lifting' && initialWorkout.type !== 'cardio'
          ? initialWorkout.type
          : 'running')
  )
  const [title,       setTitle]       = useState(initialWorkout?.title ?? '')
  const [durationMin, setDurationMin] = useState(initialWorkout?.durationMin ?? 60)
  const [rpe,         setRpe]         = useState<number | ''>(initialWorkout?.rpe ?? '')
  const [bodyAreas,   setBodyAreas]   = useState<string[]>(initialWorkout?.bodyAreas ?? [])
  const [exercises,   setExercises]   = useState<ExEntry[]>(
    initialWorkout?.exercises?.length
      ? initialWorkout.exercises
      : [{ name: '', sets: [{ reps: 0, weightLbs: 0 }], equipment: 'barbell' }]
  )
  const [cardioEntry, setCardioEntry] = useState<Partial<CardioEntry>>(
    initialWorkout?.cardioEntries?.[0] ?? { source: 'Manual' }
  )
  const [notes, setNotes] = useState(initialWorkout?.notes ?? '')
  const [saving, setSaving] = useState(false)

  // Session timer
  const sessionStartRef = useRef(Date.now())
  const [elapsedSecs, setElapsedSecs] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setElapsedSecs(Math.floor((Date.now() - sessionStartRef.current) / 1000)), 1000)
    return () => clearInterval(id)
  }, [])

  // Rest timer
  const [restSecs, setRestSecs] = useState<number | null>(null)
  const restStartRef = useRef<number | null>(null)
  useEffect(() => {
    if (restSecs === null || restSecs <= 0) return
    const id = setTimeout(() => setRestSecs(s => (s !== null && s > 0 ? s - 1 : s)), 1000)
    return () => clearTimeout(id)
  }, [restSecs])

  function startRest(secs = 90) {
    restStartRef.current = Date.now()
    setRestSecs(secs)
  }

  function fmtTime(secs: number) {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  // Templates
  const [showTemplates, setShowTemplates] = useState(false)
  const [templates,     setTemplates]     = useState<WorkoutTemplate[]>([])
  const [showSaveAsTmpl,setShowSaveAsTmpl]= useState(false)
  const [tmplName,      setTmplName]      = useState('')
  const [tmplSaved,     setTmplSaved]     = useState(false)

  useEffect(() => { getTemplates().then(setTemplates) }, [])

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

      if (initialWorkout) {
        await updateWorkout(initialWorkout.id, { ...payload })
      } else {
        await saveWorkout(payload)
      }
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="log-modal-overlay" onClick={onClose}>
      <div className="log-modal" onClick={e => e.stopPropagation()}>
        <div className="log-modal-header">
          <h2 className="log-modal-title">{initialWorkout ? 'Edit Workout' : 'Log Workout'}</h2>
          <button className="log-modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        {/* ── Session timer + rest timer ── */}
        {!initialWorkout && (
          <div className="log-modal-timer-bar">
            <span className="log-timer-elapsed">⏱ {fmtTime(elapsedSecs)}</span>
            <div className="log-rest-timer">
              {restSecs !== null && restSecs > 0 && (
                <span className="log-rest-countdown">{fmtTime(restSecs)}</span>
              )}
              {restSecs !== null && restSecs === 0 && (
                <span className="log-rest-countdown log-rest-countdown--done">Rest done ✓</span>
              )}
              <button
                className={`log-rest-btn ${restSecs !== null && restSecs > 0 ? 'log-rest-btn--active' : ''}`}
                onClick={() => restSecs !== null && restSecs > 0 ? setRestSecs(null) : startRest(90)}
              >
                {restSecs !== null && restSecs > 0 ? 'Cancel rest' : '90s rest'}
              </button>
            </div>
          </div>
        )}

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
              <input type="number" className="log-num-input" value={durationMin} min={5} max={300} step={5}
                onChange={e => setDurationMin(+e.target.value)} />
            </div>
            <div className="log-field">
              <label className="log-label">RPE (1–10)</label>
              <input type="number" className="log-num-input" value={rpe} min={1} max={10}
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
                <ExerciseBlock key={i} ex={ex} prMap={prMap}
                  onChange={upd => { const n = [...exercises]; n[i] = upd; setExercises(n) }}
                  onRemove={() => setExercises(p => p.filter((_, j) => j !== i))} />
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
            {saving ? 'Saving…' : (initialWorkout ? 'Save Changes' : 'Save Workout')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WorkoutsPage() {
  const navigate = useNavigate()
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [dayWorkouts,  setDayWorkouts]  = useState<WorkoutSession[]>([])
  const [prMap,        setPrMap]        = useState<Map<string, number>>(new Map())
  const [workoutDays,  setWorkoutDays]  = useState<string[]>([])
  const [loaded,       setLoaded]       = useState(false)
  const [showModal,    setShowModal]    = useState(false)
  const [showActiveWorkout, setShowActiveWorkout] = useState(false)
  const [editingWorkout,setEditingWorkout] = useState<WorkoutSession | null>(null)
  const [copiedWorkout, setCopiedWorkout]  = useState<WorkoutSession | null>(null)
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [calendarKey,   setCalendarKey]   = useState(0)
  const seeded = useRef(false)

  const loadDay = useCallback(async (date: string) => {
    const [day, prs, days] = await Promise.all([
      getWorkoutsForDate(date),
      getAllTimePRs(),
      getWorkoutDates(400),
    ])
    setDayWorkouts(day)
    setPrMap(prs)
    setWorkoutDays(days)
    setLoaded(true)
  }, [])

  useEffect(() => {
    loadDay(selectedDate)
    if (!seeded.current) { seeded.current = true; seedExerciseLibraryIfEmpty() }
  }, [loadDay, selectedDate])

  useEffect(() => { getProfile().then(setProfile) }, [])

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

  function handleEdit(w: WorkoutSession) { setEditingWorkout(w); setShowModal(true) }
  function handleCopy(w: WorkoutSession) { setCopiedWorkout(w) }

  async function handleDelete(id: string) {
    await deleteWorkout(id)
    refreshCalendar()
    loadDay(selectedDate)
  }

  const dateLabel = (() => {
    const d = new Date(selectedDate + 'T12:00:00')
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  })()
  const isToday = selectedDate === todayStr()

  return (
    <div className="workouts-page">
      <WorkoutsSubNav />

      <header className="page-header" style={{ marginTop: '8px' }}>
        <div>
          <h1 className="page-title">Workouts</h1>
          <p className="page-subtitle">{workoutDays.length} sessions in the last 400 days</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="start-workout-btn" onClick={() => setShowActiveWorkout(true)}>
            <Play size={15} /> Start
          </button>
          <button className="log-workout-btn" onClick={() => { setEditingWorkout(null); setShowModal(true) }}>
            <Plus size={16} /> Log
          </button>
        </div>
      </header>

      {loaded && workoutDays.length === 0 ? (
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
            onClick={() => { setEditingWorkout(null); setShowModal(true) }}
          >
            Log first workout
          </button>
          <button
            className="workouts-first-empty-secondary"
            onClick={() => navigate('/workouts/templates')}
          >
            Create a template
          </button>
        </div>
      ) : (
        <>
          {isToday && <SuggestionCard onLog={() => { setEditingWorkout(null); setShowModal(true) }} />}

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
              <h2 className="workouts-section-title">{isToday ? 'Today' : dateLabel}</h2>
              {!isToday && <span className="day-section-date">{selectedDate}</span>}
            </div>

            {dayWorkouts.length > 0 ? (
              dayWorkouts.map(w => (
                <WorkoutCard key={w.id} w={w}
                  onDelete={() => handleDelete(w.id)}
                  onEdit={() => handleEdit(w)}
                  onCopy={() => handleCopy(w)} />
              ))
            ) : (
              <div className="workouts-empty-today">
                <span>{isToday ? 'No workout logged today.' : 'No workouts on this day.'}</span>
                <button onClick={() => { setEditingWorkout(null); setShowModal(true) }}>Log one →</button>
              </div>
            )}
          </div>
        </>
      )}

      {(showModal || editingWorkout) && (
        <LogModal
          prMap={prMap}
          initialWorkout={editingWorkout ?? undefined}
          prefilledDate={selectedDate}
          onClose={() => { setShowModal(false); setEditingWorkout(null) }}
          onSaved={() => { loadDay(selectedDate); refreshCalendar() }} />
      )}

      {showActiveWorkout && (
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
      )}
    </div>
  )
}
