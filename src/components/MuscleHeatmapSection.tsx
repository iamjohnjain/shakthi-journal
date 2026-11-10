import { useState, useEffect, useMemo, lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { localDateStr, addLocalDays } from '../data/config'
import { getISOWeek, getWeekDates, addWeeks, formatWeekLabel } from '../lib/weekUtils'
import { getProfile } from '../db/profileStore'
import type { ProfileData } from '../db/profileStore'
import { useMuscleLoad } from '../hooks/useMuscleLoad'
import { REGION_MUSCLES, REGION_LABEL, MUSCLE_LABEL, type VisualRegion } from '../lib/muscleMap'
import DatePickerCalendar from './DatePickerCalendar'
import '../pages/ComparePage.css'
import './MuscleHeatmapSection.css'

const BodyHeatmap3D = lazy(() => import('./BodyHeatmap3D'))

type Mode = 'day' | 'week' | 'range'
type RangePreset = '7d' | '30d' | '90d' | 'custom'

function formatDayLabel(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function MuscleHeatmapSection() {
  const today = localDateStr()
  const [mode, setMode] = useState<Mode>('week')
  const [singleDate, setSingleDate] = useState(today)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [weekInfo, setWeekInfo] = useState(() => getISOWeek(new Date()))
  const [rangePreset, setRangePreset] = useState<RangePreset>('30d')
  const [rangeStart, setRangeStart] = useState(addLocalDays(today, -30))
  const [rangeEnd, setRangeEnd] = useState(today)
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [selectedRegion, setSelectedRegion] = useState<VisualRegion | null>(null)

  useEffect(() => { getProfile().then(setProfile) }, [])

  const range = useMemo(() => {
    if (mode === 'day') return { start: singleDate, end: singleDate }
    if (mode === 'week') { const dates = getWeekDates(weekInfo.week, weekInfo.year); return { start: dates[0], end: dates[6] } }
    return { start: rangeStart, end: rangeEnd }
  }, [mode, singleDate, weekInfo, rangeStart, rangeEnd])

  const { fine, regions, loading } = useMuscleLoad(range)
  const showStatusLabels = mode !== 'day'

  function applyRangePreset(p: RangePreset) {
    setRangePreset(p)
    if (p === 'custom') return
    const days = p === '7d' ? 7 : p === '30d' ? 30 : 90
    setRangeStart(addLocalDays(today, -days))
    setRangeEnd(today)
  }

  const weekDates = getWeekDates(weekInfo.week, weekInfo.year)
  const isCurrentWeek = weekInfo.week === getISOWeek(new Date()).week && weekInfo.year === getISOWeek(new Date()).year

  const detail = selectedRegion ? regions[selectedRegion] : null

  return (
    <section className="muscle-heatmap">
      <div className="mh-mode-toggle">
        {(['day', 'week', 'range'] as Mode[]).map(m => (
          <button key={m} className={`mh-mode-btn ${mode === m ? 'mh-mode-btn--on' : ''}`} onClick={() => setMode(m)}>
            {m === 'day' ? 'Day' : m === 'week' ? 'Week' : 'Range'}
          </button>
        ))}
      </div>

      {mode === 'day' && (
        <button className="mh-day-picker" onClick={() => setShowDatePicker(true)}>
          {formatDayLabel(singleDate)}
        </button>
      )}

      {mode === 'week' && (
        <div className="mh-week-nav">
          <button className="week-cal-nav" onClick={() => setWeekInfo(w => addWeeks(w.week, w.year, -1))}><ChevronLeft size={16} /></button>
          <span className="week-cal-range">{formatWeekLabel(weekDates)}</span>
          <button className="week-cal-nav" onClick={() => setWeekInfo(w => addWeeks(w.week, w.year, 1))}><ChevronRight size={16} /></button>
          {!isCurrentWeek && (
            <button className="week-cal-today" onClick={() => setWeekInfo(getISOWeek(new Date()))}>This week</button>
          )}
        </div>
      )}

      {mode === 'range' && (
        <>
          <div className="cmp-presets-row">
            {(['7d', '30d', '90d', 'custom'] as RangePreset[]).map(p => (
              <button key={p} className={`cmp-preset ${rangePreset === p ? 'cmp-preset--active' : ''}`} onClick={() => applyRangePreset(p)}>
                {p === '7d' ? '7 days' : p === '30d' ? '30 days' : p === '90d' ? '90 days' : 'Custom'}
              </button>
            ))}
          </div>
          {rangePreset === 'custom' && (
            <div className="cmp-date-row">
              <div className="cmp-date-group">
                <label className="cmp-date-label">From</label>
                <input type="date" className="cmp-date-input" value={rangeStart} max={rangeEnd}
                  onChange={e => setRangeStart(e.target.value)} />
              </div>
              <div className="cmp-date-group">
                <label className="cmp-date-label">To</label>
                <input type="date" className="cmp-date-input" value={rangeEnd} min={rangeStart} max={today}
                  onChange={e => setRangeEnd(e.target.value)} />
              </div>
            </div>
          )}
        </>
      )}

      <Suspense fallback={<div className="bh3d-loading">Loading 3D view…</div>}>
        <BodyHeatmap3D regions={regions} sex={profile?.sex} onSelectRegion={setSelectedRegion} />
      </Suspense>

      <div className="mh-legend">
        <span className="mh-legend-item"><i className="mh-dot mh-dot--none" />Untrained</span>
        <span className="mh-legend-item"><i className="mh-dot mh-dot--under" />Building up</span>
        <span className="mh-legend-item"><i className="mh-dot mh-dot--on" />On target</span>
        <span className="mh-legend-item"><i className="mh-dot mh-dot--over" />Possibly overtrained</span>
      </div>
      <p className="mh-disclaimer">
        Based on general training-volume guidelines (roughly 8–12 sets/week per muscle group) — not personalized or medical advice.
      </p>

      {!loading && detail && selectedRegion && createPortal(
        <div className="mh-detail" onClick={() => setSelectedRegion(null)}>
          <div className="mh-detail-card" onClick={e => e.stopPropagation()}>
            <div className="mh-detail-header">
              <span className="mh-detail-title">{REGION_LABEL[selectedRegion]}</span>
              <button className="mh-detail-close" onClick={() => setSelectedRegion(null)}>×</button>
            </div>
            {showStatusLabels && (
              <div className="mh-detail-summary">
                {detail.trained} / {Math.round(detail.target)} sets · {
                  detail.status === 'none' ? 'Not trained' :
                  detail.status === 'under' ? 'Under target' :
                  detail.status === 'onTarget' ? 'On target' : 'Possibly overtrained'
                }
              </div>
            )}
            {!showStatusLabels && <div className="mh-detail-summary">{detail.trained} sets logged</div>}
            <div className="mh-detail-breakdown">
              {REGION_MUSCLES[selectedRegion].map(m => (
                <div key={m} className="mh-detail-row">
                  <span>{MUSCLE_LABEL[m]}</span>
                  <span>{fine[m] ?? 0} sets</span>
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}

      {showDatePicker && (
        <DatePickerCalendar
          value={singleDate}
          markedDates={new Set()}
          maxDate={today}
          onChange={d => { setSingleDate(d); setShowDatePicker(false) }}
          onClose={() => setShowDatePicker(false)}
        />
      )}
    </section>
  )
}
