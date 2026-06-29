import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Check, Dumbbell } from 'lucide-react'
import { kgToLbs, GOALS } from '../data/config'
import { saveLog, getLog } from '../db/logStore'
import type { DailyLog } from '../db/logStore'
import DataBadge from '../components/DataBadge'
import './DailyLog.css'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

function offsetDate(base: string, delta: number): string {
  const d = new Date(base + 'T12:00:00')
  d.setDate(d.getDate() + delta)
  return d.toISOString().split('T')[0]
}

function fmtDate(d: string): string {
  const date = new Date(d + 'T12:00:00')
  const today = todayStr()
  const yest  = offsetDate(today, -1)
  if (d === today) return 'Today'
  if (d === yest)  return 'Yesterday'
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function LogSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="log-section">
      <h2 className="log-section-title">{title}</h2>
      <div className="log-section-body">{children}</div>
    </section>
  )
}

function NumberField({
  label, value, onChange, unit, placeholder, min, max, step = 1,
}: {
  label: string
  value: number | undefined
  onChange: (v: number | undefined) => void
  unit?: string
  placeholder?: string
  min?: number
  max?: number
  step?: number
}) {
  return (
    <div className="log-field">
      <label className="log-field-label">{label}</label>
      <div className="log-field-input-wrap">
        <input
          type="number"
          className="log-field-input"
          value={value ?? ''}
          placeholder={placeholder ?? '—'}
          min={min}
          max={max}
          step={step}
          onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        />
        {unit && <span className="log-field-unit">{unit}</span>}
      </div>
    </div>
  )
}

