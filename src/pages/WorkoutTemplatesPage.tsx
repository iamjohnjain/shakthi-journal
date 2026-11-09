import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { NavLink } from 'react-router-dom'
import {
  Plus, Pencil, Trash2, LayoutTemplate, Dumbbell, BookOpen, TrendingUp,
  CalendarDays, X, AlertTriangle, Clock, Sparkles, FileText, Camera, Upload, Mic, Loader2, Check,
} from 'lucide-react'
import { getTemplates, saveTemplate, updateTemplate, deleteTemplate } from '../db/templateStore'
import type { WorkoutTemplate } from '../db/templateStore'
import { EXERCISE_LIBRARY } from '../db/workoutStore'
import { useScrollLock } from '../hooks/useScrollLock'
import { useSwipeToClose } from '../hooks/useSwipeToClose'
import { useSpeechToText } from '../hooks/useSpeechToText'
import { parseWorkoutPlanText, parseWorkoutPlanPhoto, isAiWorkoutParsingAvailable } from '../lib/aiWorkoutParser'
import type { ParsedPlanDay, WorkoutPlanParseResult } from '../lib/aiWorkoutParser'
import { compressImageToDataUrl } from '../lib/imageUtils'
import LiveCamera from '../components/LiveCamera'
import './WorkoutsPage.css'

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

// ─── Template Edit Modal ──────────────────────────────────────────────────────

interface TemplateModalProps {
  existing?: WorkoutTemplate
  onClose: () => void
  onSaved: () => void
}

