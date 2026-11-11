import { useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useScrollLock } from '../hooks/useScrollLock'
import { useSwipeToClose } from '../hooks/useSwipeToClose'
import './DatePickerCalendar.css'

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTH_FMT = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Full month-grid date picker — jump straight to any day instead of
 * stepping through one at a time. Days with logged or synced data get a
 * dot so a glance at the month shows coverage, not just the one day
 * being viewed.
 */
export default function DatePickerCalendar({ value, markedDates, maxDate, onChange, onClose, dotBackground }: {
  value: string
  markedDates: Set<string>
  maxDate: string
  onChange: (date: string) => void
  onClose: () => void
  /** Per-date dot color/gradient override (e.g. different colors for
      different data types on a given day) — any valid CSS `background`
      value, so a plain color or a split gradient both work. Falls back to
      the default green dot (via CSS) when omitted or returning undefined
      for a given date. */
  dotBackground?: (date: string) => string | undefined
}) {
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date(value + 'T12:00:00')
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  useScrollLock()
  const swipe = useSwipeToClose(onClose)

  const maxMonth = new Date(maxDate + 'T12:00:00')
  const atMaxMonth = viewMonth.getFullYear() === maxMonth.getFullYear() && viewMonth.getMonth() === maxMonth.getMonth()

  function changeMonth(delta: number) {
    setViewMonth(m => new Date(m.getFullYear(), m.getMonth() + delta, 1))
  }

  function pick(dateStr: string) {
    if (dateStr > maxDate) return
    onChange(dateStr)
    onClose()
  }

  const firstOfMonth = viewMonth
  const daysInMonth = new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth() + 1, 0).getDate()
  const leadingBlanks = firstOfMonth.getDay()

  const cells: Array<{ dateStr: string; day: number } | null> = []
  for (let i = 0; i < leadingBlanks; i++) cells.push(null)
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ dateStr: toDateStr(new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth(), day)), day })
  }

  return createPortal(
    <div className="dp-overlay" onClick={onClose}>
      <div className="dp-modal" onClick={e => e.stopPropagation()} style={swipe.style}>
        <div className="dp-header" {...swipe.handlers}>
          <div className="modal-grabber" />
          <h2>Select Date</h2>
          <button className="dp-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="dp-body">
          <div className="dp-month-nav">
            <button className="dp-month-btn" onClick={() => changeMonth(-1)} aria-label="Previous month">
              <ChevronLeft size={18} />
            </button>
            <span className="dp-month-label">{MONTH_FMT.format(viewMonth)}</span>
            <button className="dp-month-btn" onClick={() => changeMonth(1)} disabled={atMaxMonth} aria-label="Next month">
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="dp-weekdays">
            {WEEKDAY_LABELS.map((w, i) => <span key={i}>{w}</span>)}
          </div>

          <div className="dp-grid">
            {cells.map((cell, i) => {
              if (!cell) return <span key={i} className="dp-cell dp-cell--blank" />
              const isFuture = cell.dateStr > maxDate
              const isSelected = cell.dateStr === value
              const isMarked = markedDates.has(cell.dateStr)
              const isToday = cell.dateStr === maxDate
              return (
                <button
                  key={i}
                  className={`dp-cell ${isSelected ? 'dp-cell--selected' : ''} ${isToday && !isSelected ? 'dp-cell--today' : ''}`}
                  disabled={isFuture}
                  onClick={() => pick(cell.dateStr)}
                >
                  <span className="dp-cell-num">{cell.day}</span>
                  {isMarked && (
                    <span
                      className="dp-cell-dot"
                      style={dotBackground ? { background: dotBackground(cell.dateStr) } : undefined}
                    />
                  )}
                </button>
              )
            })}
          </div>

          <button className="dp-today-link" onClick={() => pick(maxDate)}>Today</button>
        </div>
      </div>
    </div>,
    document.body
  )
}
