import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { X, Check } from 'lucide-react'
import { getLog, saveLog } from '../db/logStore'
import { useUnits } from '../hooks/useUnits'
import { useScrollLock } from '../hooks/useScrollLock'
import { useSwipeToClose } from '../hooks/useSwipeToClose'
import { localDateStr } from '../data/config'
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
  const navigate = useNavigate()
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
    <div className="qw-overlay" onClick={onClose}>
      <div className="qw-modal" onClick={e => e.stopPropagation()} style={swipe.style}>
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

          <button className="qw-save" onClick={handleSave} disabled={!value || saving}>
            {saving ? 'Saving…' : <><Check size={16} /> Save</>}
          </button>

          <button className="qw-more-link" onClick={() => { onClose(); navigate('/log') }}>
            Log more details (sleep, mood, workout…)
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
