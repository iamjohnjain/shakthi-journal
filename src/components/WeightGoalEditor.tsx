import { useState, useEffect, useRef, type FocusEvent } from 'react'
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

/** Replaces the old `onFocus={e => e.target.select()}` pattern everywhere in
 *  this form. Selecting-all on focus shows iOS's native blue text-selection
 *  highlight, which read as "cheap"/un-designed — instead, on focus the
 *  field is cleared (so the very next keystroke just types fresh, no
 *  backspacing/selecting needed) while its PREVIOUS value is shown as the
 *  input's `placeholder` — browsers render placeholders in a dim/grayed
 *  color automatically, so the old value stays visible-but-faded rather
 *  than vanishing outright. If the user taps away without typing anything,
 *  the original value is restored on blur rather than being left blank. */
function useOverwritableField(value: string, setValue: (v: string) => void) {
  const prevRef = useRef(value)
  return {
    value,
    placeholder: prevRef.current,
    onFocus(e: FocusEvent<HTMLInputElement>) {
      prevRef.current = value
      setValue('')
      // The iOS keyboard covers the bottom of the screen with no
      // visualViewport handling in this app (nowhere does) — without this,
      // a field near the bottom of the sheet (Pace, the macro fields) can
      // end up hidden behind the keyboard the moment it opens. Same
      // scrollIntoView-after-a-beat pattern already used on NutritionPage's
      // inputs for the same reason; the delay lets the keyboard's own
      // resize/animation start first so the browser computes the right
      // final scroll position instead of one it immediately invalidates.
      const el = e.currentTarget
      setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300)
    },
    onBlur() { if (value === '') setValue(prevRef.current) },
  }
}

/**
 * The one shared weight-goal editor — current weight / goal weight / target
 * date / pace, all cross-filling each other, plus the resulting nutrition
 * targets. Used by both the Nutrition "Weight-Loss Rate" tab and the Home
 * page's Weight Goal card, so editing a weight goal looks and behaves
 * identically no matter which screen it's opened from — previously each
 * had its own separate, drifted implementation of the same idea.
 */
