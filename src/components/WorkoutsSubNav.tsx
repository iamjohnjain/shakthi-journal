import { NavLink } from 'react-router-dom'
import { Dumbbell, Clock, TrendingUp, LayoutTemplate } from 'lucide-react'
import './WorkoutsSubNav.css'

/** Shared sub-nav for every /workouts/* page. Previously copy-pasted once
    per page (five near-identical copies) — now one place to add, remove, or
    reorder a tab. */
export default function WorkoutsSubNav() {
  return (
    <nav className="workouts-subnav">
      <NavLink to="/workouts" end className={({ isActive }) => `wsn-item ${isActive ? 'wsn-item--active' : ''}`}>
        <Dumbbell size={14} /><span>Today</span>
      </NavLink>
      <NavLink to="/workouts/history" className={({ isActive }) => `wsn-item ${isActive ? 'wsn-item--active' : ''}`}>
        <Clock size={14} /><span>History</span>
      </NavLink>
      <NavLink to="/workouts/progress" className={({ isActive }) => `wsn-item ${isActive ? 'wsn-item--active' : ''}`}>
        <TrendingUp size={14} /><span>Progress</span>
      </NavLink>
      <NavLink to="/workouts/templates" className={({ isActive }) => `wsn-item ${isActive ? 'wsn-item--active' : ''}`}>
        <LayoutTemplate size={14} /><span>Templates</span>
      </NavLink>
    </nav>
  )
}
