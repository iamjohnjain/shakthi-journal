import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  Plus, X, Sparkles, FileText, Camera, Upload, PenLine, Loader2, Check, Mic,
} from 'lucide-react'
import { saveTemplate } from '../db/templateStore'
import { EXERCISE_LIBRARY } from '../db/workoutStore'
import { getAllExerciseNames, capitalizeExerciseName, rememberCustomExercise } from '../db/trainingStore'
import { useScrollLock } from '../hooks/useScrollLock'
import { useSwipeToClose } from '../hooks/useSwipeToClose'
import { useVoiceDictation } from '../hooks/useVoiceDictation'
import { parseWorkoutPlanText, parseWorkoutPlanPhoto, parseWorkoutPlanImages } from '../lib/aiWorkoutParser'
import type { ParsedPlanDay, WorkoutPlanParseResult } from '../lib/aiWorkoutParser'
import { compressImageToDataUrl } from '../lib/imageUtils'
import LiveCamera from './LiveCamera'
import VoiceListeningOverlay from './VoiceListeningOverlay'
import '../pages/WorkoutsPage.css'

const ALL_EXERCISE_NAMES = EXERCISE_LIBRARY.map(e => e.name)

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

/** The single "✨ Create Workout Template" entry point — replaces what used
    to be two separate actions (a plain "Create Template" button and a
    separate "Import Workout Template" button/page). Manual building still
    uses the existing TemplateModal form (unchanged) — picking that tab here
    just hands off to it via `onOpenManual` rather than duplicating it — so
    this component owns only the two AI-assisted paths: paste text, or
    upload a file/photo. Directly adapted from the former
    WorkoutTemplatesPage.tsx's ImportPlanModal, now reachable from the
    Today page instead of a dedicated route, with voice dictation swapped
    to the Groq-Whisper-backed useVoiceDictation (the old browser
    SpeechRecognition hook didn't work reliably in this app's real
    environment — see useVoiceDictation's own doc comment). */
export default function CreateTemplateModal({ onClose, onSaved, onOpenManual }: {
  onClose: () => void
  onSaved: () => void
  onOpenManual: () => void
}) {
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
  const { listening, phase: micPhase, stream: micStream, toggle: toggleListening, supported: speechSupported } = useVoiceDictation(
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
      setNote(result.note || "Couldn't find a workout plan in that — try again, or build it manually instead.")
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
          <h2><Sparkles size={16} style={{ verticalAlign: -2, marginRight: 6 }} />Create Workout Template</h2>
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
            <button onClick={onOpenManual}>
              <PenLine size={13} /> Manual
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
                      placeholder={'e.x.\nDay 1: Push - Bench Press, Shoulder Press\nDay 2: Pull - Lat Pulldown, Barbell Row'}
                      value={text}
                      onChange={e => setText(e.target.value)}
                      disabled={status === 'loading'}
                    />
                    {speechSupported && (
                      <button type="button" className={`import-mic-btn ${listening ? 'import-mic-btn--active' : ''}`}
                        onClick={toggleListening} aria-label="Dictate" disabled={status === 'loading'}>
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
      {listening && (
        <VoiceListeningOverlay stream={micStream} phase={micPhase} onStop={toggleListening} />
      )}
    </div>,
    document.body
  )
}
