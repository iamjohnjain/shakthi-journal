import { useState, useEffect, useCallback } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Plus, Pencil, Trash2, LayoutTemplate, Dumbbell, BookOpen, TrendingUp,
  CalendarDays, X, AlertTriangle, Clock,
} from 'lucide-react'
import { getTemplates, saveTemplate, updateTemplate, deleteTemplate } from '../db/templateStore'
import type { WorkoutTemplate } from '../db/templateStore'
import { EXERCISE_LIBRARY } from '../db/workoutStore'
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

  return (
    <div className="tmpl-modal-overlay" onClick={onClose}>
      <div className="tmpl-modal" onClick={e => e.stopPropagation()}>
        <div className="tmpl-modal-header">
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
            <input type="number" className="log-num-input" min={10} max={240} step={5}
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
                    list="tmpl-exercise-datalist"
                    placeholder="Exercise name"
                    value={ex.name}
                    onChange={e => updateExercise(i, { name: e.target.value })} />
                  <datalist id="tmpl-exercise-datalist">
                    {ALL_EXERCISE_NAMES.map(n => <option key={n} value={n} />)}
                  </datalist>
                  <input type="number" style={{ width: 44, textAlign: 'center', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 6, padding: '4px', fontSize: 13 }}
                    title="Sets" min={1} max={20} value={ex.sets}
                    onChange={e => updateExercise(i, { sets: +e.target.value })} />
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>sets ×</span>
                  <input type="text" style={{ width: 44, textAlign: 'center', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 6, padding: '4px', fontSize: 13 }}
                    title="Reps" placeholder="reps" value={ex.reps}
                    onChange={e => updateExercise(i, { reps: e.target.value })} />
                  <button className="tmpl-ex-remove" onClick={() => removeExercise(i)}><X size={13} /></button>
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
            {saving ? 'Saving…' : (existing ? 'Save Changes' : 'Create Template')}
          </button>
        </div>
      </div>
    </div>
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
        <button className="log-workout-btn" onClick={() => { setEditTemplate(null); setShowModal(true) }}>
          <Plus size={16} /> New Template
        </button>
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
            Create first template
          </button>
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
    </div>
  )
}