export default function WeightGoalEditor({ onSaved, onCancel, liveCurrentWeightLbs }: {
  onSaved: (result: { calories: number; proteinG: number; carbsG: number; fatG: number }) => void
  /** Only rendered when provided — NutritionPage's modal already has its own
      close button, so a second "Cancel" would be redundant there; GoalRing's
      inline edit form needs one since it has no other way back out. */
  onCancel?: () => void
  /** The caller's own live "current weight" (latest health-sync/manual
      check-in, already resolved to lbs) — when provided, this seeds Current
      Weight instead of the profile's `startWeightKg` snapshot, which
      otherwise goes stale the moment a new weigh-in comes in after the
      profile was last saved. Pace/calories/macros all derive from Current
      Weight already, so seeding it live is what makes the whole preview
      track the user's actual progress instead of a frozen value. */
  liveCurrentWeightLbs?: number
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
      const curLbsLoaded = liveCurrentWeightLbs != null && liveCurrentWeightLbs > 0
        ? Math.round(liveCurrentWeightLbs)
        : profile?.startWeightKg ? Math.round(kgToLbs(profile.startWeightKg)) : 0
      if (curLbsLoaded > 0) setCurrentWeight(String(curLbsLoaded))

      const goalLbsLoaded = profile?.goalWeightKg ? Math.round(kgToLbs(profile.goalWeightKg)) : 0
      if (goalLbsLoaded > 0) setGoalWeight(String(goalLbsLoaded))

      const dateLoaded = profile?.goalDate || localDateStr(new Date(Date.now() + 1000 * 60 * 60 * 24 * 56)) // 8 weeks out by default
      setTargetDate(dateLoaded)

      if (profile?.activityLevel) setActivityLevel(profile.activityLevel)

      // Pace was previously left blank on load no matter what — it only
      // ever got computed as a SIDE EFFECT of the user editing one of the
      // other three fields, so a goal that was already fully set up (from
      // a previous save) opened back up with an empty/0.0 Pace and a
      // "...about 0.0 lbs a week" breakdown line that didn't match the
      // real numbers at all. Derive it here too, the same formula the
      // onXChange handlers already use.
      if (curLbsLoaded > 0 && goalLbsLoaded > 0 && dateLoaded) {
        const days = Math.max(1, daysBetween(today, dateLoaded))
        setRate(Math.max(0, (curLbsLoaded - goalLbsLoaded) / days * 7).toFixed(1))
      }

      setLoaded(true)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // The calorie total is the one fixed, non-editable thing this tab
  // produces — editing a macro here redistributes the OTHER two to keep
  // that same total, it never changes the total itself (that's what makes
  // this "rate priority": the calorie budget comes from the pace/date
  // above, not from the macros). Reseeded whenever the rate inputs
  // actually change the underlying calorie target; otherwise these are
  // just directly edited by the handlers below.
  const [proteinG, setProteinG] = useState(0)
  const [carbsG,   setCarbsG]   = useState(0)
  const [fatG,     setFatG]     = useState(0)
  useEffect(() => {
    if (preview) {
      setProteinG(preview.proteinG)
      setCarbsG(preview.carbsG)
      setFatG(preview.fatG)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview?.calories, preview?.proteinG, preview?.carbsG, preview?.fatG])

  function onProteinEdit(raw: string) {
    const p = Number(raw.replace(/[^0-9]/g, '')) || 0
    setProteinG(p)
    if (preview) setCarbsG(Math.max(0, Math.round((preview.calories - p * 4 - fatG * 9) / 4)))
  }
  function onFatEdit(raw: string) {
    const f = Number(raw.replace(/[^0-9]/g, '')) || 0
    setFatG(f)
    if (preview) setCarbsG(Math.max(0, Math.round((preview.calories - proteinG * 4 - f * 9) / 4)))
  }
  function onCarbsEdit(raw: string) {
    const c = Number(raw.replace(/[^0-9]/g, '')) || 0
    setCarbsG(c)
    if (preview) setFatG(Math.max(0, Math.round((preview.calories - proteinG * 4 - c * 4) / 9)))
  }

  // One `useOverwritableField` per numeric input — see the hook's own doc
  // comment above for what this replaces (select-all-on-focus's native
  // highlight) and why.
  const currentWeightField = useOverwritableField(currentWeight, onCurrentWeightChange)
  const goalWeightField    = useOverwritableField(goalWeight,    onGoalWeightChange)
  const rateField           = useOverwritableField(rate,          onRateChange)
  const proteinField = useOverwritableField(String(proteinG), raw => onProteinEdit(raw))
  const carbsField   = useOverwritableField(String(carbsG),   raw => onCarbsEdit(raw))
  const fatField      = useOverwritableField(String(fatG),      raw => onFatEdit(raw))

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
    onSaved({ calories: preview.calories, proteinG, carbsG, fatG })
  }

  return (
    <div className="wge">
      <div className="wge-row">
        <div className="wge-field">
          <label>Current Weight</label>
          <div className="wge-input-wrap">
            <input type="text" inputMode="numeric" pattern="[0-9]*"
              {...currentWeightField} onChange={e => onCurrentWeightChange(e.target.value)} />
            <span className="wge-unit">lbs</span>
          </div>
        </div>
        <div className="wge-field">
          <label>Goal Weight</label>
          <div className="wge-input-wrap">
            <input type="text" inputMode="numeric" pattern="[0-9]*"
              {...goalWeightField} onChange={e => onGoalWeightChange(e.target.value)} />
            <span className="wge-unit">lbs</span>
          </div>
        </div>
      </div>

      <div className="wge-row">
        <div className="wge-field">
          <label>Pace</label>
          <div className="wge-input-wrap">
            <input type="text" inputMode="decimal"
              {...rateField} onChange={e => onRateChange(e.target.value)} />
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
          <div className="wge-preview-hint">Tap a macro to see what it costs from the others</div>
          <div className="wge-preview-macros">
            <label className="wge-macro-field">
              <input type="text" inputMode="numeric" pattern="[0-9]*"
                {...proteinField} onChange={e => onProteinEdit(e.target.value)} />
              <span>g protein</span>
            </label>
            <label className="wge-macro-field">
              <input type="text" inputMode="numeric" pattern="[0-9]*"
                {...carbsField} onChange={e => onCarbsEdit(e.target.value)} />
              <span>g carbs</span>
            </label>
            <label className="wge-macro-field">
              <input type="text" inputMode="numeric" pattern="[0-9]*"
                {...fatField} onChange={e => onFatEdit(e.target.value)} />
              <span>g fat</span>
            </label>
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
