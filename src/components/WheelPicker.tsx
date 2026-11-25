import { useEffect, useRef } from 'react'
import './WheelPicker.css'

interface WheelPickerProps {
  values: (string | number)[]
  value: string | number
  onChange: (v: string | number) => void
  itemHeight?: number
  visibleCount?: number
  /** 'horizontal' swaps every scrollTop/height calculation below to
      scrollLeft/width — used for a left-to-right wheel (e.g. the
      onboarding weight-loss-rate control) where a vertical wheel doesn't
      fit the gesture. Same snap-to-value behavior either way. */
  direction?: 'vertical' | 'horizontal'
}

/**
 * A scrollable, snap-to-value picker (iOS-style wheel). Scrolling settles on
 * the nearest item; `value` can also be changed externally (e.g. by typing
 * in a paired text input) and the wheel will scroll to match.
 */
export default function WheelPicker({
  values, value, onChange, itemHeight = 36, visibleCount = 3, direction = 'vertical',
}: WheelPickerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const settleTimer = useRef<ReturnType<typeof setTimeout>>()
  const programmatic = useRef(false)
  const horizontal = direction === 'horizontal'
  const itemSize = itemHeight
  const size = itemSize * visibleCount
  const pad = (size - itemSize) / 2

  // Keep the wheel in sync when `value` changes from outside (typing, preset fill).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const idx = values.indexOf(value)
    if (idx < 0) return
    const target = idx * itemSize
    const current = horizontal ? el.scrollLeft : el.scrollTop
    if (Math.abs(current - target) < 1) return
    programmatic.current = true
    el.scrollTo(horizontal ? { left: target, behavior: 'auto' } : { top: target, behavior: 'auto' })
    const t = setTimeout(() => { programmatic.current = false }, 50)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, values.length, horizontal])

  function handleScroll() {
    if (programmatic.current) return
    if (settleTimer.current) clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(() => {
      const el = ref.current
      if (!el) return
      const pos = horizontal ? el.scrollLeft : el.scrollTop
      const idx = Math.round(pos / itemSize)
      const clamped = Math.min(values.length - 1, Math.max(0, idx))
      if (values[clamped] !== value) onChange(values[clamped])
    }, 100)
  }

  const sizeStyle = horizontal
    ? { width: size, ['--wp-item' as string]: `${itemSize}px` } as React.CSSProperties
    : { height: size }
  const itemSizeStyle = horizontal ? { width: itemSize } : { height: itemSize }
  // flexShrink 0: in the horizontal (flex) layout the end spacers otherwise
  // shrink to nothing, and the first/last values can't scroll to the center.
  const padStyle = horizontal ? { width: pad, flexShrink: 0 } : { height: pad, flexShrink: 0 }

  return (
    <div
      className={`wheel-picker ${horizontal ? 'wheel-picker--horizontal' : ''}`}
      style={sizeStyle}
      ref={ref}
      onScroll={handleScroll}
    >
      <div style={padStyle} />
      {values.map(v => (
        <button
          key={v}
          type="button"
          className={`wheel-picker-item ${v === value ? 'wheel-picker-item--active' : ''}`}
          style={itemSizeStyle}
          onClick={() => onChange(v)}
        >
          {v}
        </button>
      ))}
      <div style={padStyle} />
      {!horizontal && <div className="wheel-picker-highlight" style={itemSizeStyle} />}
    </div>
  )
}
