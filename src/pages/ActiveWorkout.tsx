import { useState, useEffect, useRef, useCallback } from 'react'
import {
  X, Plus, Check, Timer, ChevronDown,
  Dumbbell, RotateCcw, Flame,
} from 'lucide-react'
import { saveWorkout, getLastExercisePerformance, EXERCISE_LIBRARY, WORKOUT_TYPES } from '../db/workoutStore'
import type { WorkoutSession, WorkoutExerciseEntry, ExerciseSet } from '../db'
import type { ProfileData } from '../db/profileStore'
import './ActiveWorkout.css'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActiveSet extends ExerciseSet {
  done: boolean
}

interface ActiveExercise {
  name: string
  notes: string
  sets: ActiveSet[]
  lastPerf?: { weight: number; reps: number; date: string } | null
}

interface Props {
  prMap: Map<string, number>
  profile: ProfileData | null
  onFinish: (session: WorkoutSession) => void
  onClose: () => void
}

// ─── Timer hooks ──────────────────────────────────────────────────────────────

function useElapsedTimer(): number {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [])
  return elapsed
}

function useRestTimer(onDone: () => void) {
  const [restSecs, setRestSecs] = useState<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  function start(secs = 90) {
    if (timerRef.current) clearInterval(timerRef.current)
    setRestSecs(secs)
    timerRef.current = setInterval(() => {
      setRestSecs(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(timerRef.current!)
          timerRef.current = null
          onDone()
          return null
        }
        return prev - 1
      })
    }, 1000)
  }

  function stop() {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    setRestSecs(null)
  }

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  return { restSecs, start, stop }
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60), ss = s % 60
  return `${m}:${String(ss).padStart(2, '0')}`
}

// ─── Exercise search ──────────────────────────────────────────────────────────

const ALL_NAMES: string[] = EXERCISE_LIBRARY.map(e => e.name)

