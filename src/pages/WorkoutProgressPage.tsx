import { useState, useEffect, useCallback } from 'react'
import { Search, TrendingUp, Award, Camera } from 'lucide-react'
import { getExerciseHistory, getExerciseLibrary } from '../db/trainingStore'
import type { ExerciseHistory } from '../db/trainingStore'
import { getAllTimePRs } from '../db/workoutStore'
import SubNav from '../components/WorkoutsSubNav'
import CheckInsSection from './ProgressCheckIns'
import './WorkoutProgressPage.css'

function MiniBar({ pct, color = 'var(--accent)' }: { pct: number; color?: string }) {
  return (
    <div className="wpr-bar-track">
      <div className="wpr-bar-fill" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
    </div>
  )
}

function HistoryCard({ history }: { history: ExerciseHistory }) {
  const sessions = history.sessions.slice(0, 10)
  const first = sessions[sessions.length - 1]
  const latest = sessions[0]
  const improvement = first && latest && first.bestE1RM > 0
    ? ((latest.bestE1RM - first.bestE1RM) / first.bestE1RM * 100)
    : null

  return (
    <div className="wpr-card">
      <div className="wpr-card-header">
        <div>
          <div className="wpr-card-name">{history.name}</div>
          <div className="wpr-card-sessions">{sessions.length} sessions logged</div>
        </div>
        {improvement != null && (
          <div className={`wpr-improvement ${improvement >= 0 ? 'wpr-improvement--up' : 'wpr-improvement--down'}`}>
            {improvement > 0 ? '+' : ''}{improvement.toFixed(0)}% 1RM
          </div>
        )}
      </div>

      {history.allTimePR > 0 && (
        <div className="wpr-pr-row">
          <Award size={14} className="wpr-pr-icon" />
          <span>All-time PR: <strong>{history.allTimePR} lb e1RM</strong></span>
        </div>
      )}

      {sessions.length > 0 && (
        <div className="wpr-history">
          {sessions.slice(0, 6).map((s, i) => {
            const pct = history.allTimePR > 0 ? (s.bestE1RM / history.allTimePR * 100) : 0
            return (
              <div key={i} className="wpr-session-row">
                <span className="wpr-session-date">{s.date}</span>
                <MiniBar pct={pct} color={i === 0 ? 'var(--green)' : 'var(--accent)'} />
                <span className="wpr-session-e1rm">
                  {s.bestE1RM > 0 ? `${s.bestE1RM}lb` : '—'}
                </span>
                <span className="wpr-session-vol">{(s.volume / 1000).toFixed(1)}k vol</span>
              </div>
            )
          })}
        </div>
      )}

      <div className="wpr-suggestion">
        <TrendingUp size={13} className="wpr-sugg-icon" />
        <span>{history.suggestion}</span>
      </div>
    </div>
  )
}

