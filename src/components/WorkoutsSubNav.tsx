import { NavLink } from 'react-router-dom'
import { Dumbbell, Clock, TrendingUp } from 'lucide-react'
import './WorkoutsSubNav.css'

/** Shared sub-nav for every /workouts/* page. Previously copy-pasted once
    per page (five near-identical copies) — now one place to add, remove, or
    reorder a tab. Deliberately just 3 tabs: Templates and Check-Ins used to
    be separate tabs here but were cramming the bar at normal widths —
    Templates now lives behind the Today page's "Template" button
    (CreateTemplateModal/TemplatePickerSheet), and Check-Ins is the default
    view on the Progress tab instead of its own destination. */
export default function WorkoutsSubNav() {
  return (
    <nav className="workouts-subnav">
      <NavLink to="/workouts" end className={({ isActive }) => `wsn-item ${isActive ? 'wsn-item--active' : ''}`}>
        <Dumbbell size={15} /><span>Today</span>
      </NavLink>
      <NavLink to="/workouts/history" className={({ isActive }) => `wsn-item ${isActive ? 'wsn-item--active' : ''}`}>
        <Clock size={15} /><span>History</span>
      </NavLink>
      <NavLink to="/workouts/progress" className={({ isActive }) => `wsn-item ${isActive ? 'wsn-item--active' : ''}`}>
        <TrendingUp size={15} /><span>Progress</span>
      </NavLink>
    </nav>
  )
}