function RatingField({
  label, value, onChange, labels,
}: {
  label: string
  value: 1 | 2 | 3 | 4 | 5 | undefined
  onChange: (v: 1 | 2 | 3 | 4 | 5) => void
  labels: [string, string, string, string, string]
}) {
  return (
    <div className="log-field log-field--rating">
      <label className="log-field-label">{label}</label>
      <div className="log-rating-row">
        {([1, 2, 3, 4, 5] as const).map(n => (
          <button
            key={n}
            type="button"
            className={`log-rating-btn ${value === n ? 'active' : ''}`}
            onClick={() => onChange(n)}
            title={labels[n - 1]}
          >
            <span className="log-rating-num">{n}</span>
            <span className="log-rating-label">{labels[n - 1]}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function ToggleField({
  label, value, onChange,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="log-field log-field--toggle">
      <label className="log-field-label">{label}</label>
      <button
        type="button"
        className={`log-toggle ${value ? 'log-toggle--on' : ''}`}
        onClick={() => onChange(!value)}
      >
        <span className="log-toggle-thumb" />
      </button>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DailyLog() {
  const [date, setDate]   = useState(todayStr)
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [existing, setExisting] = useState(false)
  const [saving, setSaving] = useState(false)

  // form state
  const [weightLbs, setWeightLbs] = useState<number | undefined>()
  const [calories,  setCalories]  = useState<number | undefined>()
  const [protein,   setProtein]   = useState<number | undefined>()
  const [carbs,     setCarbs]     = useState<number | undefined>()
  const [fat,       setFat]       = useState<number | undefined>()
  const [water,     setWater]     = useState<number | undefined>()
  const [workout,   setWorkout]   = useState(false)
  const [workoutNotes, setWorkoutNotes] = useState('')
  const [mood,      setMood]      = useState<1|2|3|4|5 | undefined>()
  const [energy,    setEnergy]    = useState<1|2|3|4|5 | undefined>()
  const [sleepQ,    setSleepQ]    = useState<1|2|3|4|5 | undefined>()
  const [notes,     setNotes]     = useState('')

  function markDirty() { setDirty(true); setSaved(false) }

  const loadLog = useCallback(async (d: string) => {
    const log = await getLog(d)
    if (log) {
      setExisting(true)
      setWeightLbs(log.weightKg ? +kgToLbs(log.weightKg).toFixed(1) : undefined)
      setCalories(log.caloriesIn)
      setProtein(log.proteinG)
      setCarbs(log.carbsG)
      setFat(log.fatG)
      setWater(log.waterMl ? +(log.waterMl / 1000).toFixed(2) : undefined)
      setWorkout(log.workoutCompleted ?? false)
      setWorkoutNotes(log.workoutNotes ?? '')
      setMood(log.mood)
      setEnergy(log.energyLevel)
      setSleepQ(log.sleepQuality)
      setNotes(log.notes ?? '')
    } else {
      setExisting(false)
      setWeightLbs(undefined); setCalories(undefined); setProtein(undefined)
      setCarbs(undefined); setFat(undefined); setWater(undefined)
      setWorkout(false); setWorkoutNotes('')
      setMood(undefined); setEnergy(undefined); setSleepQ(undefined); setNotes('')
    }
    setDirty(false)
    setSaved(false)
  }, [])

  useEffect(() => { loadLog(date) }, [date, loadLog])

  async function handleSave() {
    setSaving(true)
    await saveLog({
      date,
      weightKg:         weightLbs != null ? +(weightLbs / 2.20462).toFixed(2) : undefined,
      caloriesIn:       calories,
      proteinG:         protein,
      carbsG:           carbs,
      fatG:             fat,
      waterMl:          water != null ? +(water * 1000) : undefined,
      workoutCompleted: workout,
      workoutNotes:     workoutNotes || undefined,
      mood,
      energyLevel:      energy,
      sleepQuality:     sleepQ,
      notes:            notes || undefined,
    })
    setSaving(false)
    setDirty(false)
    setSaved(true)
    setExisting(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const isToday = date === todayStr()

  return (
    <div className="daily-log-page">
      {/* ── Date nav ── */}
      <header className="log-header">
        <div className="log-date-nav">
          <button className="log-nav-btn" onClick={() => setDate(d => offsetDate(d, -1))}>
            <ChevronLeft size={18} />
          </button>
          <div className="log-date-center">
            <h1 className="log-date-label">{fmtDate(date)}</h1>
            <input
              type="date"
              className="log-date-input"
              value={date}
              max={todayStr()}
              onChange={e => setDate(e.target.value)}
            />
          </div>
          <button
            className="log-nav-btn"
            onClick={() => setDate(d => offsetDate(d, 1))}
            disabled={isToday}
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="log-header-right">
          {existing && <DataBadge mode="manual" source="Saved" />}
          {!isToday && (
            <button className="log-today-btn" onClick={() => setDate(todayStr())}>Today</button>
          )}
        </div>
      </header>

      {/* ── Body ── */}
      <LogSection title="Body">
        <NumberField label="Weight" value={weightLbs} onChange={v => { setWeightLbs(v); markDirty() }} unit="lbs" step={0.1} min={50} max={500} placeholder={String(199)} />
      </LogSection>

      {/* ── Nutrition ── */}
      <LogSection title="Nutrition">
        <div className="log-grid-2">
          <NumberField label="Calories eaten" value={calories} onChange={v => { setCalories(v); markDirty() }} unit="kcal" placeholder={String(GOALS.caloriesIn)} />
          <NumberField label="Protein"         value={protein}  onChange={v => { setProtein(v);  markDirty() }} unit="g"    placeholder={String(GOALS.proteinG)} />
          <NumberField label="Carbs"           value={carbs}    onChange={v => { setCarbs(v);    markDirty() }} unit="g"    placeholder="280" />
          <NumberField label="Fat"             value={fat}      onChange={v => { setFat(v);      markDirty() }} unit="g"    placeholder="65" />
        </div>
        <NumberField
          label="Water"
          value={water}
          onChange={v => { setWater(v); markDirty() }}
          unit={`/ ${GOALS.waterMl / 1000}L`}
          step={0.1}
          min={0}
          max={10}
          placeholder={(GOALS.waterMl / 1000).toFixed(1)}
        />
        {protein != null && (
          <div className="log-progress-bar">
            <div className="log-progress-track">
              <div
                className="log-progress-fill"
                style={{ width: `${Math.min((protein / GOALS.proteinG) * 100, 100)}%`, background: 'var(--green)' }}
              />
            </div>
            <span className="log-progress-label">{protein}g / {GOALS.proteinG}g protein</span>
          </div>
        )}
      </LogSection>

      {/* ── Workout ── */}
      <LogSection title="Workout">
        <ToggleField label="Completed a workout" value={workout} onChange={v => { setWorkout(v); markDirty() }} />
        {workout && (
          <div className="log-field">
            <label className="log-field-label"><Dumbbell size={12} /> Notes</label>
            <textarea
              className="log-field-textarea"
              value={workoutNotes}
              placeholder="What did you do? (e.g. Upper body push · 4×8 bench press)"
              rows={3}
              onChange={e => { setWorkoutNotes(e.target.value); markDirty() }}
            />
          </div>
        )}
      </LogSection>

      {/* ── Wellbeing ── */}
      <LogSection title="Wellbeing">
        <RatingField
          label="Mood"
          value={mood}
          onChange={v => { setMood(v); markDirty() }}
          labels={['Terrible', 'Poor', 'Okay', 'Good', 'Great']}
        />
        <RatingField
          label="Energy"
          value={energy}
          onChange={v => { setEnergy(v); markDirty() }}
          labels={['Drained', 'Low', 'Moderate', 'Good', 'High']}
        />
        <RatingField
          label="Sleep quality"
          value={sleepQ}
          onChange={v => { setSleepQ(v); markDirty() }}
          labels={['Terrible', 'Poor', 'Okay', 'Good', 'Great']}
        />
      </LogSection>

      {/* ── Notes ── */}
      <LogSection title="Notes">
        <div className="log-field">
          <textarea
            className="log-field-textarea"
            value={notes}
            placeholder="How was your day? Anything affecting your health?"
            rows={4}
            onChange={e => { setNotes(e.target.value); markDirty() }}
          />
        </div>
      </LogSection>

      {/* ── Save ── */}
      <div className="log-save-bar">
        {dirty && <span className="log-dirty-label">Unsaved changes</span>}
        <button
          className={`log-save-btn ${saved ? 'log-save-btn--saved' : ''}`}
          onClick={handleSave}
          disabled={saving || !dirty}
        >
          {saved ? (
            <><Check size={15} /> Saved</>
          ) : saving ? 'Saving…' : existing ? 'Update Entry' : 'Save Entry'}
        </button>
      </div>
    </div>
  )
}
