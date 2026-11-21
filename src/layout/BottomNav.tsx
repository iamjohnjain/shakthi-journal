import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Dumbbell, LayoutDashboard, Apple, Sparkles } from 'lucide-react'
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

// Four core tabs, Today centered — profile is reached via the avatar icon
// on the Today header instead of its own tab, and Goals isn't in primary
// nav for now (still reachable at /goals, just not a bottom-nav slot).
const TABS = [
  { path: '/workouts',  label: 'Workout', icon: Dumbbell },
  { path: '/',          label: 'Today',   icon: LayoutDashboard, end: true },
  { path: '/nutrition', label: 'Meals',   icon: Apple },
  { path: '/ai-coach',  label: 'Coach',   icon: Sparkles },
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

export default function BottomNav() {
  const keyboardOpen = useKeyboardLikelyOpen()
  return (
    <nav className={`bottom-nav ${keyboardOpen ? 'bottom-nav--keyboard-open' : ''}`}>
      {TABS.map(tab => (
        <NavLink
          key={tab.path}
          to={tab.path}
          end={tab.end}
          className={({ isActive }) => `bottom-tab ${isActive ? 'active' : ''}`}
        >
          <tab.icon size={20} className="bottom-tab-icon" />
          <span className="bottom-tab-label">{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
