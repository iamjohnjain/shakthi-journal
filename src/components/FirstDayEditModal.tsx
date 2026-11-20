import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Check } from 'lucide-react'
import { getProfile, saveProfile } from '../db/profileStore'
import type { NutritionGoals } from '../db'
import { useUnits } from '../hooks/useUnits'
import { useScrollLock } from '../hooks/useScrollLock'
import { useSwipeToClose } from '../hooks/useSwipeToClose'
import './QuickWeightModal.css'
import './FirstDayEditModal.css'

const LBS_PER_KG = 2.20462

/** A scoped edit for exactly the 4 numbers the Dashboard's "Your starting
    point" card shows — current weight, goal weight, daily calories, daily
    protein — saved directly, no navigation anywhere. Before this, the
    card's "Edit" button sent the user through the entire onboarding wizard
    just to change one of these four fields.

    `goals`/`updateGoals` come from the CALLER's own `useNutritionSettings()`
    instance (Dashboard's) rather than this component calling the hook a
    second time — two separate hook instances would each keep their own
    local `goals` state, so saving here wouldn't be reflected in whatever
    the Dashboard is already displaying until a full remount. */
export default function FirstDayEditModal({ goals, updateGoals, onClose, onSaved }: {
  goals: NutritionGoals
  updateGoals: (updates: Partial<NutritionGoals>) => void
  onClose: () => void
  onSaved: () => void
}) {
  const units = useUnits()
  const [currentWeight, setCurrentWeight] = useState('')
  const [goalWeight,    setGoalWeight]    = useState('')
  const [calories,      setCalories]     = useState(String(goals.calories))
  const [protein,       setProtein]      = useState(String(goals.proteinG))
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [saving,  setSaving]  = useState(false)

  useScrollLock()
  const swipe = useSwipeToClose(onClose)

  useEffect(() => {
    getProfile().then(p => {
      const toDisplay = (kg?: number) => kg == null ? '' : String(Math.round((units.weight === 'kg' ? kg : kg * LBS_PER_KG) * 10) / 10)
      setCurrentWeight(toDisplay(p?.startWeightKg))
      setGoalWeight(toDisplay(p?.goalWeightKg))
      setProfileLoaded(true)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSave() {
    setSaving(true)
    try {
      const existing = await getProfile()
      const toKg = (v: string) => {
        const n = parseFloat(v)
        if (isNaN(n) || n <= 0) return undefined
        return +(units.weight === 'kg' ? n : n / LBS_PER_KG).toFixed(1)
      }
      await saveProfile({
        ...existing,
        name: existing?.name ?? '',
        startWeightKg: toKg(currentWeight) ?? existing?.startWeightKg,
        goalWeightKg: toKg(goalWeight) ?? existing?.goalWeightKg,
      })

      const calNum  = parseInt(calories)
      const protNum = parseInt(protein)
      updateGoals({
        ...(isNaN(calNum)  || calNum  <= 0 ? {} : { calories: calNum }),
        ...(isNaN(protNum) || protNum <= 0 ? {} : { proteinG: protNum }),
      })

      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="qw-overlay" onClick={onClose}>
      <div className="qw-modal fde-modal" onClick={e => e.stopPropagation()} style={swipe.style}>
        <div className="qw-header" {...swipe.handlers}>
          <div className="modal-grabber" />
          <h2>Edit Starting Point</h2>
          <button className="qw-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="fde-body">
          <div className="fde-row">
            <label>Current Weight</label>
            <div className="fde-input-wrap">
              <input type="text" inputMode="decimal" value={currentWeight} placeholder="0"
                onChange={e => setCurrentWeight(e.target.value.replace(/[^0-9.]/g, ''))}
                onFocus={e => e.target.select()} disabled={!profileLoaded} />
              <span>{units.weight}</span>
            </div>
          </div>
          <div className="fde-row">
            <label>Goal Weight</label>
            <div className="fde-input-wrap">
              <input type="text" inputMode="decimal" value={goalWeight} placeholder="0"
                onChange={e => setGoalWeight(e.target.value.replace(/[^0-9.]/g, ''))}
                onFocus={e => e.target.select()} disabled={!profileLoaded} />
              <span>{units.weight}</span>
            </div>
          </div>
          <div className="fde-row">
            <label>Daily Calories</label>
            <div className="fde-input-wrap">
              <input type="text" inputMode="numeric" value={calories} placeholder="0"
                onChange={e => setCalories(e.target.value.replace(/[^0-9]/g, ''))}
                onFocus={e => e.target.select()} disabled={!profileLoaded} />
              <span>cal</span>
            </div>
          </div>
          <div className="fde-row">
            <label>Daily Protein</label>
            <div className="fde-input-wrap">
              <input type="text" inputMode="numeric" value={protein} placeholder="0"
                onChange={e => setProtein(e.target.value.replace(/[^0-9]/g, ''))}
                onFocus={e => e.target.select()} disabled={!profileLoaded} />
              <span>g</span>
            </div>
          </div>

          <button className="qw-save" onClick={() => void handleSave()} disabled={!profileLoaded || saving}>
            {saving ? 'Saving…' : <><Check size={16} /> Save</>}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
