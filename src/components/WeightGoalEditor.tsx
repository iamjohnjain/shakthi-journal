import { useState, useEffect } from 'react'
import { kgToLbs, lbsToKg, localDateStr } from '../data/config'
import { calcNutrition } from '../lib/nutritionMath'
import { getProfile, saveProfile } from '../db/profileStore'
import DatePickerCalendar from './DatePickerCalendar'
import './WeightGoalEditor.css'

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000)
}

function fmtDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * The one shared weight-goal editor — current weight / goal weight / target
 * date / pace, all cross-filling each other, plus the resulting nutrition
 * targets. Used by both the Nutrition "Weight-Loss Rate" tab and the Home
 * page's Weight Goal card, so editing a weight goal looks and behaves
 * identically no matter which screen it's opened from — previously each
 * had its own separate, drifted implementation of the same idea.
 */
export default function WeightGoalEditor({ onSaved, onCancel }: {
  onSaved: (result: { calories: number; proteinG: number; carbsG: number; fatG: number }) => void
  /** Only rendered when provided — NutritionPage's modal already has its own
      close button, so a second "Cancel" would be redundant there; GoalRing's
      inline edit form needs one since it has no other way back out. */
  onCancel?: () => void
}) {
  const [currentWeight, setCurrentWeight] = useState('')
  const [goalWeight,    setGoalWeight]    = useState('')
  const [rate,          setRate]          = useState('')
  const [targetDate,    setTargetDate]    = useState('')
  const [activityLevel, setActivityLevel] = useState('moderate')
  const [loaded,        setLoaded]        = useState(false)
  const [showCalendar,  setShowCalendar]  = useState(false)
  const [saving,        setSaving]        = useState(false)

  const today = localDateStr()

  useEffect(() => {
    getProfile().then(profile => {
      if (profile?.startWeightKg) setCurrentWeight(String(Math.round(kgToLbs(profile.startWeightKg))))
      if (profile?.goalWeightKg)  setGoalWeight(String(Math.round(kgToLbs(profile.goalWeightKg))))
      if (profile?.goalDate)      setTargetDate(profile.goalDate)
      else                        setTargetDate(localDateStr(new Date(Date.now() + 1000 * 60 * 60 * 24 * 56))) // 8 weeks out by default
      if (profile?.activityLevel) setActivityLevel(profile.activityLevel)
      setLoaded(true)
    })
  }, [])

  const curLbs = Number(currentWeight) || 0

  function daysFor(date: string) { return Math.max(1, daysBetween(today, date)) }

  // Any one of goal weight / rate / target date can be edited directly; the
  // other two values (current weight stays an anchor, not recomputed) adjust
  // to stay consistent instead of silently going stale.
  function onGoalWeightChange(raw: string) {
    const clean = raw.replace(/[^0-9]/g, '')
    setGoalWeight(clean)
    const g = Number(clean)
    if (curLbs > 0 && g > 0 && targetDate) {
      const days = daysFor(targetDate)
      setRate(Math.max(0, (curLbs - g) / days * 7).toFixed(1))
    }
  }

  function onRateChange(raw: string) {
    const clean = raw.replace(/[^0-9.]/g, '')
    setRate(clean)
    const r = Number(clean)
    if (curLbs > 0 && targetDate) {
      const days = daysFor(targetDate)
      setGoalWeight(String(Math.round(curLbs - r * days / 7)))
    }
  }

  function onDateChange(date: string) {
    setTargetDate(date)
    const g = Number(goalWeight)
    if (curLbs > 0 && g > 0) {
      const days = daysFor(date)
      setRate(Math.max(0, (curLbs - g) / days * 7).toFixed(1))
    }
  }

  function onCurrentWeightChange(raw: string) {
    const clean = raw.replace(/[^0-9]/g, '')
    setCurrentWeight(clean)
    const c = Number(clean)
    const g = Number(goalWeight)
    if (c > 0 && g > 0 && targetDate) {
      const days = daysFor(targetDate)
      setRate(Math.max(0, (c - g) / days * 7).toFixed(1))
    }
  }

  const goalLbs = Number(goalWeight) || 0
  const rateNum = Number(rate) || 0
  const daysRemaining = targetDate ? daysBetween(today, targetDate) : 0
  const weeksRemaining = daysRemaining / 7
  const toLose = Math.max(0, curLbs - goalLbs)
  const preview = (loaded && goalLbs > 0 && daysRemaining > 0)
    ? calcNutrition(goalLbs, activityLevel, rateNum)
    : null

  async function handleSave() {
    if (!preview) return
    setSaving(true)
    const profile = await getProfile()
    if (profile) {
      await saveProfile({
        ...profile,
        startWeightKg: curLbs > 0 ? lbsToKg(curLbs) : profile.startWeightKg,
        goalWeightKg: lbsToKg(goalLbs),
        goalDate: targetDate,
      })
    }
    setSaving(false)
    onSaved(preview)
  }

  return (
    <div className="wge">
      <div className="wge-row">
        <div className="wge-field">
          <label>Current Weight</label>
          <div className="wge-input-wrap">
            <input type="text" inputMode="numeric" pattern="[0-9]*" value={currentWeight}
              onChange={e => onCurrentWeightChange(e.target.value)} onFocus={e => e.target.select()} />
            <span className="wge-unit">lbs</span>
          </div>
        </div>
        <div className="wge-field">
          <label>Goal Weight</label>
          <div className="wge-input-wrap">
            <input type="text" inputMode="numeric" pattern="[0-9]*" value={goalWeight}
              onChange={e => onGoalWeightChange(e.target.value)} onFocus={e => e.target.select()} />
            <span className="wge-unit">lbs</span>
          </div>
        </div>
      </div>

      <div className="wge-row">
        <div className="wge-field">
          <label>Pace</label>
          <div className="wge-input-wrap">
            <input type="text" inputMode="decimal" value={rate}
              onChange={e => onRateChange(e.target.value)} onFocus={e => e.target.select()} />
            <span className="wge-unit">lbs/wk</span>
          </div>
        </div>
        <div className="wge-field">
          <label>Target Date</label>
          <button className="wge-date-btn" onClick={() => setShowCalendar(true)}>
            {targetDate ? fmtDate(targetDate) : 'Pick A Date'}
          </button>
        </div>
      </div>

      {daysRemaining > 0 && toLose > 0 && (
        <div className="wge-breakdown">
          {toLose.toFixed(1)}lbs to go over {weeksRemaining.toFixed(1)} weeks — about {rateNum.toFixed(1)}lbs/week
        </div>
      )}

      {preview && (
        <div className="wge-preview">
          <div className="wge-preview-cals">{preview.calories} cal/day</div>
          <div className="wge-preview-macros">
            {preview.proteinG}g protein · {preview.carbsG}g carbs · {preview.fatG}g fat
          </div>
        </div>
      )}

      <div className="wge-actions">
        {onCancel && (
          <button className="wge-cancel" onClick={onCancel} disabled={saving}>Cancel</button>
        )}
        <button className="wge-save" disabled={!preview || saving} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save Goal'}
        </button>
      </div>

      {showCalendar && (
        <DatePickerCalendar
          value={targetDate || today}
          markedDates={new Set()}
          minDate={today}
          maxDate={localDateStr(new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 3))}
          onChange={onDateChange}
          onClose={() => setShowCalendar(false)}
        />
      )}
    </div>
  )
}
