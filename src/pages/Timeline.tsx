import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock } from 'lucide-react'
import { getTimeline } from '../db/timelineStore'
import type { TimelineEvent } from '../db/timelineStore'
import './Timeline.css'

// ─── Date label ───────────────────────────────────────────────────────────────

function dateGroupLabel(dateStr: string): string {
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  if (dateStr === today)     return 'Today'
  if (dateStr === yesterday) return 'Yesterday'
  const d = new Date(dateStr + 'T12:00:00')
  const isThisYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    ...(!isThisYear ? { year: 'numeric' } : {}),
  })
}

// ─── Event card ───────────────────────────────────────────────────────────────

const TYPE_COLORS: Partial<Record<TimelineEvent['type'], string>> = {
  workout:   'var(--blue)',
  pr:        'var(--yellow)',
  nutrition: 'var(--green)',
  weight:    'var(--teal)',
  sleep:     'var(--purple)',
  recovery:  'var(--pink)',
  import:    'var(--orange)',
  note:      'var(--text-tertiary)',
  body:      'var(--teal)',
}

function EventCard({ event }: { event: TimelineEvent }) {
  const navigate  = useNavigate()
  const color     = TYPE_COLORS[event.type] ?? 'var(--text-tertiary)'
  const isPositive = event.positive

  return (
    <button
      className={`tl-event ${isPositive ? 'tl-event--positive' : ''}`}
      onClick={() => event.link && navigate(event.link)}
      aria-label={event.title}
    >
      <div className="tl-event-left">
        <div className="tl-event-dot" style={{ background: color }} />
        <span className="tl-event-emoji" aria-hidden="true">{event.emoji}</span>
      </div>

      <div className="tl-event-body">
        <div className="tl-event-title-row">
          <span className="tl-event-title">{event.title}</span>
          {event.value && (
            <span className="tl-event-value" style={{ color }}>{event.value}</span>
          )}
        </div>
        {event.detail && (
          <p className="tl-event-detail">{event.detail}</p>
        )}
        {event.source && (
          <span className="tl-event-source">{event.source}</span>
        )}
      </div>
    </button>
  )
}

// ─── Date group ───────────────────────────────────────────────────────────────

function DateGroup({ label, events }: { label: string; events: TimelineEvent[] }) {
  return (
    <div className="tl-group">
      <div className="tl-date-label">{label}</div>
      <div className="tl-events">
        {events.map(e => <EventCard key={e.id} event={e} />)}
      </div>
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function TimelineEmpty() {
  const navigate = useNavigate()
  return (
    <div className="tl-empty">
      <Clock size={40} style={{ opacity: 0.2 }} />
      <h2 className="tl-empty-title">Your story starts here</h2>
      <p className="tl-empty-desc">
        Every workout, meal, weigh-in, and import becomes part of your health timeline.
        Log something to see it appear here.
      </p>
      <div className="tl-empty-actions">
        <button className="tl-empty-btn" onClick={() => navigate('/log')}>Log weight</button>
        <button className="tl-empty-btn tl-empty-btn--ghost" onClick={() => navigate('/workouts')}>Log workout</button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Timeline() {
  const [events,  setEvents]  = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [limit,   setLimit]   = useState(100)

  useEffect(() => {
    setLoading(true)
    getTimeline(90, limit).then(evts => {
      setEvents(evts)
      setLoading(false)
    })
  }, [limit])

  // Group events by date
  const grouped = new Map<string, TimelineEvent[]>()
  for (const e of events) {
    if (!grouped.has(e.date)) grouped.set(e.date, [])
    grouped.get(e.date)!.push(e)
  }
  const sortedDates = [...grouped.keys()].sort().reverse()

  return (
    <div className="timeline-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Timeline</h1>
          <p className="page-subtitle">Your health journal</p>
        </div>
      </header>

      {loading ? (
        <div className="tl-loading">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="tl-skeleton-group">
              <div className="tl-skeleton-date" />
              <div className="tl-skeleton-event" />
              <div className="tl-skeleton-event tl-skeleton-event--sm" />
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <TimelineEmpty />
      ) : (
        <>
          <div className="tl-list">
            {sortedDates.map(date => (
              <DateGroup
                key={date}
                label={dateGroupLabel(date)}
                events={grouped.get(date)!}
              />
            ))}
          </div>

          {events.length >= limit && (
            <button
              className="tl-load-more"
              onClick={() => setLimit(l => l + 100)}
            >
              Load more
            </button>
          )}
        </>
      )}
    </div>
  )
}
