import { useState, useRef, useEffect } from 'react'
import { getSetting, setSetting } from '../db'

const REST_TIMER_END_AT_KEY = 'restTimer.endAt'

/** Tracked as a wall-clock end timestamp (persisted to the same IndexedDB
    settings store the rest of the app uses), not a plain decrementing
    counter — a `setInterval` countdown in memory loses all state on a
    reload, and iOS can also throttle/suspend a background tab's timers, so
    a pure "tick -1 every second" counter drifts or resets instead of
    reflecting real elapsed time. Recomputing remaining seconds from
    `endAt - Date.now()` on every tick (and once on mount, to resume after a
    reload or a force-close-and-reopen) is correct regardless of how long
    the JS thread was actually paused.

    Shared by `ActiveWorkout.tsx` (the live in-progress session) and
    `WorkoutsPage.tsx` (a manual trigger for someone logging sets directly,
    without going through "Start") — one persisted timer, so starting it
    from either place behaves the same and survives the same way. */
export function useRestTimer(onDone: () => void) {
  const [restSecs, setRestSecs] = useState<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const endAtRef = useRef<number | null>(null)

  function tick() {
    const endAt = endAtRef.current
    if (endAt == null) return
    const remaining = Math.ceil((endAt - Date.now()) / 1000)
    if (remaining <= 0) {
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = null
      endAtRef.current = null
      setRestSecs(null)
      void setSetting(REST_TIMER_END_AT_KEY, null)
      onDone()
      return
    }
    setRestSecs(remaining)
  }

  function runFrom(endAt: number) {
    if (timerRef.current) clearInterval(timerRef.current)
    endAtRef.current = endAt
    tick()
    timerRef.current = setInterval(tick, 1000)
  }

  // Resume a timer that was running when the app was last closed/reloaded.
  useEffect(() => {
    let cancelled = false
    getSetting<number | null>(REST_TIMER_END_AT_KEY, null).then(endAt => {
      if (cancelled || endAt == null || endAt <= Date.now()) return
      runFrom(endAt)
    })
    return () => {
      cancelled = true
      if (timerRef.current) clearInterval(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function start(secs = 90) {
    const endAt = Date.now() + secs * 1000
    void setSetting(REST_TIMER_END_AT_KEY, endAt)
    runFrom(endAt)
  }

  function stop() {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    endAtRef.current = null
    setRestSecs(null)
    void setSetting(REST_TIMER_END_AT_KEY, null)
  }

  return { restSecs, start, stop }
}

export function formatRestTime(s: number): string {
  const m = Math.floor(s / 60), ss = s % 60
  return `${m}:${String(ss).padStart(2, '0')}`
}
