import { NavLink } from 'react-router-dom'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard, Zap, Apple, Dumbbell,
  Target, TrendingUp, UserCircle, Settings, Clock,
} from 'lucide-react'
import SyncStatusPill from '../components/SyncStatus'
import { AvatarDisplay } from '../components/Avatar'
import { useAuth } from '../context/AuthContext'
import { getProfile } from '../db/profileStore'
import type { ProfileData } from '../db/profileStore'
import './Sidebar.css'

type NavItem = { path: string; label: string; icon: React.ElementType; end?: boolean }

const MAIN_NAV: NavItem[] = [
  { path: '/',          label: 'Today',     icon: LayoutDashboard, end: true },
  { path: '/timeline',  label: 'Timeline',  icon: Clock },
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
  const { mode } = useAuth()
  const [profile, setProfile] = useState<ProfileData | null>(null)

  useEffect(() => {
    getProfile().then(setProfile)
    function onProfileUpdated(e: Event) {
      setProfile((e as CustomEvent<ProfileData>).detail)
    }
    window.addEventListener('profile-updated', onProfileUpdated)
    return () => window.removeEventListener('profile-updated', onProfileUpdated)
  }, [])

  const displayName = profile?.name ?? 'Guest'
  const isGuest = mode === 'guest' || !profile?.name

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <AvatarDisplay
          name={displayName}
          avatarId={profile?.avatarId}
          photoDataUrl={profile?.photoDataUrl}
          size="sm"
        />
        <div className="sidebar-brand">
          <span className="sidebar-name">{displayName}</span>
          <span className="sidebar-tagline">
            {isGuest ? 'Guest · local only' : 'Shakthi Journal'}
          </span>
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
        {mode === 'authenticated' && (
          <div className="sidebar-sync">
            <SyncStatusPill />
          </div>
        )}
      </div>
    </aside>
  )
}
