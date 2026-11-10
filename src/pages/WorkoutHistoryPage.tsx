import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useNavigate } from 'react-router-dom'
import { Dumbbell, ChevronDown, X, Pencil, LayoutTemplate, Check } from 'lucide-react'
import { getDB } from '../db'
import type { WorkoutSession } from '../db'
import { CARDIO_SUBTYPES } from '../db/workoutStore'
import { workoutToTemplate } from '../db/templateStore'
import { regionsForExerciseNames, REGION_LABEL } from '../lib/muscleMap'
import { useMuscleLoad } from '../hooks/useMuscleLoad'
import { localDateStr, addLocalDays } from '../data/config'
import WorkoutsSubNav from '../components/WorkoutsSubNav'
import MuscleHeatmapSection from '../components/MuscleHeatmapSection'
import './WorkoutsPage.css'
import './WorkoutHistoryPage.css'

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

function workoutTypeLabel(w: WorkoutSession): string {
  if (w.type === 'lifting') return 'Lifting'
  if (w.cardioSubtype) {
    const sub = CARDIO_SUBTYPES.find(s => s.id === w.cardioSubtype)
    return sub?.label ?? w.cardioSubtype
  }
  return w.type.charAt(0).toUpperCase() + w.type.slice(1)
}

function workoutEmoji(w: WorkoutSession): string {
  if (w.type === 'lifting') return '🏋️'
  const emojiMap: Record<string, string> = {
    running: '🏃', walking: '🚶', cycling: '🚴', stairmaster: '🪜',
    basketball: '🏀', volleyball: '🏐', sports: '⚽',
    mobility: '🧘', 'recovery-walk': '🚶', hiit: '⚡', 'other-cardio': '💪',
  }
  return emojiMap[w.cardioSubtype ?? ''] ?? '🏃'
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

type MonthGroup = { key: string; label: string; dates: { date: string; workouts: WorkoutSession[] }[] }

function trainedRegions(w: WorkoutSession): string[] {
  if (w.type !== 'lifting' || !w.exercises?.length) return []
  const names = w.exercises.filter(ex => !ex.isBreak).map(ex => ex.name)
  return regionsForExerciseNames(names).map(r => REGION_LABEL[r])
}

// ─── Detail / edit / save-as-template popup ──────────────────────────────────

function WorkoutDetailModal({ workout, onClose }: { workout: WorkoutSession; onClose: () => void }) {
  const navigate = useNavigate()
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [templateName, setTemplateName] = useState(workout.title || '')
  const [templateSaved, setTemplateSaved] = useState(false)

  // "What's missing this week" — a forward-looking gap check (the last 7
  // days ending today), not scoped to the viewed workout's own week, since
  // the point is helping the user fill gaps in their *current* plan.
  const today = localDateStr()
  const { regions: weekRegions, loading: gapsLoading } = useMuscleLoad({ start: addLocalDays(today, -6), end: today })
  // Only true zero-coverage muscles count as a "gap" — a muscle sitting at
  // 'under' already has some real volume this week, just not a full target's
  // worth, which isn't the same thing as "neglected" and would be confusing
  // to list right next to the chips for muscles this very workout just hit.
  const gaps = gapsLoading ? [] : (Object.entries(weekRegions) as [keyof typeof weekRegions, typeof weekRegions[keyof typeof weekRegions]][])
    .filter(([, load]) => load.status === 'none')
    .map(([region]) => REGION_LABEL[region])

  const regions = trainedRegions(workout)
  const exercises = workout.exercises?.filter(ex => !ex.isBreak) ?? []

  async function handleSaveTemplate() {
    if (!templateName.trim() || exercises.length === 0) return
    await workoutToTemplate(templateName.trim(), exercises, { targetMuscles: regions })
    setTemplateSaved(true)
    setTimeout(() => { setSavingTemplate(false); setTemplateSaved(false) }, 1400)
  }

  return createPortal(
    <div className="wkh-detail-overlay" onClick={onClose}>
      <div className="wkh-detail-modal" onClick={e => e.stopPropagation()}>
        <div className="wkh-detail-header">
          <div>
            <h2>{workout.title || workoutTypeLabel(workout)}</h2>
            <p>{formatDate(workout.date)}{workout.durationMin ? ` · ${workout.durationMin}min` : ''}</p>
          </div>
          <button className="wkh-detail-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="wkh-detail-body">
          {regions.length > 0 && (
            <div className="wkh-detail-regions">
              {regions.map(r => <span key={r} className="wkh-region-chip">{r}</span>)}
            </div>
          )}

          {exercises.length > 0 ? (
            <div className="wkh-detail-exercises">
              {exercises.map((ex, i) => (
                <div key={i} className="wkh-detail-exercise">
                  <span className="wkh-detail-exercise-name">{ex.name}</span>
                  <div className="wkh-detail-sets">
                    {ex.sets.map((s, j) => (
                      <span key={j} className={`wkh-detail-set ${s.isWarmup ? 'wkh-detail-set--warmup' : ''}`}>
                        {s.weightLbs}lb × {s.reps}{s.isPR ? ' 🏆' : ''}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="wkh-detail-empty">No exercises logged for this session.</p>
          )}

          {!gapsLoading && gaps.length > 0 && (
            <div className="wkh-detail-gaps">
              <strong>Not covered this week:</strong> {gaps.join(', ')}
            </div>
          )}

          <div className="wkh-detail-actions">
            <button className="wkh-detail-btn" onClick={() => navigate(`/workouts?date=${workout.date}`)}>
              <Pencil size={14} /> Edit this workout
            </button>
            {exercises.length > 0 && (
              <button className="wkh-detail-btn wkh-detail-btn--primary" onClick={() => setSavingTemplate(true)}>
                <LayoutTemplate size={14} /> Save as template
              </button>
            )}
          </div>

          {savingTemplate && (
            <div className="wkh-detail-tmpl-form">
              {templateSaved ? (
                <span className="wkh-detail-tmpl-saved"><Check size={14} /> Saved as template!</span>
              ) : (
                <>
                  <input
                    value={templateName}
                    onChange={e => setTemplateName(e.target.value)}
                    placeholder="Template name"
                    autoFocus
                  />
                  <button className="wkh-detail-btn wkh-detail-btn--primary" onClick={handleSaveTemplate} disabled={!templateName.trim()}>
                    Save
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

export default function WorkoutHistoryPage() {
  const [groups, setGroups] = useState<MonthGroup[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [selectedWorkout, setSelectedWorkout] = useState<WorkoutSession | null>(null)

  useEffect(() => {
    async function load() {
      const db = await getDB()
      const all = await db.getAll('workouts') as WorkoutSession[]
      all.sort((a, b) => b.date.localeCompare(a.date))

      const byDate = new Map<string, WorkoutSession[]>()
      for (const w of all) {
        if (!byDate.has(w.date)) byDate.set(w.date, [])
        byDate.get(w.date)!.push(w)
      }

      const byMonth = new Map<string, { date: string; workouts: WorkoutSession[] }[]>()
      for (const [date, workouts] of byDate) {
        const monthKey = date.slice(0, 7)
        if (!byMonth.has(monthKey)) byMonth.set(monthKey, [])
        byMonth.get(monthKey)!.push({ date, workouts })
      }

      const result: MonthGroup[] = []
      for (const [key, dates] of byMonth) {
        const [year, month] = key.split('-').map(Number)
        result.push({ key, label: `${MONTH_NAMES[month - 1]} ${year}`, dates })
      }

      setGroups(result)
      if (result.length > 0) {
        setExpanded(new Set([result[0].key]))
      }
      setLoading(false)
    }
    load()
  }, [])

  function toggleMonth(key: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="workouts-page">
      <WorkoutsSubNav />

      <header className="page-header">
        <div>
          <h1 className="page-title">History</h1>
          <p className="page-subtitle">All logged sessions</p>
        </div>
      </header>

      <MuscleHeatmapSection />

      {loading && <p className="workout-history-empty">Loading…</p>}

      {!loading && groups.length === 0 && (
        <div className="workout-history-empty">
          <Dumbbell size={32} style={{ opacity: 0.25, marginBottom: 12 }} />
          <p>No workouts logged yet.</p>
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
            Head to <NavLink to="/workouts" style={{ color: 'var(--blue)' }}>Today</NavLink> to log your first session.
          </p>
        </div>
      )}

      {groups.map(group => {
        const isOpen = expanded.has(group.key)
        const totalSessions = group.dates.reduce((n, d) => n + d.workouts.length, 0)
        return (
          <div key={group.key} className="workout-history-month">
            <button className="workout-history-month-header" onClick={() => toggleMonth(group.key)}>
              <span className="workout-history-month-label">{group.label}</span>
              <span className="workout-history-month-count">{totalSessions} session{totalSessions !== 1 ? 's' : ''}</span>
              <ChevronDown
                size={16}
                style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s', flexShrink: 0 }}
              />
            </button>

            {isOpen && group.dates.map(({ date, workouts }) => (
              <div key={date} className="workout-history-day">
                <div className="workout-history-day-label">{formatDate(date)}</div>
                {workouts.map(w => {
                  const regions = trainedRegions(w)
                  return (
                    <button key={w.id} className="workout-history-card" onClick={() => setSelectedWorkout(w)}>
                      <span className="workout-history-emoji">{workoutEmoji(w)}</span>
                      <div className="workout-history-info">
                        <span className="workout-history-name">{w.title || workoutTypeLabel(w)}</span>
                        <span className="workout-history-meta">
                          {workoutTypeLabel(w)}
                          {w.durationMin ? ` · ${w.durationMin}min` : ''}
                          {w.exercises?.length ? ` · ${w.exercises.length} exercise${w.exercises.length !== 1 ? 's' : ''}` : ''}
                        </span>
                        {regions.length > 0 && (
                          <span className="workout-history-regions">{regions.join(' · ')}</span>
                        )}
                      </div>
                      {w.exercises?.some(ex => ex.sets?.some(s => s.isPR)) && (
                        <span className="pr-badge">⭐ PR</span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        )
      })}

      {selectedWorkout && (
        <WorkoutDetailModal workout={selectedWorkout} onClose={() => setSelectedWorkout(null)} />
      )}
    </div>
  )
}
