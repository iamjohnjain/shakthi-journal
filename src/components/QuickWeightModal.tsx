import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Check } from 'lucide-react'
import { getLog, saveLog } from '../db/logStore'
import { useUnits } from '../hooks/useUnits'
import { useScrollLock } from '../hooks/useScrollLock'
import { useSwipeToClose } from '../hooks/useSwipeToClose'
import { localDateStr } from '../data/config'
import AnimatedOverlay from './motion/AnimatedOverlay'
import AnimatedSheet from './motion/AnimatedSheet'
import Dial from './Dial'
import { getLatestWeightRecord } from '../db/healthStore'
import { getProfile } from '../db/profileStore'
import './QuickWeightModal.css'

function todayStr() { return localDateStr() }

const LBS_PER_KG = 2.20462

/**
 * The one-field version of logging a weigh-in — the full /log page has
 * resting HR, sleep, mood, energy, workout notes, etc., which is a lot of
 * scrolling for the single number most people actually want to log day to
 * day. This opens instantly from the dashboard's "Log Weight" quick action,
 * saves just the weight (preserving anything else already logged for today),
 * and links out to the full form only for people who want it.
 */
export default function QuickWeightModal({ onClose, onSaved }: {
  onClose: () => void
  onSaved: () => void
}) {
  const units = useUnits()
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useScrollLock()
  const swipe = useSwipeToClose(onClose)

  // Start the dial at today's weigh-in, else the most recent one, else the
  // profile's starting weight — so it's one small nudge away, not a long scroll.
  useEffect(() => {
    ;(async () => {
      const log = await getLog(todayStr())
      const latest = log?.weightKg != null ? null : await getLatestWeightRecord().catch(() => null)
      const profile = log?.weightKg != null || latest ? null : await getProfile().catch(() => null)
      const kg = log?.weightKg ?? latest?.valueKg ?? profile?.startWeightKg
      const display = kg != null
        ? (units.weight === 'kg' ? kg : kg * LBS_PER_KG)
        : (units.weight === 'kg' ? 80 : 180)
      setValue((Math.round(display * 10) / 10).toString())
      setLoaded(true)
    })()
  }, [units.weight])

  const isKg = units.weight === 'kg'
  const min = isKg ? 30 : 66
  const max = isKg ? 200 : 440

  async function handleSave() {
    const num = parseFloat(value)
    if (!num || num <= 0) return
    setSaving(true)
    const weightKg = units.weight === 'kg' ? num : num / LBS_PER_KG
    const existing = await getLog(todayStr())
    await saveLog({
      ...existing,
      date: todayStr(),
      weightKg: +weightKg.toFixed(2),
    })
    setSaving(false)
    onSaved()
    onClose()
  }

  return createPortal(
    <AnimatedOverlay className="qw-overlay" onClick={onClose}>
      <AnimatedSheet className="qw-modal" onClick={e => e.stopPropagation()} style={swipe.style}>
        <div className="qw-header" {...swipe.handlers}>
          <div className="modal-grabber" />
          <h2>Log Weight</h2>
          <button className="qw-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="qw-body">
          {loaded && (
            <Dial
              min={min}
              max={max}
              step={0.1}
              value={Math.min(max, Math.max(min, parseFloat(value) || min))}
              onChange={v => setValue(v.toFixed(1))}
              format={v => v.toFixed(1)}
              labelFormat={v => String(Math.round(v))}
              unit={units.weight}
              labelEvery={10}
              midEvery={5}
              gap={9}
              editable
              ariaLabel="Weight"
            />
          )}

          <button className="qw-save" onClick={handleSave} disabled={!value || saving}>
            {saving ? 'Saving…' : <><Check size={16} /> Save</>}
          </button>
        </div>
      </AnimatedSheet>
    </AnimatedOverlay>,
    document.body
  )
}
