import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  Plus, Pencil, Trash2,
  X, AlertTriangle, Sparkles, FileText, Camera, Upload, Mic, Loader2, Check,
} from 'lucide-react'
import { getTemplates, saveTemplate, deleteTemplate } from '../db/templateStore'
import type { WorkoutTemplate } from '../db/templateStore'
import { EXERCISE_LIBRARY } from '../db/workoutStore'
import { getAllExerciseNames, capitalizeExerciseName, rememberCustomExercise } from '../db/trainingStore'
import { useScrollLock } from '../hooks/useScrollLock'
import { useSwipeToClose } from '../hooks/useSwipeToClose'
import { useSpeechToText } from '../hooks/useSpeechToText'
import { parseWorkoutPlanText, parseWorkoutPlanPhoto, parseWorkoutPlanImages, isAiWorkoutParsingAvailable } from '../lib/aiWorkoutParser'
import type { ParsedPlanDay, WorkoutPlanParseResult } from '../lib/aiWorkoutParser'
import { compressImageToDataUrl } from '../lib/imageUtils'
import LiveCamera from '../components/LiveCamera'
import WorkoutsSubNav from '../components/WorkoutsSubNav'
import TemplateModal from '../components/TemplateModal'
import './WorkoutsPage.css'

const ALL_EXERCISE_NAMES = EXERCISE_LIBRARY.map(e => e.name)

