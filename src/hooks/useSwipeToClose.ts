import { useRef, useState } from 'react'
import type { TouchEvent, CSSProperties } from 'react'

/**
 * Swipe-down-to-dismiss for a bottom-sheet style modal. Spread `handlers` onto
 * a drag handle (the modal's header, not its scrollable body — otherwise a
 * downward scroll gesture inside the content gets mistaken for a dismiss),
 * and apply `style` to the modal's outer container so the whole sheet slides
 * with the finger and springs back if the drag doesn't clear the threshold.
 */
export function useSwipeToClose(onClose: () => void, threshold = 80) {
  const startY = useRef<number | null>(null)
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)

  function onTouchStart(e: TouchEvent) {
    startY.current = e.touches[0].clientY
    setDragging(true)
  }

  function onTouchMove(e: TouchEvent) {
    if (startY.current == null) return
    const delta = e.touches[0].clientY - startY.current
    if (delta > 0) setDragY(delta)
  }

  function onTouchEnd() {
    setDragging(false)
    startY.current = null
    if (dragY > threshold) {
      onClose()
    } else {
      setDragY(0)
    }
  }

  const style: CSSProperties | undefined = dragY > 0 ? {
    transform: `translateY(${dragY}px)`,
    transition: dragging ? 'none' : 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
  } : undefined

  return {
    handlers: { onTouchStart, onTouchMove, onTouchEnd },
    style,
  }
}
