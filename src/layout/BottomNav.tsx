import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Dumbbell, Apple, Target, UserCircle } from 'lucide-react'
import './BottomNav.css'

// Detect native iOS companion app (used by other features, not navigation suppression).
// The native app injects window.__shakthiNativeApp = true before page scripts run.
export function isInsideNativeApp(): boolean {
  return typeof window !== 'undefined' &&
    (window as unknown as Record<string, unknown>).__shakthiNativeApp === true
}

const TABS = [
  { path: '/',          label: 'Today', icon: LayoutDashboard, end: true },
  { path: '/workouts',  label: 'Train', icon: Dumbbell },
  { path: '/nutrition', label: 'Eat',   icon: Apple },
  { path: '/goals',     label: 'Goals', icon: Target },
  { path: '/profile',   label: 'Me',    icon: UserCircle },
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
