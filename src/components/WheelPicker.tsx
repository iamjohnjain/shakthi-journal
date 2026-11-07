import { useEffect, useRef } from 'react'
import './WheelPicker.css'

interface WheelPickerProps {
  values: (string | number)[]
  value: string | number
  onChange: (v: string | number) => void
  itemHeight?: number
  visibleCount?: number
}

/**
 * A scrollable, snap-to-value picker (iOS-style wheel). Scrolling settles on
 * the nearest item; `value` can also be changed externally (e.g. by typing
 * in a paired text input) and the wheel will scroll to match.
 */
export default function WheelPicker({
  values, value, onChange, itemHeight = 36, visibleCount = 3,
}: WheelPickerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const settleTimer = useRef<ReturnType<typeof setTimeout>>()
  const programmatic = useRef(false)
  const height = itemHeight * visibleCount
  const pad = (height - itemHeight) / 2

  // Keep the wheel in sync when `value` changes from outside (typing, preset fill).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const idx = values.indexOf(value)
    if (idx < 0) return
    const target = idx * itemHeight
    if (Math.abs(el.scrollTop - target) < 1) return
    programmatic.current = true
    el.scrollTo({ top: target, behavior: 'auto' })
    const t = setTimeout(() => { programmatic.current = false }, 50)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, values.length])

  function handleScroll() {
    if (programmatic.current) return
    if (settleTimer.current) clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(() => {
      const el = ref.current
      if (!el) return
      const idx = Math.round(el.scrollTop / itemHeight)
      const clamped = Math.min(values.length - 1, Math.max(0, idx))
      if (values[clamped] !== value) onChange(values[clamped])
    }, 100)
  }

  return (
    <div className="wheel-picker" style={{ height }} ref={ref} onScroll={handleScroll}>
      <div style={{ height: pad }} />
      {values.map(v => (
        <button
          key={v}
          type="button"
          className={`wheel-picker-item ${v === value ? 'wheel-picker-item--active' : ''}`}
          style={{ height: itemHeight }}
          onClick={() => onChange(v)}
        >
          {v}
        </button>
      ))}
      <div style={{ height: pad }} />
      <div className="wheel-picker-highlight" style={{ height: itemHeight }} />
    </div>
  )
}
