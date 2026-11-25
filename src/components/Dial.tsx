import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import './Dial.css'

/**
 * A horizontal ruler dial — drag or flick anywhere across its full width.
 *
 * - The selected value is the biggest thing on screen, in tabular figures,
 *   and only the digits that changed roll (up when the value goes up, down
 *   when it goes down), with a touch of motion blur.
 * - One accent color, only on the needle.
 * - Native scrolling gives real inertia; when it comes to rest it snaps to
 *   the nearest step.
 * - Each step passing makes a soft tick (sound + vibration where available).
 * - Glows on hover/focus; arrow keys step it.
 */
export interface DialProps {
  min: number
  max: number
  step: number
  value: number
  onChange: (v: number) => void
  /** Big readout text. Defaults to the value with the step's decimals. */
  format?: (v: number) => string
  /** Ruler label text for labeled ticks. Defaults to `format`. */
  labelFormat?: (v: number) => string
  unit?: string
  /** Steps between labeled (tallest) ticks. */
  labelEvery?: number
  /** Steps between medium ticks (0 = none). */
  midEvery?: number
  /** Pixels between adjacent steps. */
  gap?: number
  /** Tap the number to type a value. */
  editable?: boolean
  ariaLabel?: string
  sound?: boolean
}

function decimalsOf(n: number) {
  const s = String(n)
  return s.includes('.') ? s.split('.')[1].length : 0
}

// ─── Tick feedback ────────────────────────────────────────────────────────────

let audioCtx: AudioContext | null = null
let lastTickAt = 0
function unlockAudio() {
  if (audioCtx) { if (audioCtx.state === 'suspended') void audioCtx.resume(); return }
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (Ctx) audioCtx = new Ctx()
  } catch { /* no audio */ }
}
function tick(sound: boolean) {
  const now = performance.now()
  if (now - lastTickAt < 28) return // a fast flick shouldn't buzz
  lastTickAt = now
  try { navigator.vibrate?.(3) } catch { /* unsupported */ }
  if (!sound || !audioCtx || audioCtx.state !== 'running') return
  const t = audioCtx.currentTime
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(2200, t)
  osc.frequency.exponentialRampToValueAtTime(900, t + 0.012)
  gain.gain.setValueAtTime(0.045, t)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03)
  osc.connect(gain).connect(audioCtx.destination)
  osc.start(t)
  osc.stop(t + 0.035)
}

// ─── Rolling readout ─────────────────────────────────────────────────────────

function RollingNumber({ text, dir }: { text: string; dir: 'up' | 'down' }) {
  // Right-aligned so units stay put and the changed digit is keyed by its
  // place value; only characters that actually changed remount + animate.
  const chars = text.split('')
  return (
    <span className="dial-number" aria-hidden="true">
      {chars.map((c, i) => {
        const place = chars.length - i
        return (
          <span key={`${place}-${c}`} className={`dial-digit dial-digit--${dir}`}>{c}</span>
        )
      })}
    </span>
  )
}

// ─── Dial ─────────────────────────────────────────────────────────────────────

