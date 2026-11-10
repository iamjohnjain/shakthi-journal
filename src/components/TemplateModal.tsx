import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Plus, X } from 'lucide-react'
import { saveTemplate, updateTemplate } from '../db/templateStore'
import type { WorkoutTemplate } from '../db/templateStore'
import type { WorkoutExerciseEntry } from '../db'
import { EXERCISE_LIBRARY } from '../db/workoutStore'
import { getAllExerciseNames, capitalizeExerciseName, rememberCustomExercise } from '../db/trainingStore'
import { useScrollLock } from '../hooks/useScrollLock'
import { useSwipeToClose } from '../hooks/useSwipeToClose'
import '../pages/WorkoutsPage.css'

const ALL_EXERCISE_NAMES = EXERCISE_LIBRARY.map(e => e.name)

interface TemplateModalProps {
  existing?: WorkoutTemplate
  onClose: () => void
  onSaved: () => void
  /** When provided (and `existing` is unset), a second "Use Once" button
      appears alongside "Save as Template" — applies the built exercises
      directly without persisting them to the template library. */
  onUseOnce?: (data: {
    name: string
    notes?: string
    estimatedDurationMin: number
    exercises: WorkoutExerciseEntry[]
  }) => void
}

export default function TemplateModal({ existing, onClose, onSaved, onUseOnce }: TemplateModalProps) {
  const [name,      setName]      = useState(existing?.name ?? '')
  const [notes,     setNotes]     = useState(existing?.notes ?? '')
  const [exercises, setExercises] = useState<Array<{ name: string; sets: number; reps: string; equipment?: string }>>(
    existing?.exercises.map(ex => ({
      name: ex.name,
      sets: ex.sets.length,
      reps: ex.sets[0] ? String(ex.sets[0].reps) : '8',
      equipment: (ex as typeof ex & { equipment?: string }).equipment,
    })) ?? [{ name: '', sets: 3, reps: '8' }]
  )
  const [duration, setDuration] = useState(existing?.estimatedDurationMin ?? 60)
  const [saving, setSaving] = useState(false)

  useScrollLock()
  const swipe = useSwipeToClose(onClose)

  const [exerciseNames, setExerciseNames] = useState<string[]>(ALL_EXERCISE_NAMES)
  useEffect(() => { getAllExerciseNames().then(setExerciseNames) }, [])

  function addExercise() {
    setExercises(p => [...p, { name: '', sets: 3, reps: '8' }])
  }

  function removeExercise(i: number) {
    setExercises(p => p.filter((_, j) => j !== i))
  }

  function updateExercise(i: number, updates: Partial<typeof exercises[number]>) {
    setExercises(p => { const n = [...p]; n[i] = { ...n[i], ...updates }; return n })
  }

  function buildCleanedExercises() {
    return exercises
      .filter(ex => ex.name.trim())
      .map(ex => ({
        name: capitalizeExerciseName(ex.name),
        equipment: ex.equipment,
        sets: Array.from({ length: ex.sets }, () => ({
          reps: parseInt(ex.reps) || 8,
          weightLbs: 0,
        })),
      }))
  }

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const cleanedExercises = buildCleanedExercises()

      if (existing) {
        await updateTemplate(existing.id, {
          name: name.trim(),
          notes: notes || undefined,
          exercises: cleanedExercises,
          estimatedDurationMin: duration,
        })
      } else {
        await saveTemplate({
          name: name.trim(),
          notes: notes || undefined,
          exercises: cleanedExercises,
          estimatedDurationMin: duration,
          targetMuscles: [],
        })
      }
      void Promise.all(cleanedExercises.map(ex => rememberCustomExercise(ex.name)))
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  function handleUseOnce() {
    const cleanedExercises = buildCleanedExercises()
    if (!cleanedExercises.length || !onUseOnce) return
    onUseOnce({
      name: name.trim() || 'Workout',
      notes: notes || undefined,
      estimatedDurationMin: duration,
      exercises: cleanedExercises,
    })
    void Promise.all(cleanedExercises.map(ex => rememberCustomExercise(ex.name)))
    onClose()
  }

  const showDualActions = !!onUseOnce && !existing
  const hasNamedExercise = exercises.some(ex => ex.name.trim())

  return createPortal(
    <div className="tmpl-modal-overlay" onClick={onClose}>
      <div className="tmpl-modal" onClick={e => e.stopPropagation()} style={swipe.style}>
        <div className="tmpl-modal-header" {...swipe.handlers}>
          <div className="modal-grabber" />
          <h2>{existing ? 'Edit Template' : 'New Template'}</h2>
          <button className="log-modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="tmpl-modal-body">
          <div>
            <label className="log-label">Template Name</label>
            <input className="tmpl-name-input" placeholder="e.g. Push Day A, Upper Body…"
              value={name} onChange={e => setName(e.target.value)} />
          </div>

          <div className="log-field">
            <label className="log-label">Estimated Duration (min)</label>
            <input type="number" inputMode="numeric" className="log-num-input" min={10} max={240} step={5}
              value={duration} onChange={e => setDuration(+e.target.value)} />
          </div>

          <div>
            <div className="log-exercises-header" style={{ marginBottom: 8 }}>
              <span className="log-section-title">Exercises</span>
              <button className="add-exercise-btn" onClick={addExercise}>+ Add</button>
            </div>
            <div className="tmpl-exercises-list">
              {exercises.map((ex, i) => (
                <div key={i} className="tmpl-exercise-edit">
                  <input
                    className="tmpl-ex-name-input"
                    list="tmpl-exercise-datalist"
                    placeholder="Exercise name"
                    value={ex.name}
                    onChange={e => updateExercise(i, { name: e.target.value })}
                    onBlur={e => { if (e.target.value.trim()) updateExercise(i, { name: capitalizeExerciseName(e.target.value) }) }} />
                  <datalist id="tmpl-exercise-datalist">
                    {exerciseNames.map(n => <option key={n} value={n} />)}
                  </datalist>
                  <div className="tmpl-ex-sets-row">
                    <input className="tmpl-ex-num-input" type="number" inputMode="numeric"
                      title="Sets" min={1} max={20} value={ex.sets}
                      onChange={e => updateExercise(i, { sets: +e.target.value })} />
                    <span className="tmpl-ex-sets-label">sets ×</span>
                    <input className="tmpl-ex-num-input" type="text"
                      title="Reps" placeholder="reps" value={ex.reps}
                      onChange={e => updateExercise(i, { reps: e.target.value })} />
                  </div>
                  <button className="tmpl-ex-remove" onClick={() => removeExercise(i)} aria-label="Remove exercise"><X size={13} /></button>
                </div>
              ))}
            </div>
            {exercises.length === 0 && (
              <button className="tmpl-add-ex-btn" onClick={addExercise}>
                <Plus size={14} /> Add first exercise
              </button>
            )}
          </div>

          <div>
            <label className="log-label">Notes</label>
            <textarea className="tmpl-notes-input" rows={2} placeholder="Optional notes…"
              value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        <div className={`tmpl-modal-footer ${showDualActions ? 'tmpl-modal-footer--dual' : ''}`}>
          {showDualActions ? (
            <>
              <button className="tmpl-modal-save tmpl-modal-save--secondary" onClick={handleUseOnce} disabled={!hasNamedExercise}>
                Use Once
              </button>
              <button className="tmpl-modal-save" onClick={handleSave} disabled={saving || !name.trim()}>
                {saving ? 'Saving…' : 'Save as Template'}
              </button>
            </>
          ) : (
            <button className="tmpl-modal-save" onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? 'Saving…' : (existing ? 'Save Changes' : 'Create Workout Template')}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
