import { useRef, useState } from 'react'
import type { TouchEvent } from 'react'

/** Vertical swipe-to-page with a live "peek" of the adjacent item sliding
    in from the edge as the finger drags — not just a threshold-triggered
    instant jump (useSwipePage's pattern), but a carousel-style drag that
    tracks the finger 1:1 and only commits the index change once released
    past the threshold, springing back otherwise. Built for PhotoLightbox's
    same-date photo browsing: swiping should feel like physically dragging
    the next/previous photo into view, not a blind left/right page-flip. */
export function useVerticalPeekSwipe({
  index, count, onChange,
}: {
  index: number
  count: number
  onChange: (next: number) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const startY = useRef(0)
  const heightRef = useRef(300)
  const [dragY, setDragY] = useState(0)
  const [animating, setAnimating] = useState(false)

  function onTouchStart(e: TouchEvent) {
    if (animating) return
    startY.current = e.touches[0].clientY
    heightRef.current = containerRef.current?.clientHeight || 300
  }

  function onTouchMove(e: TouchEvent) {
    if (animating) return
    const raw = e.touches[0].clientY - startY.current
    const atTop = index <= 0
    const atBottom = index >= count - 1
    // Dragging down (raw > 0) would reveal the previous photo; dragging up
    // reveals the next one — resist (don't fully follow the finger) past
    // either end instead of allowing an endless drag with nothing to show.
    let next = raw
    if (raw > 0 && atTop) next = raw * 0.25
    if (raw < 0 && atBottom) next = raw * 0.25
    const max = heightRef.current
    setDragY(Math.max(-max, Math.min(max, next)))
  }

  function onTouchEnd() {
    if (animating) return
    const h = heightRef.current || 1
    const threshold = h * 0.22
    if (dragY > threshold && index > 0) {
      settle(h, () => onChange(index - 1))
    } else if (dragY < -threshold && index < count - 1) {
      settle(-h, () => onChange(index + 1))
    } else {
      settle(0)
    }
  }

  function settle(target: number, after?: () => void) {
    setAnimating(true)
    setDragY(target)
    window.setTimeout(() => {
      after?.()
      setAnimating(false)
      setDragY(0)
    }, 260)
  }

  return {
    containerRef,
    dragY,
    animating,
    handlers: { onTouchStart, onTouchMove, onTouchEnd },
  }
}
