import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Dumbbell, CalendarDays, Clock, TrendingUp,
  LayoutTemplate, BookOpen, ChevronDown,
} from 'lucide-react'
import { getDB } from '../db'
import type { WorkoutSession } from '../db'
import { CARDIO_SUBTYPES } from '../db/workoutStore'
import './WorkoutsPage.css'

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

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

export default function WorkoutHistoryPage() {
  const [groups, setGroups] = useState<MonthGroup[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

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
                {workouts.map(w => (
                  <div key={w.id} className="workout-history-card">
                    <span className="workout-history-emoji">{workoutEmoji(w)}</span>
                    <div className="workout-history-info">
                      <span className="workout-history-name">{w.title || workoutTypeLabel(w)}</span>
                      <span className="workout-history-meta">
                        {workoutTypeLabel(w)}
                        {w.durationMin ? ` · ${w.durationMin}min` : ''}
                        {w.exercises?.length ? ` · ${w.exercises.length} exercise${w.exercises.length !== 1 ? 's' : ''}` : ''}
                      </span>
                    </div>
                    {w.exercises?.some(ex => ex.sets?.some(s => s.isPR)) && (
                      <span className="pr-badge">⭐ PR</span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
