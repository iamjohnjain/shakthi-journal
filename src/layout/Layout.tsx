import { useEffect, useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { getSetting, setSetting } from '../db'
import { getProfile } from '../db/profileStore'
import { useAuth } from '../context/AuthContext'
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

  const { mode } = useAuth()

  // .page-content is one scroll box shared by every route, so without this a
  // new page opens at whatever scroll offset the previous one was left at.
  // Remember when Apple Health last synced (native syncs don't write
  // sync_history), for the Apple Health page and Settings status.
  useEffect(() => {
    function onNativeSync() { setSetting('apple-health.lastSyncedAt', new Date().toISOString()).catch(() => {}) }
    window.addEventListener('native-health-sync-complete', onNativeSync)
    return () => window.removeEventListener('native-health-sync-complete', onNativeSync)
  }, [])

  useEffect(() => {
    document.querySelector('.page-content')?.scrollTo(0, 0)
  }, [location.pathname])

  // The Weekly Wrap banner belongs to the Today tab only. Leaving Today, or
  // tapping any other button/link while it's showing, counts as "not now"
  // and dismisses it for good.
  const bannerVisible = !!pendingReview && !showWrap && location.pathname === '/'
  useEffect(() => {
    if (pendingReview && !showWrap && location.pathname !== '/') dismiss()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])
  useEffect(() => {
    if (!bannerVisible) return
    function onClick(e: MouseEvent) {
      const el = e.target as HTMLElement | null
      if (!el || el.closest('.wwb-banner')) return
      if (el.closest('button, a, [role="button"], [role="tab"]')) dismiss()
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bannerVisible])

  // Wait until the session (and, for a returning account, its cloud
  // download) has resolved — checking earlier reads an empty database.
  // An account that already has a profile has been through setup on some
  // device, so it never gets sent back to onboarding.
  useEffect(() => {
    if (mode === 'initializing') return
    let cancelled = false
    ;(async () => {
      if (await getSetting<boolean>('onboarding.completed', false)) return
      const profile = await getProfile()
      if (cancelled) return
      if (profile?.startDate) {
        await setSetting('onboarding.completed', true)
        return
      }
      navigate('/onboarding', { replace: true })
    })()
    return () => { cancelled = true }
  }, [navigate, mode])

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
      {bannerVisible && (
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
