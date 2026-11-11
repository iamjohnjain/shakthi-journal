import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Plus, Check, Timer, ChevronDown,
  Dumbbell, RotateCcw, Flame, Camera, Mic, Loader2,
} from 'lucide-react'
import { saveWorkout, getLastExercisePerformance, EXERCISE_LIBRARY, WORKOUT_TYPES } from '../db/workoutStore'
import { getAllExerciseNames, capitalizeExerciseName, rememberCustomExercise } from '../db/trainingStore'
import type { WorkoutSession, WorkoutExerciseEntry, ExerciseSet } from '../db'
import type { ProfileData } from '../db/profileStore'
import { parseWorkoutDescription, analyzeWorkoutPhoto } from '../lib/aiWorkoutParser'
import type { ParsedExercise } from '../lib/aiWorkoutParser'
import { compressImageToDataUrl } from '../lib/imageUtils'
import LiveCamera from '../components/LiveCamera'
import { useSpeechToText } from '../hooks/useSpeechToText'
import { localDateStr } from '../data/config'
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
  /** Pre-fills the live session from a template or a one-off plan, so
      picking one gets the same rest-timer/elapsed-clock experience as
      "Start" instead of silently falling back to the untimed flat-edit
      view. Sets start un-done regardless of what's in the template — the
      user still has to actually perform and check off each one. */
  initial?: { title: string; exercises: WorkoutExerciseEntry[] }
}

function toActiveExercises(entries: WorkoutExerciseEntry[]): ActiveExercise[] {
  return entries
    .filter(e => !e.isBreak)
    .map(e => ({
      name: e.name,
      notes: e.notes ?? '',
      sets: e.sets.map(s => ({ ...s, done: false })),
      lastPerf: null,
    }))
}

// ─── Timer hooks ──────────────────────────────────────────────────────────────

/** `paused` stops the tick without resetting the displayed value — used so
    the clock actually freezes on the Finish summary instead of continuing
    to count up behind it (the summary screen doesn't unmount the timer,
    it's rendered by the same still-mounted component). */
function useElapsedTimer(paused = false): number {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (paused) return
    const t = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [paused])
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

const FALLBACK_NAMES: string[] = EXERCISE_LIBRARY.map(e => e.name)

