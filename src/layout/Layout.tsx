import { useEffect, useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { getSetting } from '../db'
import { useWeeklyWrapNotice } from '../hooks/useWeeklyWrapNotice'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import Toast from '../components/Toast'
import WeeklyWrapBanner from '../components/WeeklyWrapBanner'
import WeeklyWrapCard from '../components/WeeklyWrapCard'
import './Layout.css'

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { pendingReview, dismiss } = useWeeklyWrapNotice()
  const [showWrap, setShowWrap] = useState(false)

  useEffect(() => {
    getSetting<boolean>('onboarding.completed', false).then(done => {
      if (!done) navigate('/onboarding', { replace: true })
    })
  }, [navigate])

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="page-content">
        {/* Keying on pathname forces a fresh mount per route, so every
            navigation gets the same fade-in regardless of whether the
            destination page defines its own entrance animation — opacity
            only, see the note below on why transform can't be used here. */}
        <div key={location.pathname} className="page-transition">
          <Outlet />
        </div>
      </main>
      <BottomNav />
      <Toast />
      {pendingReview && !showWrap && (
        <WeeklyWrapBanner onOpen={() => setShowWrap(true)} onDismiss={dismiss} />
      )}
      {pendingReview && showWrap && (
        <WeeklyWrapCard
          review={pendingReview}
          onDone={() => { setShowWrap(false); dismiss() }}
        />
      )}
    </div>
  )
}
