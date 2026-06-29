import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Heart, Zap, Apple, Dumbbell,
  Target, TrendingUp, UserCircle, Settings,
} from 'lucide-react'
import './Sidebar.css'

type NavItem = { path: string; label: string; icon: React.ElementType; end?: boolean }

const MAIN_NAV: NavItem[] = [
  { path: '/',          label: 'Today',     icon: LayoutDashboard, end: true },
  { path: '/health',    label: 'Health',    icon: Heart },
  { path: '/recovery',  label: 'Recovery',  icon: Zap },
  { path: '/nutrition', label: 'Nutrition', icon: Apple },
  { path: '/workouts',  label: 'Workouts',  icon: Dumbbell },
  { path: '/goals',     label: 'Goals',     icon: Target },
  { path: '/progress',  label: 'Progress',  icon: TrendingUp },
]

const BOTTOM_NAV: NavItem[] = [
  { path: '/profile',  label: 'Profile',  icon: UserCircle },
  { path: '/settings', label: 'Settings', icon: Settings },
]

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-avatar">S</div>
        <div className="sidebar-brand">
          <span className="sidebar-name">Shakthi Journal</span>
          <span className="sidebar-tagline">Health OS</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {MAIN_NAV.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.end}
            className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
          >
            <item.icon size={16} className="sidebar-item-icon" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-bottom">
        {BOTTOM_NAV.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
          >
            <item.icon size={16} className="sidebar-item-icon" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
    </aside>
  )
}