export function ExercisePicker({ onPick, onAiExercises, onClose }: {
  onPick: (name: string) => void
  onAiExercises: (exercises: ParsedExercise[]) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  // Starts from the static fallback so the list isn't empty for the one
  // frame before the full (seeded + any custom-remembered) library loads.
  const [allNames, setAllNames] = useState<string[]>(FALLBACK_NAMES)
  useEffect(() => { getAllExerciseNames().then(setAllNames) }, [])
  const filtered  = allNames.filter(n => n.toLowerCase().includes(q.toLowerCase())).slice(0, 20)
  // No auto-focus on open — the keyboard should only appear once the user
  // actually taps the search field, not the instant this sheet opens.
  const ref = useRef<HTMLInputElement>(null)

  const [showCamera, setShowCamera] = useState(false)
  const [dictating, setDictating] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [busy, setBusy] = useState(false)
  const [aiNote, setAiNote] = useState('')
  const { listening, toggle: toggleListening, supported: speechSupported } = useSpeechToText(
    t => setTranscript(d => (d ? `${d} ${t}` : t))
  )

  async function handlePhoto(blob: Blob) {
    setShowCamera(false)
    setBusy(true)
    setAiNote('')
    try {
      const dataUrl = await compressImageToDataUrl(blob)
      const result = await analyzeWorkoutPhoto(dataUrl)
      if (result.exercises.length > 0) {
        onAiExercises(result.exercises)
        onClose()
      } else {
        setAiNote(result.note || "Couldn't identify an exercise from that photo — try again or search below.")
      }
    } catch {
      setAiNote("Couldn't read that photo — try again or search below.")
    }
    setBusy(false)
  }

  async function handleParseTranscript() {
    if (!transcript.trim() || busy) return
    setBusy(true)
    setAiNote('')
    const result = await parseWorkoutDescription(transcript)
    if (result.exercises.length > 0) {
      onAiExercises(result.exercises)
      onClose()
    } else {
      setAiNote(result.note || "Couldn't make that out — try again or search below.")
    }
    setBusy(false)
  }

  return createPortal(
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
          <button
            className="aw-picker-ai-btn"
            onClick={() => setShowCamera(true)}
            aria-label="Add exercise from photo"
            disabled={busy}
          >
            <Camera size={15} />
          </button>
          {speechSupported && (
            <button
              className={`aw-picker-ai-btn ${listening ? 'aw-picker-ai-btn--active' : ''}`}
              onClick={() => { setDictating(true); toggleListening() }}
              aria-label={listening ? 'Stop dictating' : 'Add exercise by voice'}
              disabled={busy}
            >
              <Mic size={15} />
            </button>
          )}
          <button className="aw-picker-close" onClick={onClose}><X size={16} /></button>
        </div>

        {(dictating || transcript) && (
          <div className="aw-picker-dictate">
            <input
              value={transcript}
              onChange={e => setTranscript(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleParseTranscript() }}
              placeholder="e.g. &ldquo;3 sets of bench press at 135 for 8&rdquo;"
              disabled={busy}
              autoFocus
            />
            <button
              className="aw-picker-dictate-send"
              onClick={handleParseTranscript}
              disabled={!transcript.trim() || busy}
              aria-label="Parse"
            >
              {busy ? <Loader2 size={14} className="aw-spin" /> : <Check size={14} />}
            </button>
          </div>
        )}

        {aiNote && <p className="aw-picker-ai-note">{aiNote}</p>}

        <div className="aw-picker-list">
          {filtered.map(name => (
            <button key={name} className="aw-picker-item" onClick={() => { onPick(name); onClose() }}>
              {name}
            </button>
          ))}
          {q.trim() && !allNames.includes(q.trim()) && (
            <button className="aw-picker-item aw-picker-item--custom" onClick={() => { onPick(capitalizeExerciseName(q)); onClose() }}>
              <Plus size={12} /> Add "{q.trim()}"
            </button>
          )}
        </div>
      </div>

      {showCamera && (
        <LiveCamera onCapture={handlePhoto} onClose={() => setShowCamera(false)} />
      )}
    </div>,
    document.body
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
  const isNewPR = !set.isWarmup && prLbs != null && set.weightLbs > 0 && set.reps > 0
    && set.weightLbs * (1 + set.reps / 30) > prLbs

  return (
    <div className={`aw-set-row ${set.done ? 'aw-set-row--done' : ''} ${isNewPR && set.done ? 'aw-set-row--pr' : ''} ${set.isWarmup ? 'aw-set-row--warmup' : ''}`}>
      <span className="aw-set-num">{setNum}</span>
      <button
        className={`aw-warmup-btn ${set.isWarmup ? 'aw-warmup-btn--on' : ''}`}
        onClick={() => onChange({ isWarmup: !set.isWarmup })}
        aria-label={set.isWarmup ? 'Unmark warm-up' : 'Mark as warm-up'}
        title="Warm-up set"
      >
        <Flame size={12} />
      </button>
      <input
        className="aw-set-field"
        type="number"
        inputMode="decimal"
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
        inputMode="numeric"
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
    const sets = ex.sets.map((s, si) => {
      if (si !== i) return s
      const merged = { ...s, ...patch }
      // Entering a real weight and rep count is a strong enough signal the
      // set was actually performed — completion shouldn't depend on a
      // separate tap the user might not realize is required, since an
      // unmarked set silently drops out of both the Finish summary stats
      // and the saved workout (handleConfirmFinish only keeps done sets).
      if (!merged.done && merged.reps > 0 && merged.weightLbs > 0) merged.done = true
      return merged
    })
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
        <span>Set</span><span /><span>Weight</span><span /><span>Reps</span><span />
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
  const totalSets  = exercises.reduce((s, e) => s + e.sets.filter(x => x.done && !x.isWarmup).length, 0)
  const totalVol   = exercises.reduce((s, e) => s + e.sets.filter(x => x.done && !x.isWarmup).reduce((sv, x) => sv + x.weightLbs * x.reps, 0), 0)
  const prs        = exercises.reduce((count, e) => {
    const prLbs = prMap.get(e.name)
    if (!prLbs) return count
    const hasPR = e.sets.some(s => s.done && !s.isWarmup && s.weightLbs * (1 + s.reps / 30) > prLbs)
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
          <span className="aw-summary-stat-value">
            {totalVol >= 1000 ? `${(totalVol / 1000).toFixed(1)}k` : totalVol.toLocaleString()}
          </span>
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

export default function ActiveWorkout({ prMap, profile, onFinish, onClose, initial }: Props) {
  const DEFAULT_KG = profile?.startWeightKg ?? 80

  const [workoutType,  setWorkoutType]  = useState<'lifting' | 'cardio'>('lifting')
  const [title,        setTitle]        = useState(initial?.title ?? '')
  const [exercises,    setExercises]    = useState<ActiveExercise[]>(() => initial ? toActiveExercises(initial.exercises) : [])
  const [showPicker,   setShowPicker]   = useState(false)
  const [showFinish,   setShowFinish]   = useState(false)
  const elapsed = useElapsedTimer(showFinish)
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

  /** Adds one or more exercises with AI-proposed sets already filled in —
      skips the `getLastExercisePerformance` auto-suggest `addExercise` does,
      since the caller (photo/voice parse) already proposed real sets. The
      user still reviews/edits every value with the normal set-row controls
      before marking anything done. */
  const addExercisesWithSets = useCallback((parsed: ParsedExercise[]) => {
    setExercises(prev => [
      ...prev,
      ...parsed.map(p => ({
        name: p.name,
        notes: '',
        sets: p.sets.map(s => ({ weightLbs: s.weightLbs, reps: s.reps, done: false })),
      })),
    ])
  }, [])

  function updateExercise(idx: number, patch: Partial<ActiveExercise>) {
    setExercises(prev => prev.map((e, i) => i === idx ? { ...e, ...patch } : e))
  }

  function removeExercise(idx: number) {
    setExercises(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleConfirmFinish() {
    setSaving(true)
    const todayStr = localDateStr()

    // Build WorkoutExerciseEntry[] — only include done sets
    const saved: WorkoutExerciseEntry[] = exercises
      .filter(e => e.sets.some(s => s.done))
      .map(e => ({
        name: e.name,
        notes: e.notes || undefined,
        sets: e.sets.filter(s => s.done).map(s => {
          const e1rm = !s.isWarmup && s.reps > 0 ? +(s.weightLbs * (1 + s.reps / 30)).toFixed(1) : undefined
          const currentPR = prMap.get(e.name) ?? 0
          return {
            weightLbs: s.weightLbs,
            reps: s.reps,
            e1rm,
            isPR: e1rm != null && e1rm > currentPR,
            isWarmup: s.isWarmup,
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
    // Fire-and-forget — remembers any exercise name typed here that isn't
    // already in the library, so it's available in autocomplete next time
    // instead of needing to be typed out in full again.
    void Promise.all(saved.map(e => rememberCustomExercise(e.name)))
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
          onAiExercises={addExercisesWithSets}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  )
}
