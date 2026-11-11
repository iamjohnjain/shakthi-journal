import { NavLink } from 'react-router-dom'
import { Dumbbell, LayoutDashboard, Apple } from 'lucide-react'
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

// Three core tabs, Today centered — profile is reached via the avatar icon
// on the Today header instead of its own tab, and Goals isn't in primary
// nav for now (still reachable at /goals, just not a bottom-nav slot).
const TABS = [
  { path: '/workouts',  label: 'Workout', icon: Dumbbell },
  { path: '/',          label: 'Today',   icon: LayoutDashboard, end: true },
  { path: '/nutrition', label: 'Meals',   icon: Apple },
]

export default function BottomNav() {
  return (
    <nav className="bottom-nav">
      {TABS.map(tab => (
        <NavLink
          key={tab.path}
          to={tab.path}
          end={tab.end}
          className={({ isActive }) => `bottom-tab ${isActive ? 'active' : ''}`}
        >
          <tab.icon size={22} className="bottom-tab-icon" />
          <span className="bottom-tab-label">{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
