import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import './Layout.css'

export default function Layout() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="page-content">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
