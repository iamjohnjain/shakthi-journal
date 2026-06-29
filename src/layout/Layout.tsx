import { useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { getSetting } from '../db'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import './Layout.css'

export default function Layout() {
  const navigate = useNavigate()

  useEffect(() => {
    getSetting<boolean>('onboarding.completed', false).then(done => {
      if (!done) navigate('/onboarding', { replace: true })
    })
  }, [navigate])

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