function TemplateModal({ existing, onClose, onSaved }: TemplateModalProps) {
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

  function addExercise() {
    setExercises(p => [...p, { name: '', sets: 3, reps: '8' }])
  }

  function removeExercise(i: number) {
    setExercises(p => p.filter((_, j) => j !== i))
  }

  function updateExercise(i: number, updates: Partial<typeof exercises[number]>) {
    setExercises(p => { const n = [...p]; n[i] = { ...n[i], ...updates }; return n })
  }

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const cleanedExercises = exercises
        .filter(ex => ex.name.trim())
        .map(ex => ({
          name: ex.name,
          equipment: ex.equipment,
          sets: Array.from({ length: ex.sets }, () => ({
            reps: parseInt(ex.reps) || 8,
            weightLbs: 0,
          })),
        }))

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
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

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
                    onChange={e => updateExercise(i, { name: e.target.value })} />
                  <datalist id="tmpl-exercise-datalist">
                    {ALL_EXERCISE_NAMES.map(n => <option key={n} value={n} />)}
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

        <div className="tmpl-modal-footer">
          <button className="tmpl-modal-save" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Saving…' : (existing ? 'Save Changes' : 'Create Workout Template')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── Import Plan Modal (paste text or screenshot → one template per day) ─────

interface DraftExercise { name: string; sets: number; reps: string }
interface DraftDay { dayName: string; exercises: DraftExercise[] }

function draftDaysFrom(parsed: ParsedPlanDay[]): DraftDay[] {
  return parsed.map(d => ({
    dayName: d.dayName,
    exercises: d.exercises.map(e => ({
      name: e.name,
      sets: e.sets.length,
      reps: String(e.sets[0]?.reps ?? 8),
    })),
  }))
}

function ImportPlanModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [tab, setTab] = useState<'text' | 'screenshot'>('text')
  const [text, setText] = useState('')
  const [status, setStatus] = useState<'input' | 'loading'>('input')
  const [days, setDays] = useState<DraftDay[] | null>(null)
  const [note, setNote] = useState('')
  const [showCamera, setShowCamera] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { listening, toggle: toggleListening, supported: speechSupported } = useSpeechToText(
    t => setText(d => (d ? `${d} ${t}` : t))
  )

  useScrollLock()
  const swipe = useSwipeToClose(onClose)

  function applyResult(result: WorkoutPlanParseResult) {
    if (result.days.length > 0) {
      setDays(draftDaysFrom(result.days))
      setNote('')
    } else {
      setNote(result.note || "Couldn't find a workout plan in that — try again, or build it manually with New Template.")
    }
    setStatus('input')
  }

  async function handleParseText() {
    if (!text.trim() || status === 'loading') return
    setStatus('loading')
    setNote('')
    applyResult(await parseWorkoutPlanText(text))
  }

  async function handleImage(file: File | Blob) {
    setShowCamera(false)
    setStatus('loading')
    setNote('')
    try {
      const dataUrl = await compressImageToDataUrl(file, 1800, 0.85)
      applyResult(await parseWorkoutPlanPhoto(dataUrl))
    } catch {
      setNote("Couldn't read that image — try again, or paste the text instead.")
      setStatus('input')
    }
  }

  function updateDay(i: number, patch: Partial<DraftDay>) {
    setDays(prev => prev && prev.map((d, di) => di === i ? { ...d, ...patch } : d))
  }

  function removeDay(i: number) {
    setDays(prev => prev && prev.filter((_, di) => di !== i))
  }

  function addDay() {
    setDays(prev => [...(prev ?? []), { dayName: `Day ${(prev?.length ?? 0) + 1}`, exercises: [{ name: '', sets: 3, reps: '8' }] }])
  }

  function updateExercise(dayIdx: number, exIdx: number, patch: Partial<DraftExercise>) {
    setDays(prev => prev && prev.map((d, di) => di !== dayIdx ? d : {
      ...d,
      exercises: d.exercises.map((e, ei) => ei === exIdx ? { ...e, ...patch } : e),
    }))
  }

  function addExerciseToDay(dayIdx: number) {
    setDays(prev => prev && prev.map((d, di) => di !== dayIdx ? d : {
      ...d,
      exercises: [...d.exercises, { name: '', sets: 3, reps: '8' }],
    }))
  }

  function removeExerciseFromDay(dayIdx: number, exIdx: number) {
    setDays(prev => prev && prev.map((d, di) => di !== dayIdx ? d : {
      ...d,
      exercises: d.exercises.filter((_, ei) => ei !== exIdx),
    }))
  }

  async function handleSaveAll() {
    if (!days || days.length === 0) return
    setSaving(true)
    try {
      for (const day of days) {
        const cleanedExercises = day.exercises
          .filter(ex => ex.name.trim())
          .map(ex => ({
            name: ex.name,
            sets: Array.from({ length: Math.max(1, ex.sets) }, () => ({ reps: parseInt(ex.reps) || 8, weightLbs: 0 })),
          }))
        if (cleanedExercises.length === 0) continue
        await saveTemplate({
          name: day.dayName.trim() || 'Workout',
          exercises: cleanedExercises,
          targetMuscles: [],
        })
      }
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="tmpl-modal-overlay" onClick={onClose}>
      <div className="tmpl-modal" onClick={e => e.stopPropagation()} style={swipe.style}>
        <div className="tmpl-modal-header" {...swipe.handlers}>
          <div className="modal-grabber" />
          <h2>Import Plan</h2>
          <button className="log-modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        {days === null && (
          <div className="import-tabs">
            <button className={tab === 'text' ? 'active' : ''} onClick={() => setTab('text')}>
              <FileText size={13} /> Paste Text
            </button>
            <button className={tab === 'screenshot' ? 'active' : ''} onClick={() => setTab('screenshot')}>
              <Camera size={13} /> Screenshot
            </button>
          </div>
        )}

        <div className="tmpl-modal-body">
          {days === null ? (
            <>
              {tab === 'text' && (
                <div className="import-text-tab">
                  <p className="import-tab-hint">
                    Paste your whole plan — day labels, exercises, sets/reps, whatever you have. It'll split into one template per day.
                  </p>
                  <div className="import-textarea-wrap">
                    <textarea
                      className="import-textarea"
                      rows={8}
                      placeholder={'e.g.\nDay 1 – Push\nBench Press 4x8\nShoulder Press 3x10\n\nDay 2 – Pull\nLat Pulldown 4x10\nBarbell Row 3x8'}
                      value={text}
                      onChange={e => setText(e.target.value)}
                      disabled={status === 'loading'}
                    />
                    {speechSupported && (
                      <button type="button" className={`import-mic-btn ${listening ? 'import-mic-btn--active' : ''}`}
                        onClick={toggleListening} aria-label={listening ? 'Stop dictating' : 'Dictate'} disabled={status === 'loading'}>
                        <Mic size={14} />
                      </button>
                    )}
                  </div>
                  {note && <p className="import-note">{note}</p>}
                  <button className="tmpl-modal-save" onClick={handleParseText} disabled={!text.trim() || status === 'loading'}>
                    {status === 'loading' ? <><Loader2 size={15} className="ai-spin" /> Reading plan…</> : <><Sparkles size={15} /> Parse Plan</>}
                  </button>
                </div>
              )}

              {tab === 'screenshot' && (
                <div className="import-screenshot-tab">
                  <p className="import-tab-hint">
                    Upload a screenshot of your plan (notes app, spreadsheet, PDF, text thread) or take a photo of a printed/handwritten one.
                  </p>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleImage(f) }} />
                  {status === 'loading' ? (
                    <div className="import-loading"><Loader2 size={18} className="ai-spin" /> Reading plan…</div>
                  ) : (
                    <>
                      <button className="tmpl-modal-save" onClick={() => fileRef.current?.click()}>
                        <Upload size={15} /> Upload Screenshot
                      </button>
                      <button className="import-secondary-btn" onClick={() => setShowCamera(true)}>
                        <Camera size={15} /> Take a Photo Instead
                      </button>
                    </>
                  )}
                  {note && <p className="import-note">{note}</p>}
                </div>
              )}
            </>
          ) : (
            <div className="import-review">
              {days.map((day, di) => (
                <div key={di} className="import-day-card">
                  <div className="import-day-header">
                    <input className="import-day-name-input" value={day.dayName}
                      onChange={e => updateDay(di, { dayName: e.target.value })} placeholder="Day name" />
                    <button className="tmpl-ex-remove" onClick={() => removeDay(di)} aria-label="Remove day"><X size={13} /></button>
                  </div>
                  <div className="tmpl-exercises-list">
                    {day.exercises.map((ex, ei) => (
                      <div key={ei} className="tmpl-exercise-edit">
                        <input
                          className="tmpl-ex-name-input"
                          list="import-exercise-datalist"
                          placeholder="Exercise name"
                          value={ex.name}
                          onChange={e => updateExercise(di, ei, { name: e.target.value })} />
                        <datalist id="import-exercise-datalist">
                          {ALL_EXERCISE_NAMES.map(n => <option key={n} value={n} />)}
                        </datalist>
                        <div className="tmpl-ex-sets-row">
                          <input className="tmpl-ex-num-input" type="number" inputMode="numeric"
                            title="Sets" min={1} max={20} value={ex.sets}
                            onChange={e => updateExercise(di, ei, { sets: +e.target.value })} />
                          <span className="tmpl-ex-sets-label">sets ×</span>
                          <input className="tmpl-ex-num-input" type="text"
                            title="Reps" placeholder="reps" value={ex.reps}
                            onChange={e => updateExercise(di, ei, { reps: e.target.value })} />
                        </div>
                        <button className="tmpl-ex-remove" onClick={() => removeExerciseFromDay(di, ei)} aria-label="Remove exercise"><X size={13} /></button>
                      </div>
                    ))}
                  </div>
                  <button className="import-add-ex-btn" onClick={() => addExerciseToDay(di)}>+ Add exercise</button>
                </div>
              ))}
              <button className="import-add-day-btn" onClick={addDay}>
                <Plus size={14} /> Add day
              </button>
            </div>
          )}
        </div>

        {days !== null && (
          <div className="tmpl-modal-footer">
            <button className="tmpl-modal-save" onClick={handleSaveAll} disabled={saving || days.length === 0}>
              {saving ? 'Saving…' : <><Check size={15} /> Save {days.length} Template{days.length !== 1 ? 's' : ''}</>}
            </button>
          </div>
        )}
      </div>

      {showCamera && (
        <LiveCamera onCapture={handleImage} onClose={() => setShowCamera(false)} />
      )}
    </div>,
    document.body
  )
}

