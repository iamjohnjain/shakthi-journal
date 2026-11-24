import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Dumbbell, LayoutDashboard, Utensils, Star } from 'lucide-react'
import './BottomNav.css'

// Detect native iOS companion app (used by other features, not navigation suppression).
// The native app injects window.__jeevanNativeApp = true before page scripts run.
export function isInsideNativeApp(): boolean {
  return typeof window !== 'undefined' &&
    (window as unknown as Record<string, unknown>).__jeevanNativeApp === true
}

// Asks the native iOS wrapper to open its HealthKit sync sheet — shared by
// every "Sync Data" entry point (Dashboard quick action, empty-state
// prompts, the Weight Goal card's own sync nudge).
export function openNativeHealthSync() {
  const w = window as unknown as { webkit?: { messageHandlers?: { jeevanNative?: { postMessage: (m: unknown) => void } } } }
  w?.webkit?.messageHandlers?.jeevanNative?.postMessage({ type: 'openHealthSync' })
}

// Same underlying HealthKit sync, but native never presents its sync/
// dashboard sheet for it — used when a screen just wants fresh data (e.g.
// opening the Weight Goal card) without putting a native screen in front
// of the user just to get it.
export function triggerSilentHealthSync() {
  const w = window as unknown as { webkit?: { messageHandlers?: { jeevanNative?: { postMessage: (m: unknown) => void } } } }
  w?.webkit?.messageHandlers?.jeevanNative?.postMessage({ type: 'silentHealthSync' })
}

// The 3 destinations reachable from the pop-out — icon only, no label, per
// the redesign: Today is the one thing always on screen, these three only
// appear once the user asks for them.
const DESTINATIONS = [
  { path: '/workouts',  label: 'Workout', icon: Dumbbell },
  { path: '/nutrition', label: 'Meals',   icon: Utensils },
  { path: '/ai-coach',  label: 'Coach',   icon: Star },
]

/** Whether an on-screen keyboard is likely open — this nav is
    `position: fixed`, which stays pinned to the LAYOUT viewport, not the
    smaller VISUAL viewport the keyboard actually shrinks. With no
    `visualViewport` resize handling anywhere in this app, the keyboard
    just overlays the bottom of the screen while this nav sits exactly
    where it always does — underneath/overlapping the keyboard instead of
    getting out of its way, which is exactly the "chat box is covered and
    out of frame" bug this was built to fix. Tracking focus on any real
    text input is a simpler, far more broadly-compatible signal than
    trying to detect the keyboard itself. */
function useKeyboardLikelyOpen(): boolean {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    function isTextInput(el: EventTarget | null): boolean {
      if (!(el instanceof HTMLElement)) return false
      return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
    }
    function onFocusIn(e: FocusEvent) { if (isTextInput(e.target)) setOpen(true) }
    function onFocusOut(e: FocusEvent) { if (isTextInput(e.target)) setOpen(false) }
    window.addEventListener('focusin', onFocusIn)
    window.addEventListener('focusout', onFocusOut)
    return () => {
      window.removeEventListener('focusin', onFocusIn)
      window.removeEventListener('focusout', onFocusOut)
    }
  }, [])
  return open
}

/** Collapsed to a single circular "Today" button by default — the only
    thing ever on screen until it's tapped, at which point it pops out
    into a wider pill revealing the 3 destinations (icon only, no labels)
    beside it. Picking one navigates there and collapses back; tapping
    Today again (or the backdrop) collapses without navigating. Tapping
    Today also always navigates home if not already there, so it's never
    a dead end even when nothing's expanded. */
export default function BottomNav() {
  const keyboardOpen = useKeyboardLikelyOpen()
  const [expanded, setExpanded] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const navRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!expanded) return
    function onOutside(e: PointerEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setExpanded(false)
    }
    document.addEventListener('pointerdown', onOutside)
    return () => document.removeEventListener('pointerdown', onOutside)
  }, [expanded])

  // Collapse whenever the route changes (picking a destination, or
  // navigating some other way entirely) rather than staying popped open.
  useEffect(() => { setExpanded(false) }, [location.pathname])

  function onTodayClick() {
    if (location.pathname !== '/') navigate('/')
    setExpanded(v => !v)
  }

  return (
    <nav
      ref={navRef}
      className={`bottom-nav ${keyboardOpen ? 'bottom-nav--keyboard-open' : ''} ${expanded ? 'bottom-nav--expanded' : ''}`}
    >
      <button
        className={`bottom-tab bottom-tab--today ${location.pathname === '/' && !expanded ? 'active' : ''}`}
        onClick={onTodayClick}
        aria-expanded={expanded}
        aria-label="Today"
      >
        <LayoutDashboard size={20} className="bottom-tab-icon" />
      </button>
      {DESTINATIONS.map(d => (
        <button
          key={d.path}
          className="bottom-tab bottom-tab--pop"
          tabIndex={expanded ? 0 : -1}
          aria-hidden={!expanded}
          onClick={() => navigate(d.path)}
          aria-label={d.label}
        >
          <d.icon size={20} className="bottom-tab-icon" />
        </button>
      ))}
    </nav>
  )
}
