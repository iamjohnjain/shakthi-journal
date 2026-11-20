import { useRef, useState, useEffect, type ReactNode, type TouchEvent as ReactTouchEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { isInsideNativeApp, openNativeHealthSync } from '../layout/BottomNav'
import { useLastSynced } from '../hooks/useLastSynced'
import { formatDateTime } from '../data/config'
import './PullToRefresh.css'

const PULL_RESISTANCE = 0.5   // rubber-band feel — half the raw finger movement
const PULL_THRESHOLD = 64     // px of (resisted) pull needed before release triggers a sync
const MAX_PULL = 96           // px cap on how far the indicator can be dragged out
const RING_RADIUS = 15
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

/** Native iOS-style pull-to-refresh, replacing the old "Sync Data" quick-
    action button: swipe down and hold from the top of the page to reveal a
    circular progress ring that fills with the pull distance, release past
    the threshold to trigger a real sync. Scoped to the nearest `.page-content`
    ancestor (the app's actual scroll container, not the window) — only
    engages the gesture when that container is already scrolled to its top,
    so it never fights normal scrolling partway down the page. */
export default function PullToRefresh({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const lastSyncedAt = useLastSynced()
  const rootRef = useRef<HTMLDivElement>(null)
  const scrollElRef = useRef<Element | null>(null)
  const startYRef = useRef(0)
  const trackingRef = useRef(false)
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    scrollElRef.current = rootRef.current?.closest('.page-content') ?? null
  }, [])

  useEffect(() => {
    if (!refreshing) return
    function onNativeSync() { setRefreshing(false); setPull(0) }
    window.addEventListener('native-health-sync-complete', onNativeSync)
    return () => window.removeEventListener('native-health-sync-complete', onNativeSync)
  }, [refreshing])

  function onTouchStart(e: ReactTouchEvent) {
    if (refreshing) return
    const scrollEl = scrollElRef.current
    if (!scrollEl || scrollEl.scrollTop > 0) return
    startYRef.current = e.touches[0].clientY
    trackingRef.current = true
  }

  function onTouchMove(e: ReactTouchEvent) {
    if (!trackingRef.current) return
    const dy = e.touches[0].clientY - startYRef.current
    if (dy <= 0) { setPull(0); trackingRef.current = false; return }
    const resisted = Math.min(MAX_PULL, dy * PULL_RESISTANCE)
    setPull(resisted)
    // Only steal the gesture from the page once it's clearly a deliberate
    // pull — a few px of resisted movement shouldn't block a normal tap/
    // scroll-adjacent touch from behaving normally.
    if (resisted > 8) e.preventDefault()
  }

  function onTouchEnd() {
    if (!trackingRef.current) return
    trackingRef.current = false
    if (pull >= PULL_THRESHOLD) {
      triggerSync()
    } else {
      setPull(0)
    }
  }

  function triggerSync() {
    if (isInsideNativeApp()) {
      setRefreshing(true)
      setPull(PULL_THRESHOLD)
      openNativeHealthSync()
      // Resolves via the native-health-sync-complete listener above — the
      // native layer fires it once HealthKit data has actually landed.
    } else {
      // No HealthKit outside the native wrapper — same fallback the old
      // quick-action button used.
      setPull(0)
      navigate('/import/apple-health')
    }
  }

  const progress = Math.min(1, pull / PULL_THRESHOLD)
  const dashOffset = RING_CIRCUMFERENCE * (1 - progress)

  return (
    <div
      ref={rootRef}
      className="ptr-root"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <div className="ptr-indicator" style={{ height: pull, opacity: pull > 4 ? 1 : 0 }}>
        <div className="ptr-ring-wrap">
          <svg className={`ptr-ring ${refreshing ? 'ptr-ring--spinning' : ''}`} viewBox="0 0 36 36">
            <defs>
              <linearGradient id="ptr-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#A66BF5" />
                <stop offset="100%" stopColor="#5B7FFF" />
              </linearGradient>
            </defs>
            <circle className="ptr-ring-track" cx="18" cy="18" r={RING_RADIUS} />
            <circle
              className="ptr-ring-fill"
              cx="18" cy="18" r={RING_RADIUS}
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={refreshing ? RING_CIRCUMFERENCE * 0.25 : dashOffset}
            />
          </svg>
          <RefreshCw size={14} className={`ptr-icon ${refreshing ? 'ptr-icon--spinning' : ''}`} />
        </div>
        <span className="ptr-label">
          {refreshing ? 'Syncing…' : progress >= 1 ? 'Release to sync' : 'Sync Data'}
        </span>
        {lastSyncedAt && !refreshing && (
          <span className="ptr-last-synced">Last synced {formatDateTime(lastSyncedAt)}</span>
        )}
      </div>
      {children}
    </div>
  )
}