// ─── Template Card ────────────────────────────────────────────────────────────

function TemplateCard({ t, onEdit, onDelete }: { t: WorkoutTemplate; onEdit: () => void; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const updatedDate = new Date(t.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <>
      <div className="template-card">
        <div className="template-card-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="template-card-name">{t.name}</div>
            <div className="template-card-meta">
              {t.exercises.length} exercise{t.exercises.length !== 1 ? 's' : ''}
              {t.estimatedDurationMin ? ` · ~${t.estimatedDurationMin} min` : ''}
              {' · Updated '}{updatedDate}
            </div>
          </div>
          <div className="template-card-actions">
            <button className="tmpl-action-btn" onClick={() => setExpanded(e => !e)}>
              {expanded ? 'Hide' : 'View'}
            </button>
            <button className="tmpl-action-btn" onClick={onEdit}>
              <Pencil size={12} /> Edit
            </button>
            <button className="tmpl-action-btn tmpl-action-btn--del" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        {expanded && (
          <div className="template-exercises">
            {t.exercises.map((ex, i) => (
              <div key={i} className="tmpl-exercise-row">
                <span className="tmpl-ex-name">{ex.name}</span>
                <span className="tmpl-ex-sets">
                  {ex.sets.length} sets
                  {ex.sets[0]?.reps ? ` × ${ex.sets[0].reps} reps` : ''}
                  {ex.sets[0]?.weightLbs ? ` @ ${ex.sets[0].weightLbs} lbs` : ''}
                </span>
              </div>
            ))}
            {t.notes && <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: '8px 0 0', fontStyle: 'italic' }}>{t.notes}</p>}
          </div>
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          message={`Delete template "${t.name}"? This cannot be undone.`}
          onConfirm={() => { setConfirmDelete(false); onDelete() }}
          onCancel={() => setConfirmDelete(false)} />
      )}
    </>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WorkoutTemplatesPage() {
  const [templates,    setTemplates]   = useState<WorkoutTemplate[]>([])
  const [showModal,    setShowModal]   = useState(false)
  const [showImport,   setShowImport]  = useState(false)
  const [editTemplate, setEditTemplate] = useState<WorkoutTemplate | null>(null)
  const [search,       setSearch]      = useState('')

  const load = useCallback(async () => {
    const all = await getTemplates()
    setTemplates(all)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleDelete(id: string) {
    await deleteTemplate(id)
    load()
  }

  function handleEdit(t: WorkoutTemplate) {
    setEditTemplate(t)
    setShowModal(true)
  }

  const filtered = search.trim()
    ? templates.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
    : templates

  return (
    <div className="templates-page">
      <WorkoutsSubNav />

      <header className="page-header" style={{ marginTop: 8 }}>
        <div>
          <h1 className="page-title">Templates</h1>
          <p className="page-subtitle">{templates.length} saved template{templates.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="tmpl-header-actions">
          {isAiWorkoutParsingAvailable && (
            <button className="tmpl-import-btn" onClick={() => setShowImport(true)}>
              <Sparkles size={16} /> Import Plan
            </button>
          )}
          <button className="log-workout-btn" onClick={() => { setEditTemplate(null); setShowModal(true) }}>
            <Plus size={16} /> New Template
          </button>
        </div>
      </header>

      {templates.length > 4 && (
        <input
          className="log-title-input"
          style={{ marginBottom: 16 }}
          placeholder="Search templates…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      )}

      {filtered.length > 0 ? (
        filtered.map(t => (
          <TemplateCard key={t.id} t={t}
            onEdit={() => handleEdit(t)}
            onDelete={() => handleDelete(t.id)} />
        ))
      ) : templates.length === 0 ? (
        <div className="tmpl-empty">
          <div className="tmpl-empty-icon">📋</div>
          <p>No templates yet.</p>
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
            Create a template to quickly load your favorite workouts, or save a logged workout as a template from the Log tab.
          </p>
          <button className="tmpl-create-btn" onClick={() => { setEditTemplate(null); setShowModal(true) }}>
            Create Workout Template
          </button>
          {isAiWorkoutParsingAvailable && (
            <button className="tmpl-import-btn" style={{ marginTop: 10 }} onClick={() => setShowImport(true)}>
              <Sparkles size={15} /> Import a Plan Instead
            </button>
          )}
        </div>
      ) : (
        <div className="tmpl-empty">
          <p style={{ color: 'var(--text-tertiary)' }}>No templates match "{search}"</p>
        </div>
      )}

      {(showModal || editTemplate) && (
        <TemplateModal
          existing={editTemplate ?? undefined}
          onClose={() => { setShowModal(false); setEditTemplate(null) }}
          onSaved={load} />
      )}

      {showImport && (
        <ImportPlanModal
          onClose={() => setShowImport(false)}
          onSaved={load} />
      )}
    </div>
  )
}