function PrTrackingSection() {
  const [query,     setQuery]     = useState('')
  const [history,   setHistory]   = useState<ExerciseHistory | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [allNames,  setAllNames]  = useState<string[]>([])
  const [searched,  setSearched]  = useState(false)
  // Default view: every lifted exercise's best e1RM (a real recorded value
  // when the set itself was flagged a PR, Epley-estimated otherwise —
  // getAllTimePRs() already prefers the former), heaviest first — "the
  // number one priority is seeing my 1-rep max whenever I see this tab",
  // not an empty search prompt.
  const [allPRs, setAllPRs] = useState<{ name: string; e1rm: number }[] | null>(null)

  const loadAllPRs = useCallback(async () => {
    const prs = await getAllTimePRs()
    setAllPRs(Array.from(prs.entries()).map(([name, e1rm]) => ({ name, e1rm })).sort((a, b) => b.e1rm - a.e1rm))
  }, [])

  useEffect(() => {
    getExerciseLibrary().then(lib => setAllNames(lib.map(e => e.name)))
    void loadAllPRs()
  }, [loadAllPRs])

  async function search(name?: string) {
    const target = (name ?? query).trim()
    if (!target) return
    setLoading(true)
    setSearched(true)
    const h = await getExerciseHistory(target)
    setHistory(h)
    setLoading(false)
  }

  function handleSelect(name: string) {
    setQuery(name)
    search(name)
  }

  function backToAll() {
    setSearched(false)
    setQuery('')
    setHistory(null)
  }

  return (
    <>
      <div className="wpr-search-wrap">
        <Search size={14} className="wpr-search-icon" />
        <input
          list="progress-exercise-list"
          className="wpr-search" placeholder="Search an exercise…"
          value={query} onChange={e => { setQuery(e.target.value); setSearched(false) }}
          onKeyDown={e => e.key === 'Enter' && search()} />
        <datalist id="progress-exercise-list">
          {allNames.map(n => <option key={n} value={n} />)}
        </datalist>
        <button className="wpr-search-btn" onClick={() => search()}>Go</button>
      </div>

      {!searched && (
        <div className="wpr-quick-picks">
          {['Back Squat','Bench Press','Deadlift','Overhead Press','Pull-up','Barbell Row','Romanian Deadlift'].map(name => (
            <button key={name} className="wpr-quick-chip" onClick={() => handleSelect(name)}>{name}</button>
          ))}
        </div>
      )}

      {loading && <div className="wpr-loading">Loading history…</div>}

      {!loading && history && searched && (
        history.sessions.length === 0 ? (
          <div className="wpr-empty">
            <p>No sessions logged for <strong>{history.name}</strong> yet.</p>
            <p className="wpr-empty-hint">Log this exercise in the Workouts tab to start tracking progress.</p>
          </div>
        ) : (
          <>
            <button className="wpr-back-to-all" onClick={backToAll}>← All workouts</button>
            <HistoryCard history={history} />
          </>
        )
      )}

      {!searched && !loading && (
        <div className="wpr-all-list">
          <div className="wpr-all-list-header">All Workouts</div>
          {allPRs === null ? (
            <div className="wpr-loading">Loading…</div>
          ) : allPRs.length === 0 ? (
            <div className="wpr-prompt">
              <TrendingUp size={32} className="wpr-prompt-icon" />
              <p>Log a workout to start tracking your 1-rep max estimates here.</p>
            </div>
          ) : (
            allPRs.map(({ name, e1rm }) => (
              <button key={name} className="wpr-all-list-row" onClick={() => handleSelect(name)}>
                <span className="wpr-all-list-name">{name}</span>
                <span className="wpr-all-list-e1rm">
                  <Award size={13} className="wpr-pr-icon" />
                  {e1rm > 0 ? `${e1rm} lb e1RM` : '—'}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </>
  )
}

export default function WorkoutProgressPage() {
  // Check-Ins loads first — "the first thing they see when they click
  // progress" — with PR Tracking a tap away, same toggle pattern already
  // used inside Check-Ins itself for Capture/Compare.
  const [mode, setMode] = useState<'checkins' | 'pr'>('checkins')

  return (
    <div className="workout-progress-page">
      <SubNav />

      <header className="page-header">
        <div>
          <h1 className="page-title">Progress</h1>
          <p className="page-subtitle">
            {mode === 'checkins' ? 'Photo check-ins, tagged by pose and date' : 'Your 1-rep max estimates & overload suggestions'}
          </p>
        </div>
      </header>

      <div className="wpr-mode-toggle">
        <button className={mode === 'checkins' ? 'wpr-mode-active' : ''} onClick={() => setMode('checkins')}>
          <Camera size={14} /> Check-in
        </button>
        <button className={mode === 'pr' ? 'wpr-mode-active' : ''} onClick={() => setMode('pr')}>
          <TrendingUp size={14} /> Progress
        </button>
      </div>

      {mode === 'checkins' ? <CheckInsSection /> : <PrTrackingSection />}
    </div>
  )
}