export default function Dial({
  min, max, step, value, onChange, format, labelFormat, unit,
  labelEvery = 10, midEvery = 5, gap = 10, editable = false, ariaLabel, sound = true,
}: DialProps) {
  const decimals = decimalsOf(step)
  const steps = Math.round((max - min) / step)
  const toValue = useCallback((i: number) => +(min + i * step).toFixed(decimals), [min, step, decimals])
  const toIndex = useCallback((v: number) => Math.min(steps, Math.max(0, Math.round((v - min) / step))), [min, step, steps])
  const fmt = format ?? ((v: number) => v.toFixed(decimals))
  const lbl = labelFormat ?? fmt

  const scrollerRef = useRef<HTMLDivElement>(null)
  const indexRef = useRef(toIndex(value))   // index the dial is currently showing
  const settleTimer = useRef<ReturnType<typeof setTimeout>>()
  const touching = useRef(false)
  const programmatic = useRef(false)
  const [dir, setDir] = useState<'up' | 'down'>('up')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  // Follow external value changes (typing, parent resets) without echo.
  useLayoutEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const i = toIndex(value)
    if (Math.abs(el.scrollLeft - i * gap) < 1) { indexRef.current = i; return }
    if (i === indexRef.current && el.scrollLeft !== 0) return
    indexRef.current = i
    programmatic.current = true
    el.scrollLeft = i * gap
    requestAnimationFrame(() => { programmatic.current = false })
  }, [value, gap, toIndex])

  function settle() {
    const el = scrollerRef.current
    if (!el || touching.current) return
    const i = Math.round(el.scrollLeft / gap)
    if (Math.abs(el.scrollLeft - i * gap) > 0.5) el.scrollTo({ left: i * gap, behavior: 'smooth' })
  }

  function onScroll() {
    const el = scrollerRef.current
    if (!el) return
    const i = Math.min(steps, Math.max(0, Math.round(el.scrollLeft / gap)))
    if (i !== indexRef.current) {
      setDir(i > indexRef.current ? 'up' : 'down')
      indexRef.current = i
      if (!programmatic.current) {
        tick(sound)
        onChange(toValue(i))
      }
    }
    if (settleTimer.current) clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(settle, 120)
  }

  function nudge(delta: number) {
    const i = Math.min(steps, Math.max(0, indexRef.current + delta))
    scrollerRef.current?.scrollTo({ left: i * gap, behavior: 'smooth' })
  }

  function commitDraft() {
    setEditing(false)
    const n = parseFloat(draft)
    if (!isNaN(n)) {
      const clamped = Math.min(max, Math.max(min, n))
      setDir(clamped >= value ? 'up' : 'down')
      onChange(toValue(toIndex(clamped)))
    }
  }

  useEffect(() => () => { if (settleTimer.current) clearTimeout(settleTimer.current) }, [])

  // Ruler geometry: tick layers are repeating backgrounds (cheap even for
  // thousands of steps); only labeled ticks get real elements.
  const rulerWidth = steps * gap + 2
  const labels: number[] = []
  for (let i = 0; i <= steps; i += labelEvery) labels.push(i)
  const tickLayer = (every: number, h: string) =>
    `linear-gradient(to right, var(--dial-tick) 0 1.5px, transparent 1.5px) 0 10px / ${every * gap}px ${h} repeat-x`
  const rulerBg = [
    tickLayer(labelEvery, '48%'),
    ...(midEvery > 0 ? [tickLayer(midEvery, '34%')] : []),
    tickLayer(1, '22%'),
  ].join(', ')

  const shown = toValue(toIndex(value))

  return (
    <div className="dial">
      <div className="dial-readout">
        {editable && editing ? (
          <input
            className="dial-input"
            inputMode="decimal"
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value.replace(/[^0-9.]/g, ''))}
            onBlur={commitDraft}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          />
        ) : (
          <button
            type="button"
            className="dial-readout-btn"
            data-no-press-glow
            disabled={!editable}
            onClick={() => { setDraft(String(shown)); setEditing(true) }}
            aria-label={editable ? `${fmt(shown)} ${unit ?? ''}, tap to type` : undefined}
          >
            <RollingNumber text={fmt(shown)} dir={dir} />
          </button>
        )}
        {unit && <span className="dial-unit">{unit}</span>}
      </div>

      <div
        className="dial-track-wrap"
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={shown}
        aria-valuetext={`${fmt(shown)}${unit ? ' ' + unit : ''}`}
        onKeyDown={e => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); nudge(1) }
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); nudge(-1) }
        }}
      >
        <div
          className="dial-scroller"
          ref={scrollerRef}
          onScroll={onScroll}
          onPointerDown={unlockAudio}
          onTouchStart={() => { touching.current = true; unlockAudio() }}
          onTouchEnd={() => {
            touching.current = false
            if (settleTimer.current) clearTimeout(settleTimer.current)
            settleTimer.current = setTimeout(settle, 120)
          }}
        >
          <div className="dial-track">
            <div className="dial-ruler" style={{ width: rulerWidth, background: rulerBg }}>
              {labels.map(i => (
                <span key={i} className="dial-label" style={{ left: i * gap }}>{lbl(toValue(i))}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="dial-needle" aria-hidden="true" />
      </div>
    </div>
  )
}
