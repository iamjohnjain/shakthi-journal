import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, Heart, RefreshCw, Footprints, Scale, Moon, Activity, Dumbbell, FileUp, Settings2,
} from 'lucide-react'
import { triggerSilentHealthSync } from '../layout/BottomNav'
import { useAppleHealthStatus, timeAgo } from '../hooks/useAppleHealthStatus'
import { JSection, JRow } from './Settings'
import './Settings.css'

function openNativeHealthSheet() {
  const w = window as unknown as { webkit?: { messageHandlers?: { jeevanNative?: { postMessage: (m: unknown) => void } } } }
  w.webkit?.messageHandlers?.jeevanNative?.postMessage({ type: 'openHealthSync' })
}

const SYNCED = [
  { icon: Footprints, label: 'Steps & Activity',   desc: 'Steps, active calories, exercise minutes' },
  { icon: Scale,      label: 'Weight & Body Fat',  desc: 'From any smart scale that writes to Health' },
  { icon: Moon,       label: 'Sleep',              desc: 'Time asleep and sleep stages' },
  { icon: Activity,   label: 'Heart Rate & HRV',   desc: 'Resting heart rate and variability' },
  { icon: Dumbbell,   label: 'Workouts',           desc: 'Sessions recorded by your watch or apps' },
]

/** Apple Health is the only data source the app connects to — watches,
    scales, rings and other apps all reach Jeevan through it — so this page
    is just its status and a Sync button. */
export default function ConnectedAccounts() {
  const navigate = useNavigate()
  const { inNativeApp, connected, lastSyncedAt, loading } = useAppleHealthStatus()
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    if (!syncing) return
    const done = () => setSyncing(false)
    window.addEventListener('native-health-sync-complete', done)
    const t = setTimeout(done, 20_000) // never spin forever if native doesn't answer
    return () => { window.removeEventListener('native-health-sync-complete', done); clearTimeout(t) }
  }, [syncing])

  function handleSync() {
    if (!inNativeApp) { navigate('/import/apple-health'); return }
    if (!connected) { openNativeHealthSheet(); return } // first time: shows the permission prompt
    setSyncing(true)
    triggerSilentHealthSync()
  }

  const statusLabel = loading ? '' : connected ? 'Connected' : 'Not Connected'
  const sub = !connected
    ? (inNativeApp ? 'Allow access once and Jeevan keeps your data up to date.' : 'Open Jeevan on your iPhone to connect, or import an export.')
    : lastSyncedAt ? `Last synced ${timeAgo(lastSyncedAt)}` : 'Up to date'
  const cta = syncing ? 'Syncing…'
    : !inNativeApp ? 'Import Apple Health Export'
    : connected ? 'Sync Now' : 'Connect Apple Health'

  return (
    <div className="jset-page">
      <header className="jset-title-block">
        <button type="button" className="jset-back" data-no-press-glow onClick={() => navigate('/settings')}>
          <ChevronLeft size={16} /> Settings
        </button>
        <h1 className="page-title">Apple Health</h1>
        <p className="jset-subtitle">Your watch, scale, ring and other apps all sync through Apple Health.</p>
      </header>

      <div className="jset-card jah-hero">
        <div className="jah-hero-top">
          <span className="jah-heart" aria-hidden="true"><Heart size={26} fill="#fff" strokeWidth={0} /></span>
          <div className="jah-hero-text">
            <span className="jah-hero-title">Apple Health</span>
            {statusLabel && (
              <span className={`jset-chip ${connected ? 'jset-chip--ok' : 'jset-chip--muted'}`}>
                <span className="jset-chip-dot" />{statusLabel}
              </span>
            )}
          </div>
        </div>
        <p className="jset-row-desc jah-sub">{sub}</p>
        <button type="button" className="jset-cta jah-cta" onClick={handleSync} disabled={syncing}>
          {inNativeApp ? <RefreshCw size={16} className={syncing ? 'spin' : undefined} /> : <FileUp size={16} />}
          {cta}
        </button>
      </div>

      <JSection title="What Syncs">
        {SYNCED.map(s => <JRow key={s.label} icon={s.icon} label={s.label} desc={s.desc} />)}
      </JSection>

      {inNativeApp && connected && (
        <JSection title="Permissions">
          <JRow icon={Settings2} label="Health Access" desc="Review what Jeevan can read from Apple Health" onClick={openNativeHealthSheet} />
        </JSection>
      )}

      <p className="jah-footnote">
        Using an Apple Watch, smart scale or ring? Turn on its Apple Health sharing in that device's app — Jeevan picks it up automatically on the next sync.
      </p>
    </div>
  )
}
