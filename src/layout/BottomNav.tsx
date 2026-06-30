import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Dumbbell, Apple, Clock, Target, UserCircle, Plus } from 'lucide-react'
import './BottomNav.css'

const LEFT_TABS = [
  { path: '/',         label: 'Today', icon: LayoutDashboard, end: true },
  { path: '/workouts', label: 'Train', icon: Dumbbell },
]

const RIGHT_TABS = [
  { path: '/nutrition', label: 'Eat',      icon: Apple },
  { path: '/timeline',  label: 'Timeline', icon: Clock },
  { path: '/goals',     label: 'Goals',    icon: Target },
]

export default function BottomNav() {
  return (
    <nav className="bottom-nav">
      {LEFT_TABS.map(tab => (
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

      <NavLink
        to="/log"
        className={({ isActive }) => `bottom-tab-fab ${isActive ? 'active' : ''}`}
        aria-label="Daily Log"
      >
        <Plus size={26} strokeWidth={2.2} />
      </NavLink>

      {RIGHT_TABS.map(tab => (
        <NavLink
          key={tab.path}
          to={tab.path}
          className={({ isActive }) => `bottom-tab ${isActive ? 'active' : ''}`}
        >
          <tab.icon size={22} className="bottom-tab-icon" />
          <span className="bottom-tab-label">{tab.label}</span>
        </NavLink>
      ))}

      <NavLink
        to="/profile"
        className={({ isActive }) => `bottom-tab ${isActive ? 'active' : ''}`}
      >
        <UserCircle size={22} className="bottom-tab-icon" />
        <span className="bottom-tab-label">Me</span>
      </NavLink>
    </nav>
  )
}
