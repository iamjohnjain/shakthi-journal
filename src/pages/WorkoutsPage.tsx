import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  Plus, ChevronDown, ChevronUp, Trash2, Dumbbell,
  Lightbulb, Flame,
  ChevronLeft, ChevronRight, Copy, Clipboard,
  LayoutTemplate, Check, X, AlertTriangle, Play,
  GripVertical, Coffee, CalendarDays,
} from 'lucide-react'
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import ActiveWorkout from './ActiveWorkout'
import TemplateModal from '../components/TemplateModal'
import {
  saveWorkout, updateWorkout, deleteWorkout, getAllTimePRs, annotateExercises, estimateOneRM,
  getWorkoutsForDate, getWorkoutDateTypes, getCurrentWorkoutStreak,
  getWorkoutsForWeekDates,
  getLastExercisePerformance, suggestNextWorkingSet,
  WORKOUT_TYPES, CARDIO_SUBTYPES, EXERCISE_LIBRARY,
} from '../db/workoutStore'
import type { ExerciseLastPerf, NextSetSuggestion } from '../db/workoutStore'
import {
  estimateWorkoutCalories, seedExerciseLibraryIfEmpty,
  getAllExerciseNames, capitalizeExerciseName,
} from '../db/trainingStore'
import { getTemplates, workoutToTemplate } from '../db/templateStore'
import type { WorkoutTemplate } from '../db/templateStore'
import { useWorkoutSuggestion } from '../hooks/useWorkoutSuggestion'
import { getProfile } from '../db/profileStore'
import type { ProfileData } from '../db/profileStore'
import type { WorkoutSession, ExerciseSet, WorkoutExerciseEntry } from '../db'
import { useScrollLock } from '../hooks/useScrollLock'
import { useSwipeToClose } from '../hooks/useSwipeToClose'
import { localDateStr, addLocalDays, formatDate } from '../data/config'
import { getISOWeek, getWeekDates } from '../lib/weekUtils'
import DatePickerCalendar from '../components/DatePickerCalendar'
import WorkoutsSubNav from '../components/WorkoutsSubNav'
import WheelPicker from '../components/WheelPicker'
import './WorkoutsPage.css'

const DEFAULT_BODY_WEIGHT_KG = 80  // ~176 lbs fallback when profile has no weight

function todayStr() { return localDateStr() }

const DOW_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

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
  onPrevDay: () => void
  onNextDay: () => void
  canGoNext: boolean
}

