import { useEffect } from 'react'

let lockCount = 0

/**
 * Prevents the page behind a modal from scrolling/jumping while it's open.
 * Reference-counted so nested or back-to-back modals don't fight over
 * restoring `overflow` early.
 */
export function useScrollLock(active: boolean = true): void {
  useEffect(() => {
    if (!active) return
    lockCount++
    if (lockCount === 1) {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      lockCount--
      if (lockCount === 0) {
        document.body.style.overflow = ''
      }
    }
  }, [active])
}