// ─── Sub-nav ──────────────────────────────────────────────────────────────────

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
  const [tab, setTab] = useState<'text' | 'file'>('text')
  const [text, setText] = useState('')
  const [status, setStatus] = useState<'input' | 'loading'>('input')
  const [days, setDays] = useState<DraftDay[] | null>(null)
  const [note, setNote] = useState('')
  const [showCamera, setShowCamera] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const { listening, toggle: toggleListening, supported: speechSupported } = useSpeechToText(
    t => setText(d => (d ? `${d} ${t}` : t))
  )

  useScrollLock()
  const swipe = useSwipeToClose(onClose)

  useEffect(() => () => { if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl) }, [pendingPreviewUrl])

  const [exerciseNames, setExerciseNames] = useState<string[]>(ALL_EXERCISE_NAMES)
  useEffect(() => { getAllExerciseNames().then(setExerciseNames) }, [])

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

  /** From the live camera — always a photo, so it always goes through the
      vision path. Used for a printed/handwritten plan with no digital file. */
  async function handlePhoto(blob: Blob) {
    setShowCamera(false)
    setStatus('loading')
    setNote('')
    try {
      const dataUrl = await compressImageToDataUrl(blob, 1800, 0.85)
      applyResult(await parseWorkoutPlanPhoto(dataUrl))
    } catch {
      setNote("Couldn't read that photo — try again, or paste the text instead.")
      setStatus('input')
    }
  }

  /** From the file picker — a trainer's plan could be a PDF, a Word doc, a
      plain text/CSV export, or an image (screenshot of a notes app, a
      photo of a printed page). `extractFileContent` normalizes whichever
      it is into text or an image, and this routes to the matching parser. */
  async function handleFile(file: File) {
    setStatus('loading')
    setNote('')
    try {
      // Dynamically imported — pdfjs-dist/mammoth are heavy and most users
      // never open this modal, let alone pick a PDF/DOCX, so they shouldn't
      // be in the main bundle everyone downloads on every page load.
      const { extractFileContent } = await import('../lib/fileTextExtract')
      const extracted = await extractFileContent(file)
      if (!extracted) {
        setNote("Couldn't read that file format — try a PDF, Word doc, text file, or screenshot instead.")
        setStatus('input')
        return
      }
      applyResult(extracted.kind === 'text'
        ? await parseWorkoutPlanText(extracted.text)
        : await parseWorkoutPlanImages(extracted.dataUrls))
    } catch {
      setNote("Couldn't read that file — try again, or paste the text instead.")
      setStatus('input')
    }
  }

  /** A file picker's native OS dialog can be ambiguous about which file
      actually got chosen (similarly-named files, a long list, a misclick)
      — so hold the selection in a confirm-first preview instead of running
      it the instant it's picked, same as the live camera already shows a
      viewfinder before capturing. */
  function selectPendingFile(file: File) {
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl)
    setPendingFile(file)
    setPendingPreviewUrl(file.type.startsWith('image/') ? URL.createObjectURL(file) : null)
    setNote('')
  }

  function clearPendingFile() {
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl)
    setPendingFile(null)
    setPendingPreviewUrl(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  function confirmPendingFile() {
    if (!pendingFile) return
    const file = pendingFile
    clearPendingFile()
    handleFile(file)
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
            name: capitalizeExerciseName(ex.name),
            sets: Array.from({ length: Math.max(1, ex.sets) }, () => ({ reps: parseInt(ex.reps) || 8, weightLbs: 0 })),
          }))
        if (cleanedExercises.length === 0) continue
        await saveTemplate({
          name: day.dayName.trim() || 'Workout',
          exercises: cleanedExercises,
          targetMuscles: [],
        })
        void Promise.all(cleanedExercises.map(ex => rememberCustomExercise(ex.name)))
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
          <h2>Import Workout Template</h2>
          <button className="log-modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        {days === null && (
          <div className="import-tabs">
            <button className={tab === 'text' ? 'active' : ''} onClick={() => setTab('text')}>
              <FileText size={13} /> Paste Text
            </button>
            <button className={tab === 'file' ? 'active' : ''} onClick={() => setTab('file')}>
              <Upload size={13} /> Upload File
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
                    {status === 'loading' ? <><Loader2 size={15} className="ai-spin" /> Reading plan…</> : <><Sparkles size={15} /> Create Template</>}
                  </button>
                </div>
              )}

              {tab === 'file' && (
                <div className="import-screenshot-tab">
                  <p className="import-tab-hint">
                    Upload the file your trainer sent — a PDF, a Word doc, a text/CSV export, or a screenshot — or take a photo of a printed/handwritten plan.
                  </p>
                  <input ref={fileRef} type="file"
                    accept="image/*,.pdf,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.txt,.csv,.md,text/plain,text/csv"
                    style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) selectPendingFile(f) }} />

                  {pendingFile ? (
                    <div className="import-file-preview">
                      {pendingPreviewUrl ? (
                        <img className="import-file-preview-thumb" src={pendingPreviewUrl} alt="" />
                      ) : (
                        <div className="import-file-preview-icon"><FileText size={22} /></div>
                      )}
                      <div className="import-file-preview-info">
                        <span className="import-file-preview-name">{pendingFile.name}</span>
                        <span className="import-file-preview-size">{(pendingFile.size / 1024).toFixed(0)} KB</span>
                      </div>
                    </div>
                  ) : null}

                  {status === 'loading' ? (
                    <div className="import-loading"><Loader2 size={18} className="ai-spin" /> Reading plan…</div>
                  ) : pendingFile ? (
                    <>
                      <button className="tmpl-modal-save" onClick={confirmPendingFile}>
                        <Check size={15} /> Use This File
                      </button>
                      <button className="import-secondary-btn" onClick={() => fileRef.current?.click()}>
                        Choose a Different File
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="tmpl-modal-save" onClick={() => fileRef.current?.click()}>
                        <Upload size={15} /> Upload File
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
                          onChange={e => updateExercise(di, ei, { name: e.target.value })}
                          onBlur={e => { if (e.target.value.trim()) updateExercise(di, ei, { name: capitalizeExerciseName(e.target.value) }) }} />
                        <datalist id="import-exercise-datalist">
                          {exerciseNames.map(n => <option key={n} value={n} />)}
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
        <LiveCamera onCapture={handlePhoto} onClose={() => setShowCamera(false)} />
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
              <Sparkles size={16} /> Import Workout Template
            </button>
          )}
          <button className="log-workout-btn" onClick={() => { setEditTemplate(null); setShowModal(true) }}>
            <Plus size={16} /> Create Template
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
              <Sparkles size={15} /> Import Workout Template
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