function WeekCalendar({
  selectedDate, onSelectDate, copiedWorkout, onPasteDay, onMarkRest, refreshKey,
  onPrevDay, onNextDay, canGoNext,
}: WeekCalendarProps) {
  const today = todayStr()
  // The displayed week just follows whichever day is selected — no
  // separate week-navigation state, since the page's own day nav already
  // handles moving between dates.
  const weekInfo = useMemo(() => getISOWeek(new Date(selectedDate + 'T12:00:00')), [selectedDate])
  const weekDates = useMemo(() => getWeekDates(weekInfo.week, weekInfo.year), [weekInfo])
  const [dayWorkouts, setDayWorkouts] = useState<Map<string, WorkoutSession[]>>(new Map())
  useEffect(() => {
    getWorkoutsForWeekDates(weekDates).then(setDayWorkouts)
  }, [weekDates, refreshKey])

  function getDotColor(workouts: WorkoutSession[]) {
    if (!workouts.length) return null
    const hasLift   = workouts.some(w => w.type === 'lifting')
    const hasCardio = workouts.some(w => w.type === 'cardio')
    if (hasLift && hasCardio) return 'both'
    if (hasLift)   return 'lift'
    if (hasCardio) return 'cardio'
    return null
  }

  return (
    <div className="week-cal">
      <button className="week-cal-nav week-cal-nav--edge" onClick={onPrevDay} aria-label="Previous day">
        <ChevronLeft size={16} />
      </button>
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
      <button className="week-cal-nav week-cal-nav--edge" onClick={onNextDay} disabled={!canGoNext} aria-label="Next day">
        <ChevronRight size={16} />
      </button>
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
          <Flame size={12} />
        </button>
        <span className="set-num">{idx + 1}</span>
        {set.isWarmup && <span className="set-warmup-label">Warm-up</span>}
        <button className="set-value-btn" onClick={() => setExpanded(e => !e)}>
          {set.reps || 0}<span className="set-value-unit">reps</span>
        </button>
        <span className="set-x">×</span>
        <button className="set-value-btn" onClick={() => setExpanded(e => !e)}>
          {set.weightLbs || 0}<span className="set-value-unit">lbs</span>
        </button>
        {e1rm && <span className="set-e1rm">{e1rm} 1RM</span>}
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
  ex, onChange, onRemove, prMap, exerciseNames,
}: {
  ex: ExEntry; onChange: (u: ExEntry) => void; onRemove: () => void; prMap: Map<string, number>
  exerciseNames: string[]
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
          {lastPerf.isAllTimePB && <span className="elp-pb">🏆 PR</span>}
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

// ─── Sortable list item (drag handle + content) ────────────────────────────────

function SortableItem({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }
  return (
    <div ref={setNodeRef} style={style} className="sortable-item">
      <button className="sortable-drag-handle" {...attributes} {...listeners} aria-label="Drag to reorder">
        <GripVertical size={15} />
      </button>
      <div className="sortable-item-content">{children}</div>
    </div>
  )
}

// ─── Break marker ───────────────────────────────────────────────────────────────

function BreakMarker({ onRemove }: { onRemove: () => void }) {
  return (
    <div className="break-marker">
      <Coffee size={14} />
      <span>Break</span>
      <button className="break-marker-remove" onClick={onRemove} aria-label="Remove break">
        <X size={13} />
      </button>
    </div>
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
  // Our own edits persist via `persist()` without refetching, so `w` only
  // changes reference when something external updated this session (e.g. a
  // template merged into it from the picker) — safe to always resync then.
  useEffect(() => { setExercises(w.exercises) }, [w.id, w.updatedAt])
  const [showSaveAsTmpl, setShowSaveAsTmpl] = useState(false)
  const [tmplName, setTmplName] = useState('')
  const [tmplSaving, setTmplSaving] = useState(false)
  const [tmplSaved, setTmplSaved] = useState(false)
  const cals  = w.overrideCalories ?? w.estimatedCalories
  const subtype = w.cardioSubtype
  const typeLabel = w.type === 'cardio' && subtype
    ? CARDIO_SUBTYPES.find(s => s.id === subtype)?.label ?? subtype
    : (WORKOUT_TYPES.find(t => t.id === w.type)?.label ?? w.type)
  const hasPR = exercises.some(ex => ex.sets.some(s => {
    if ((s as ExSet).isWarmup || !s.reps || !s.weightLbs) return false
    return estimateOneRM(s.weightLbs, s.reps) > (prMap.get(ex.name) ?? 0)
  }))

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function persist(next: ExEntry[]) {
    setExercises(next)
    annotateExercises(next).then(annotated => updateWorkout(w.id, { exercises: annotated }, { silent: true }))
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = Number(active.id)
    const newIndex = Number(over.id)
    persist(arrayMove(exercises, oldIndex, newIndex))
  }

  async function handleSaveAsTemplate() {
    if (!tmplName.trim()) return
    setTmplSaving(true)
    try {
      await workoutToTemplate(tmplName, exercises.filter(ex => ex.name.trim() && !ex.isBreak), {
        notes: w.notes,
        estimatedDurationMin: w.durationMin,
      })
      setTmplSaved(true)
      setShowSaveAsTmpl(false)
      setTmplName('')
      setTimeout(() => setTmplSaved(false), 2500)
    } finally {
      setTmplSaving(false)
    }
  }

  if (w.type === 'lifting') {
    return (
      <>
        <div className={`wk-flat-session ${hasPR ? 'wk-flat-session--pr' : ''}`}>
          <div className="wk-flat-header">
            <div className="wk-flat-header-left">
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
            <div className="wk-flat-header-actions">
              <button className="wc-icon-btn" onClick={onCopy} title="Copy to another day"><Copy size={14} /></button>
              <button className="wc-icon-btn" onClick={() => setShowSaveAsTmpl(v => !v)} title="Save as template"><LayoutTemplate size={14} /></button>
              <button className="wc-icon-btn wc-icon-btn--del" onClick={() => setConfirmDelete(true)} title="Delete"><Trash2 size={14} /></button>
            </div>
          </div>

          {showSaveAsTmpl && (
            <div className="log-save-tmpl">
              <input className="log-tmpl-name-input" placeholder="Template name…"
                value={tmplName} onChange={e => setTmplName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveAsTemplate()} />
              <button className="log-tmpl-save-btn" onClick={handleSaveAsTemplate} disabled={!tmplName.trim() || tmplSaving}>
                <Check size={14} /> {tmplSaving ? 'Saving…' : 'Save'}
              </button>
              <button className="log-tmpl-cancel-btn" onClick={() => setShowSaveAsTmpl(false)}>×</button>
            </div>
          )}
          {tmplSaved && <div className="log-tmpl-saved"><Check size={13} /> Saved as template!</div>}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={exercises.map((_, i) => String(i))} strategy={verticalListSortingStrategy}>
              {exercises.map((ex, i) => (
                <SortableItem key={i} id={String(i)}>
                  {ex.isBreak ? (
                    <BreakMarker onRemove={() => persist(exercises.filter((_, j) => j !== i))} />
                  ) : (
                    <ExerciseBlock ex={ex} prMap={prMap} exerciseNames={exerciseNames}
                      onChange={upd => { const n = [...exercises]; n[i] = upd; persist(n) }}
                      onRemove={() => persist(exercises.filter((_, j) => j !== i))} />
                  )}
                </SortableItem>
              ))}
            </SortableContext>
          </DndContext>

          <div className="wk-flat-add-row">
            <button className="add-exercise-btn"
              onClick={() => persist([...exercises, { name: '', sets: [{ reps: 0, weightLbs: 0 }], equipment: 'barbell' }])}>
              + Exercise
            </button>
            <button className="add-break-btn"
              onClick={() => persist([...exercises, { name: 'Break', sets: [], isBreak: true }])}>
              <Coffee size={13} /> Break
            </button>
          </div>

          {w.notes && <p className="workout-notes-view">{w.notes}</p>}
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

// ─── Template picker (quick-start "+ Template" from the Today page) ──────────

function TemplatePickerSheet({ onPick, onCreateNew, onClose }: {
  onPick: (t: WorkoutTemplate) => void
  onCreateNew: () => void
  onClose: () => void
}) {
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
            <p className="log-tmpl-empty">No templates yet — create one below.</p>
          ) : (
            templates.map(t => (
              <button key={t.id} className="aw-picker-item" onClick={() => onPick(t)}>
                {t.name}
                <span className="log-tmpl-meta" style={{ marginLeft: 8 }}>{t.exercises.length} exercises</span>
              </button>
            ))
          )}
          <button className="aw-picker-item aw-picker-item--custom" onClick={onCreateNew}>
            <Plus size={14} /> Create New Template
          </button>
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
  const [showActiveWorkout, setShowActiveWorkout] = useState(false)
  const [copiedWorkout, setCopiedWorkout]  = useState<WorkoutSession | null>(null)
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [calendarKey,   setCalendarKey]   = useState(0)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [showCreateTemplate, setShowCreateTemplate] = useState(false)
  const [streak, setStreak] = useState(0)
  const seeded = useRef(false)

  useEffect(() => { getCurrentWorkoutStreak().then(setStreak) }, [calendarKey])

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

  /** Applies a template or an ad-hoc one-time plan to the selected day:
      merges into the existing lifting session if one's already there,
      otherwise creates a new one — keeps the day to one running list of
      exercise boxes instead of stacking separate sessions. */
  async function applyExercisesToDay(data: { title: string; durationMin: number; exercises: WorkoutExerciseEntry[]; notes?: string }) {
    const existing = dayWorkouts.find(w => w.type === 'lifting')
    if (existing) {
      const merged = [...existing.exercises, ...data.exercises]
      const annotated = await annotateExercises(merged)
      await updateWorkout(existing.id, { exercises: annotated })
    } else {
      const weightKg = profile?.startWeightKg ?? DEFAULT_BODY_WEIGHT_KG
      const cal = estimateWorkoutCalories('lifting', data.durationMin, weightKg)
      await saveWorkout({
        date: selectedDate, type: 'lifting', title: data.title, durationMin: data.durationMin,
        exercises: data.exercises, notes: data.notes,
        estimatedCalories: cal.calories, caloriesCalcMethod: cal.method,
        caloriesConfidence: cal.confidence, caloriesSource: cal.source,
      })
    }
    loadDay(selectedDate)
    refreshCalendar()
  }

  function applyTemplate(t: WorkoutTemplate) {
    setShowTemplatePicker(false)
    applyExercisesToDay({
      title: t.name,
      durationMin: t.estimatedDurationMin ?? 60,
      exercises: t.exercises.map(ex => ({ ...ex, equipment: (ex as ExEntry).equipment ?? 'barbell' })),
      notes: t.notes,
    })
  }

  const selectedDateObj = new Date(selectedDate + 'T12:00:00')
  const dateLabel = formatDate(selectedDateObj)
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
              <button className="page-title-datepicker" onClick={() => setShowDatePicker(true)}>
                <h1 className="page-title">{isToday ? 'Today' : dateLabel}</h1>
                <CalendarDays size={18} className="page-title-cal-icon" />
              </button>
              {isToday && <p className="page-subtitle">{dateLabel}</p>}
              {streak >= 2 && (
                <div className="wk-streak-chip" title="Consecutive days with a logged session">
                  <Flame size={13} /> {streak}-day streak
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button className="start-workout-btn" onClick={() => setShowActiveWorkout(true)}>
                <Play size={15} /> Start
              </button>
              <button className="log-workout-btn" onClick={() => setShowTemplatePicker(true)}>
                <LayoutTemplate size={15} /> Template
              </button>
            </div>
          </header>

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
                onClick={() => setShowTemplatePicker(true)}
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
              {isToday && <SuggestionCard onLog={() => setShowTemplatePicker(true)} />}

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
                onPrevDay={() => setSelectedDate(d => addLocalDays(d, -1))}
                onNextDay={() => setSelectedDate(d => addLocalDays(d, 1))}
                canGoNext={canGoForward}
              />

              {/* Selected day */}
              <div className="day-section">
                {dayWorkouts.length > 0 ? (
                  dayWorkouts.map(w => (
                    <WorkoutCard key={w.id} w={w} prMap={prMap} exerciseNames={exerciseNames}
                      onDelete={() => handleDelete(w.id)}
                      onCopy={() => handleCopy(w)} />
                  ))
                ) : (
                  <div className="workouts-empty-today">
                    <span>{isToday ? 'No workout logged today.' : 'No workouts on this day.'}</span>
                    <button onClick={() => setShowTemplatePicker(true)}>Log one →</button>
                  </div>
                )}
              </div>
            </>
          )}

          {showTemplatePicker && (
            <TemplatePickerSheet
              onPick={applyTemplate}
              onCreateNew={() => { setShowTemplatePicker(false); setShowCreateTemplate(true) }}
              onClose={() => setShowTemplatePicker(false)}
            />
          )}

          {showCreateTemplate && (
            <TemplateModal
              onClose={() => setShowCreateTemplate(false)}
              onSaved={() => {}}
              onUseOnce={data => {
                applyExercisesToDay({
                  title: data.name,
                  durationMin: data.estimatedDurationMin,
                  exercises: data.exercises,
                  notes: data.notes,
                })
              }}
            />
          )}
        </>
      )}
    </div>
  )
}
