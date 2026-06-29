import { useState, useEffect, useCallback } from 'react'
import { NavLink } from 'react-router-dom'
import { Search, Star, Plus, Pencil, Trash2, Dumbbell, BookOpen, TrendingUp, CalendarDays, Check, X, Clock, LayoutTemplate } from 'lucide-react'
import {
  getExerciseLibrary, saveExerciseLibraryEntry, deleteExerciseLibraryEntry,
  toggleExerciseFavorite, seedExerciseLibraryIfEmpty,
} from '../db/trainingStore'
import type { ExerciseLibraryEntry } from '../db/trainingStore'
import './ExerciseLibraryPage.css'

const MUSCLE_GROUPS = [
  'All','Chest','Back','Shoulders','Arms','Biceps','Triceps',
  'Rear Delts','Core','Quads','Hamstrings','Glutes','Calves','Full Body',
]
const MOVEMENT_PATTERNS = ['All','push','pull','hinge','squat','carry','core','plyometric','cardio'] as const
const EQUIPMENT_FILTER  = ['All','barbell','dumbbell','machine','cable','smith','bodyweight']

function SubNav() {
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

const EMPTY_ENTRY: Omit<ExerciseLibraryEntry,'id'|'createdAt'> = {
  name: '', primaryMuscles: [], secondaryMuscles: [], equipment: [],
  movementPattern: 'push', goalCategories: [], defaultSets: 3, defaultReps: '10',
  isFavorite: false, isCustom: true,
}

function ExerciseCard({
  entry, onFavorite, onEdit, onDelete,
}: {
  entry: ExerciseLibraryEntry
  onFavorite: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className={`ex-card ${entry.isFavorite ? 'ex-card--fav' : ''}`}>
      <div className="ex-card-top">
        <div className="ex-card-info">
          <div className="ex-card-name">{entry.name}</div>
          <div className="ex-card-muscles">
            {entry.primaryMuscles.join(', ')}
            {entry.secondaryMuscles.length > 0 && (
              <span className="ex-card-secondary"> · {entry.secondaryMuscles.slice(0,2).join(', ')}</span>
            )}
          </div>
          <div className="ex-card-tags">
            <span className="ex-tag ex-tag--pattern">{entry.movementPattern}</span>
            {entry.equipment.slice(0,2).map(eq => (
              <span key={eq} className="ex-tag">{eq}</span>
            ))}
            {entry.isCustom && <span className="ex-tag ex-tag--custom">Custom</span>}
          </div>
        </div>
        <div className="ex-card-actions">
          <button className={`ex-fav-btn ${entry.isFavorite ? 'ex-fav-btn--on' : ''}`}
            onClick={onFavorite} aria-label="Favorite">
            <Star size={15} fill={entry.isFavorite ? 'currentColor' : 'none'} />
          </button>
          {entry.isCustom && (
            <>
              <button className="ex-icon-btn" onClick={onEdit}><Pencil size={13} /></button>
              <button className="ex-icon-btn ex-icon-btn--del" onClick={onDelete}><Trash2 size={13} /></button>
            </>
          )}
        </div>
      </div>
      <div className="ex-card-defaults">Default: {entry.defaultSets}×{entry.defaultReps}</div>
    </div>
  )
}

function EditModal({
  initial, onSave, onClose,
}: {
  initial: Omit<ExerciseLibraryEntry,'id'|'createdAt'>
  onSave: (e: Omit<ExerciseLibraryEntry,'id'|'createdAt'>) => void
  onClose: () => void
}) {
  const [form, setForm] = useState(initial)

  return (
    <div className="ex-modal-overlay" onClick={onClose}>
      <div className="ex-modal" onClick={e => e.stopPropagation()}>
        <div className="ex-modal-header">
          <span className="ex-modal-title">{initial.name ? 'Edit Exercise' : 'Add Exercise'}</span>
          <button className="ex-modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="ex-modal-body">
          <label className="ex-form-label">Name</label>
          <input className="ex-form-input" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Exercise name" />

          <label className="ex-form-label">Primary Muscles (comma-separated)</label>
          <input className="ex-form-input" value={form.primaryMuscles.join(', ')}
            onChange={e => setForm(f => ({ ...f, primaryMuscles: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
            placeholder="Chest, Triceps" />

          <label className="ex-form-label">Secondary Muscles (optional)</label>
          <input className="ex-form-input" value={form.secondaryMuscles.join(', ')}
            onChange={e => setForm(f => ({ ...f, secondaryMuscles: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
            placeholder="Shoulders, Core" />

          <label className="ex-form-label">Equipment (comma-separated)</label>
          <input className="ex-form-input" value={form.equipment.join(', ')}
            onChange={e => setForm(f => ({ ...f, equipment: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
            placeholder="barbell, dumbbell" />

          <div className="ex-form-row">
            <div>
              <label className="ex-form-label">Movement Pattern</label>
              <select className="ex-form-select" value={form.movementPattern}
                onChange={e => setForm(f => ({ ...f, movementPattern: e.target.value as ExerciseLibraryEntry['movementPattern'] }))}>
                {MOVEMENT_PATTERNS.filter(p => p !== 'All').map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="ex-form-label">Default Sets × Reps</label>
              <div className="ex-form-row-inner">
                <input type="number" className="ex-form-input ex-form-input--sm" value={form.defaultSets} min={1} max={10}
                  onChange={e => setForm(f => ({ ...f, defaultSets: +e.target.value }))} />
                <span className="ex-form-x">×</span>
                <input className="ex-form-input ex-form-input--sm" value={form.defaultReps}
                  onChange={e => setForm(f => ({ ...f, defaultReps: e.target.value }))} placeholder="10" />
              </div>
            </div>
          </div>
        </div>
        <div className="ex-modal-footer">
          <button className="ex-save-btn" onClick={() => onSave(form)} disabled={!form.name.trim()}>
            <Check size={14} /> Save Exercise
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ExerciseLibraryPage() {
  const [exercises, setExercises] = useState<ExerciseLibraryEntry[]>([])
  const [query,     setQuery]     = useState('')
  const [muscle,    setMuscle]    = useState('All')
  const [pattern,   setPattern]   = useState('All')
  const [equip,     setEquip]     = useState('All')
  const [editing,   setEditing]   = useState<ExerciseLibraryEntry | 'new' | null>(null)

  const load = useCallback(async () => {
    await seedExerciseLibraryIfEmpty()
    const all = await getExerciseLibrary()
    setExercises(all)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = exercises.filter(ex => {
    const q = query.toLowerCase()
    if (q && !ex.name.toLowerCase().includes(q) &&
        !ex.primaryMuscles.some(m => m.toLowerCase().includes(q))) return false
    if (muscle !== 'All' && !ex.primaryMuscles.includes(muscle) && !ex.secondaryMuscles.includes(muscle)) return false
    if (pattern !== 'All' && ex.movementPattern !== pattern) return false
    if (equip !== 'All' && !ex.equipment.includes(equip)) return false
    return true
  })

  const favorites = filtered.filter(e => e.isFavorite)
  const rest      = filtered.filter(e => !e.isFavorite)

  async function handleFavorite(id: string) {
    await toggleExerciseFavorite(id)
    load()
  }

  async function handleDelete(id: string) {
    await deleteExerciseLibraryEntry(id)
    load()
  }

  async function handleSave(form: Omit<ExerciseLibraryEntry,'id'|'createdAt'>) {
    const now = new Date().toISOString()
    if (editing === 'new') {
      const id = `ex_${Date.now()}_${Math.random().toString(36).slice(2,6)}`
      await saveExerciseLibraryEntry({ ...form, id, createdAt: now })
    } else if (editing) {
      await saveExerciseLibraryEntry({ ...form, id: editing.id, createdAt: editing.createdAt })
    }
    setEditing(null)
    load()
  }

  const editInitial = editing === 'new' ? EMPTY_ENTRY : editing ? {
    name: editing.name, primaryMuscles: editing.primaryMuscles, secondaryMuscles: editing.secondaryMuscles,
    equipment: editing.equipment, movementPattern: editing.movementPattern, goalCategories: editing.goalCategories,
    defaultSets: editing.defaultSets, defaultReps: editing.defaultReps, isFavorite: editing.isFavorite, isCustom: true,
  } : null

  return (
    <div className="exercise-library-page">
      <SubNav />

      <header className="page-header">
        <div>
          <h1 className="page-title">Exercise Library</h1>
          <p className="page-subtitle">{exercises.length} exercises · {exercises.filter(e => e.isCustom).length} custom</p>
        </div>
        <button className="ex-add-btn" onClick={() => setEditing('new')}>
          <Plus size={15} /> Add
        </button>
      </header>

      {/* Search */}
      <div className="ex-search-wrap">
        <Search size={14} className="ex-search-icon" />
        <input className="ex-search" placeholder="Search exercises…" value={query}
          onChange={e => setQuery(e.target.value)} />
      </div>

      {/* Filters */}
      <div className="ex-filters">
        <div className="ex-filter-row">
          <span className="ex-filter-label">Muscle</span>
          <div className="ex-filter-chips">
            {MUSCLE_GROUPS.slice(0, 8).map(m => (
              <button key={m} className={`ex-filter-chip ${muscle === m ? 'ex-filter-chip--on' : ''}`}
                onClick={() => setMuscle(m)}>{m}</button>
            ))}
          </div>
        </div>
        <div className="ex-filter-row">
          <span className="ex-filter-label">Pattern</span>
          <div className="ex-filter-chips">
            {(['All','push','pull','hinge','squat','core','plyometric'] as const).map(p => (
              <button key={p} className={`ex-filter-chip ${pattern === p ? 'ex-filter-chip--on' : ''}`}
                onClick={() => setPattern(p)}>{p}</button>
            ))}
          </div>
        </div>
        <div className="ex-filter-row">
          <span className="ex-filter-label">Equipment</span>
          <div className="ex-filter-chips">
            {EQUIPMENT_FILTER.map(e => (
              <button key={e} className={`ex-filter-chip ${equip === e ? 'ex-filter-chip--on' : ''}`}
                onClick={() => setEquip(e)}>{e}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="ex-count">{filtered.length} of {exercises.length} exercises</div>

      {favorites.length > 0 && (
        <section className="ex-section">
          <h2 className="ex-section-title">Favorites</h2>
          {favorites.map(ex => (
            <ExerciseCard key={ex.id} entry={ex}
              onFavorite={() => handleFavorite(ex.id)}
              onEdit={() => setEditing(ex)}
              onDelete={() => handleDelete(ex.id)} />
          ))}
        </section>
      )}

      {rest.length > 0 && (
        <section className="ex-section">
          {favorites.length > 0 && <h2 className="ex-section-title">All Exercises</h2>}
          {rest.map(ex => (
            <ExerciseCard key={ex.id} entry={ex}
              onFavorite={() => handleFavorite(ex.id)}
              onEdit={() => setEditing(ex)}
              onDelete={() => handleDelete(ex.id)} />
          ))}
        </section>
      )}

      {filtered.length === 0 && (
        <div className="ex-empty">
          <p>No exercises match your filters.</p>
          <button className="ex-add-btn" onClick={() => setEditing('new')}><Plus size={15} /> Add Custom Exercise</button>
        </div>
      )}

      {editing !== null && editInitial && (
        <EditModal initial={editInitial} onSave={handleSave} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}
