import { useRef } from 'react'
import type { TouchEvent } from 'react'

/** Horizontal swipe-to-page gesture — threshold-based X-delta, same pattern
    GoalRing.tsx already uses inline for its goal-type carousel. Extracted
    here so PhotoLightbox (and anything else that wants left/right paging)
    can share it instead of re-deriving the same touch math. `didSwipe`
    lets the caller suppress a resulting tap-to-select on the same element
    the swipe gesture started on. */
export function useSwipePage(onPrev: () => void, onNext: () => void, threshold = 40) {
  const startX = useRef(0)
  const didSwipe = useRef(false)

  function onTouchStart(e: TouchEvent) {
    startX.current = e.touches[0].clientX
    didSwipe.current = false
  }

  function onTouchEnd(e: TouchEvent) {
    const dx = e.changedTouches[0].clientX - startX.current
    if (Math.abs(dx) > threshold) {
      didSwipe.current = true
      if (dx < 0) onNext()
      else onPrev()
    }
  }

  return { onTouchStart, onTouchEnd, didSwipe }
}