function ExercisePicker({ onPick, onClose }: { onPick: (name: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const filtered  = ALL_NAMES.filter(n => n.toLowerCase().includes(q.toLowerCase())).slice(0, 20)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])

  return (
    <div className="aw-picker-overlay" onClick={onClose}>
      <div className="aw-picker" onClick={e => e.stopPropagation()}>
        <div className="aw-picker-search">
          <input
            ref={ref}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search exercises…"
            className="aw-picker-input"
          />
          <button className="aw-picker-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="aw-picker-list">
          {filtered.map(name => (
            <button key={name} className="aw-picker-item" onClick={() => { onPick(name); onClose() }}>
              {name}
            </button>
          ))}
          {q.trim() && !ALL_NAMES.includes(q.trim()) && (
            <button className="aw-picker-item aw-picker-item--custom" onClick={() => { onPick(q.trim()); onClose() }}>
              <Plus size={12} /> Add "{q.trim()}"
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Set row ──────────────────────────────────────────────────────────────────

function SetRow({
  setNum, set, onChange, onDone, prLbs,
}: {
  setNum: number
  set: ActiveSet
  onChange: (patch: Partial<ActiveSet>) => void
  onDone: () => void
  prLbs?: number
}) {
  const isNewPR = prLbs != null && set.weightLbs > 0 && set.reps > 0
    && set.weightLbs * (1 + set.reps / 30) > prLbs

  return (
    <div className={`aw-set-row ${set.done ? 'aw-set-row--done' : ''} ${isNewPR && set.done ? 'aw-set-row--pr' : ''}`}>
      <span className="aw-set-num">{setNum}</span>
      <input
        className="aw-set-field"
        type="number"
        min={0}
        step={2.5}
        value={set.weightLbs || ''}
        placeholder="lbs"
        onChange={e => onChange({ weightLbs: +e.target.value || 0 })}
      />
      <span className="aw-set-x">×</span>
      <input
        className="aw-set-field"
        type="number"
        min={0}
        value={set.reps || ''}
        placeholder="reps"
        onChange={e => onChange({ reps: +e.target.value || 0 })}
      />
      {isNewPR && set.done && <span className="aw-pr-badge">PR</span>}
      <button
        className={`aw-set-done-btn ${set.done ? 'aw-set-done-btn--checked' : ''}`}
        onClick={onDone}
        aria-label={set.done ? 'Undo set' : 'Mark set complete'}
      >
        <Check size={14} />
      </button>
    </div>
  )
}

// ─── Exercise block ───────────────────────────────────────────────────────────

function ExerciseBlock({
  ex, index, prMap, onUpdate, onRemove, onSetDone,
}: {
  ex: ActiveExercise
  index: number
  prMap: Map<string, number>
  onUpdate: (patch: Partial<ActiveExercise>) => void
  onRemove: () => void
  onSetDone: (setIndex: number) => void
}) {
  const prLbs = prMap.get(ex.name)
  const last  = ex.lastPerf

  function addSet() {
    const lastSet  = ex.sets[ex.sets.length - 1]
    const newSet: ActiveSet = {
      weightLbs: lastSet?.weightLbs ?? 0,
      reps:      lastSet?.reps ?? 0,
      done: false,
    }
    onUpdate({ sets: [...ex.sets, newSet] })
  }

  function updateSet(i: number, patch: Partial<ActiveSet>) {
    const sets = ex.sets.map((s, si) => si === i ? { ...s, ...patch } : s)
    onUpdate({ sets })
  }

  return (
    <div className="aw-exercise">
      <div className="aw-exercise-header">
        <span className="aw-exercise-num">{index + 1}</span>
        <div className="aw-exercise-name-col">
          <span className="aw-exercise-name">{ex.name}</span>
          {last && (
            <span className="aw-exercise-last">
              Last: {last.weight} lbs × {last.reps} — {last.date}
            </span>
          )}
        </div>
        <button className="aw-exercise-remove" onClick={onRemove} aria-label="Remove exercise">
          <X size={14} />
        </button>
      </div>

      <div className="aw-sets-header">
        <span>Set</span><span>Weight</span><span /><span>Reps</span><span />
      </div>

      {ex.sets.map((set, i) => (
        <SetRow
          key={i}
          setNum={i + 1}
          set={set}
          prLbs={prLbs}
          onChange={patch => updateSet(i, patch)}
          onDone={() => onSetDone(i)}
        />
      ))}

      <button className="aw-add-set-btn" onClick={addSet}>
        <Plus size={12} /> Add set
      </button>
    </div>
  )
}

// ─── Finish summary ───────────────────────────────────────────────────────────

function FinishSummary({
  exercises, elapsed, prMap, onConfirm, onBack,
}: {
  exercises: ActiveExercise[]
  elapsed: number
  prMap: Map<string, number>
  onConfirm: () => void
  onBack: () => void
}) {
  const totalSets  = exercises.reduce((s, e) => s + e.sets.filter(x => x.done).length, 0)
  const totalVol   = exercises.reduce((s, e) => s + e.sets.filter(x => x.done).reduce((sv, x) => sv + x.weightLbs * x.reps, 0), 0)
  const prs        = exercises.reduce((count, e) => {
    const prLbs = prMap.get(e.name)
    if (!prLbs) return count
    const hasPR = e.sets.some(s => s.done && s.weightLbs * (1 + s.reps / 30) > prLbs)
    return count + (hasPR ? 1 : 0)
  }, 0)

  return (
    <div className="aw-summary">
      <div className="aw-summary-icon">💪</div>
      <h2 className="aw-summary-title">Workout complete!</h2>
      <div className="aw-summary-stats">
        <div className="aw-summary-stat">
          <span className="aw-summary-stat-value">{formatTime(elapsed)}</span>
          <span className="aw-summary-stat-label">Duration</span>
        </div>
        <div className="aw-summary-stat">
          <span className="aw-summary-stat-value">{totalSets}</span>
          <span className="aw-summary-stat-label">Sets done</span>
        </div>
        <div className="aw-summary-stat">
          <span className="aw-summary-stat-value">{(totalVol / 1000).toFixed(1)}k</span>
          <span className="aw-summary-stat-label">lbs lifted</span>
        </div>
        {prs > 0 && (
          <div className="aw-summary-stat aw-summary-stat--pr">
            <span className="aw-summary-stat-value">🏆 {prs}</span>
            <span className="aw-summary-stat-label">New PR{prs > 1 ? 's' : ''}</span>
          </div>
        )}
      </div>
      <button className="aw-confirm-btn" onClick={onConfirm}>Save Workout</button>
      <button className="aw-back-btn" onClick={onBack}>Keep going</button>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ActiveWorkout({ prMap, profile, onFinish, onClose }: Props) {
  const DEFAULT_KG = profile?.startWeightKg ?? 80
  const elapsed    = useElapsedTimer()

  const [workoutType,  setWorkoutType]  = useState<'lifting' | 'cardio'>('lifting')
  const [title,        setTitle]        = useState('')
  const [exercises,    setExercises]    = useState<ActiveExercise[]>([])
  const [showPicker,   setShowPicker]   = useState(false)
  const [showFinish,   setShowFinish]   = useState(false)
  const [showTypeMenu, setShowTypeMenu] = useState(false)
  const [saving,       setSaving]       = useState(false)

  const { restSecs, start: startRest, stop: stopRest } = useRestTimer(
    () => { /* timer done — could vibrate or beep */ }
  )

  function handleSetDone(exIdx: number, setIdx: number) {
    const ex  = exercises[exIdx]
    const set = ex.sets[setIdx]
    const wasDone = set.done

    setExercises(prev => prev.map((e, ei) =>
      ei !== exIdx ? e : {
        ...e,
        sets: e.sets.map((s, si) =>
          si !== setIdx ? s : { ...s, done: !s.done }
        ),
      }
    ))

    if (!wasDone) {
      startRest(90)
    } else {
      stopRest()
    }
  }

  const addExercise = useCallback(async (name: string) => {
    const lastPerf = await getLastExercisePerformance(name)
    const suggest  = lastPerf ? lastPerf.weight : Math.round(DEFAULT_KG * 2.205 * 0.6 / 5) * 5
    setExercises(prev => [...prev, {
      name,
      notes: '',
      sets: [{ weightLbs: suggest, reps: 5, done: false }],
      lastPerf: lastPerf ? { weight: lastPerf.weight, reps: lastPerf.reps, date: lastPerf.date.slice(0, 10) } : null,
    }])
  }, [DEFAULT_KG])

  function updateExercise(idx: number, patch: Partial<ActiveExercise>) {
    setExercises(prev => prev.map((e, i) => i === idx ? { ...e, ...patch } : e))
  }

  function removeExercise(idx: number) {
    setExercises(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleConfirmFinish() {
    setSaving(true)
    const now = new Date().toISOString()
    const todayStr = now.slice(0, 10)

    // Build WorkoutExerciseEntry[] — only include done sets
    const saved: WorkoutExerciseEntry[] = exercises
      .filter(e => e.sets.some(s => s.done))
      .map(e => ({
        name: e.name,
        notes: e.notes || undefined,
        sets: e.sets.filter(s => s.done).map(s => {
          const e1rm = s.reps > 0 ? +(s.weightLbs * (1 + s.reps / 30)).toFixed(1) : undefined
          const currentPR = prMap.get(e.name) ?? 0
          return {
            weightLbs: s.weightLbs,
            reps: s.reps,
            e1rm,
            isPR: e1rm != null && e1rm > currentPR,
          }
        }),
      }))

    const session: Omit<WorkoutSession, 'id' | 'createdAt' | 'updatedAt'> = {
      date: todayStr,
      type: workoutType,
      title: title.trim() || (workoutType === 'lifting' ? 'Lifting session' : 'Cardio session'),
      durationMin: Math.round(elapsed / 60),
      exercises: saved,
      cardioEntries: [],
    }

    const result = await saveWorkout(session as WorkoutSession)
    setSaving(false)
    onFinish(result)
  }

  if (showFinish) {
    return (
      <div className="aw-overlay">
        <FinishSummary
          exercises={exercises}
          elapsed={elapsed}
          prMap={prMap}
          onConfirm={handleConfirmFinish}
          onBack={() => setShowFinish(false)}
        />
      </div>
    )
  }

  return (
    <div className="aw-overlay">
      <div className="aw-modal">

        {/* ── Header ── */}
        <div className="aw-header">
          <div className="aw-header-left">
            <button className="aw-type-btn" onClick={() => setShowTypeMenu(t => !t)}>
              {workoutType === 'lifting' ? <Dumbbell size={15} /> : <Flame size={15} />}
              {workoutType === 'lifting' ? 'Lifting' : 'Cardio'}
              <ChevronDown size={12} />
            </button>
            {showTypeMenu && (
              <div className="aw-type-menu">
                {WORKOUT_TYPES.map(t => (
                  <button key={t.id} className="aw-type-menu-item"
                    onClick={() => { setWorkoutType(t.id as 'lifting' | 'cardio'); setShowTypeMenu(false) }}>
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="aw-timer">
            <Timer size={14} />
            {formatTime(elapsed)}
          </div>

          <button
            className="aw-close-btn"
            onClick={() => {
              if (exercises.length > 0 && !window.confirm('Discard this workout? Logged sets will be lost.')) return
              onClose()
            }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Title ── */}
        <input
          className="aw-title-input"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={workoutType === 'lifting' ? 'Lifting session' : 'Cardio session'}
        />

        {/* ── Rest timer banner ── */}
        {restSecs != null && (
          <div className="aw-rest-banner">
            <RotateCcw size={13} />
            <span>Rest: {formatTime(restSecs)}</span>
            <button className="aw-rest-skip" onClick={stopRest}>Skip</button>
          </div>
        )}

        {/* ── Exercise list ── */}
        <div className="aw-exercises">
          {exercises.length === 0 ? (
            <div className="aw-empty">
              <p>Tap "Add exercise" to start tracking sets in real time.</p>
            </div>
          ) : (
            exercises.map((ex, i) => (
              <ExerciseBlock
                key={`${ex.name}-${i}`}
                ex={ex}
                index={i}
                prMap={prMap}
                onUpdate={patch => updateExercise(i, patch)}
                onRemove={() => removeExercise(i)}
                onSetDone={si => handleSetDone(i, si)}
              />
            ))
          )}
        </div>

        {/* ── Footer actions ── */}
        <div className="aw-footer">
          <button className="aw-add-ex-btn" onClick={() => setShowPicker(true)}>
            <Plus size={15} /> Add exercise
          </button>
          <button
            className="aw-finish-btn"
            onClick={() => setShowFinish(true)}
            disabled={exercises.length === 0 || saving}
          >
            {saving ? 'Saving…' : 'Finish'}
          </button>
        </div>

      </div>

      {showPicker && (
        <ExercisePicker
          onPick={addExercise}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  )
}
