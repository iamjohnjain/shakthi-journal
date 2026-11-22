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
import WheelPicker from './WheelPicker'
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

  useEffect(() => {
    getLog(todayStr()).then(log => {
      if (log?.weightKg != null) {
        const display = units.weight === 'kg' ? log.weightKg : log.weightKg * LBS_PER_KG
        setValue((Math.round(display * 10) / 10).toString())
      }
      setLoaded(true)
    })
  }, [units.weight])

  // Whole-number and tenths wheels mirror whatever's in the text field, and
  // vice versa — tap-to-type and scroll-to-select both just edit the same
  // `value` string, so neither is a separate "mode" to switch between.
  const wholeRange = units.weight === 'kg'
    ? Array.from({ length: 171 }, (_, i) => 30 + i)   // 30–200 kg
    : Array.from({ length: 375 }, (_, i) => 66 + i)   // 66–440 lbs
  const tenthsRange = Array.from({ length: 10 }, (_, i) => i)
  const parsed = parseFloat(value) || 0
  const wholePart = Math.floor(parsed)
  const tenthPart = Math.round((parsed - wholePart) * 10) % 10

  function setFromWheel(whole: number, tenth: number) {
    setValue(`${whole}.${tenth}`)
  }

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
          <div className="qw-input-row">
            <input
              type="text"
              inputMode="decimal"
              autoFocus
              value={value}
              placeholder="0"
              onChange={e => setValue(e.target.value.replace(/[^0-9.]/g, ''))}
              onFocus={e => e.target.select()}
              disabled={!loaded}
            />
            <span className="qw-unit">{units.weight}</span>
          </div>

          <div className="qw-wheels">
            <WheelPicker
              values={wholeRange}
              value={wholePart || wholeRange[0]}
              onChange={v => setFromWheel(Number(v), tenthPart)}
            />
            <span className="qw-wheels-dot">.</span>
            <WheelPicker
              values={tenthsRange}
              value={tenthPart}
              onChange={v => setFromWheel(wholePart, Number(v))}
            />
          </div>

          <button className="qw-save" onClick={handleSave} disabled={!value || saving}>
            {saving ? 'Saving…' : <><Check size={16} /> Save</>}
          </button>
        </div>
      </AnimatedSheet>
    </AnimatedOverlay>,
    document.body
  )
}
