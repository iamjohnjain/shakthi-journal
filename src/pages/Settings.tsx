import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  Shield, ChevronRight, Smartphone, LayoutDashboard, Ruler, RefreshCw, Moon, Cloud, Heart,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useUnits } from '../hooks/useUnits'
import { useTheme } from '../context/ThemeContext'
import { useNutritionSettings } from '../hooks/useNutritionSettings'
import { useSync } from '../hooks/useSync'
import { getProfile } from '../db/profileStore'
import { AvatarDisplay } from '../components/Avatar'
import type { ProfileData } from '../db'
import type { SyncStatus } from '../db/syncEngine'
import { useAppleHealthStatus, timeAgo } from '../hooks/useAppleHealthStatus'
import './Settings.css'

// ─── Page ─────────────────────────────────────────────────────────────────────

const isNativeApp = typeof window !== 'undefined'
  && !!(window as unknown as { __jeevanNativeApp?: boolean }).__jeevanNativeApp

function Segmented<T extends string>({ options, value, onChange, label }: {
  options: { id: T; label: string }[]
  value: T
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className="jset-seg" role="radiogroup" aria-label={label}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(o => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          data-no-press-glow
          className={`jset-seg-btn ${value === o.id ? 'jset-seg-btn--on' : ''}`}
          onClick={() => onChange(o.id)}
        >{o.label}</button>
      ))}
    </div>
  )
}

export function Tile({ icon: Icon, destructive }: { icon: React.ElementType; destructive?: boolean }) {
  return (
    <span className={`jset-tile ${destructive ? 'jset-tile--danger' : ''}`} aria-hidden="true">
      <Icon size={17} strokeWidth={2} />
    </span>
  )
}

/** A titled group of rows on one dark card (shared with Data & Sync). */
export function JSection({ title, children, className = '' }: {
  title: string; children: React.ReactNode; className?: string
}) {
  return (
    <section className="jset-section">
      <h2 className="jset-section-title">{title}</h2>
      <div className={`jset-card jset-card--rows ${className}`}>{children}</div>
    </section>
  )
}

/** One settings row: gradient icon tile, label, optional description and
    trailing content. A button when it does something, a plain row if not. */
export function JRow({ icon, label, desc, trailing, onClick, destructive, chevron = true }: {
  icon: React.ElementType
  label: string
  desc?: string
  trailing?: React.ReactNode
  onClick?: () => void
  destructive?: boolean
  chevron?: boolean
}) {
  const body = (
    <>
      <Tile icon={icon} destructive={destructive} />
      <span className="jset-row-text">
        <span className={`jset-row-label ${destructive ? 'jset-row-label--danger' : ''}`}>{label}</span>
        {desc && <span className="jset-row-desc">{desc}</span>}
      </span>
      {trailing}
      {onClick && chevron && <ChevronRight size={18} className="jset-chev" />}
    </>
  )
  return onClick
    ? <button type="button" className="jset-row" onClick={onClick}>{body}</button>
    : <div className="jset-row jset-row--static">{body}</div>
}

function syncChip(status: SyncStatus): { label: string; tone: 'ok' | 'busy' | 'warn' | 'muted' } {
  switch (status.type) {
    case 'synced':          return { label: 'Synced', tone: 'ok' }
    case 'syncing':         return { label: 'Syncing', tone: 'busy' }
    case 'error':
    case 'needs_attention': return { label: 'Needs attention', tone: 'warn' }
    case 'offline':         return { label: 'Offline', tone: 'muted' }
    case 'local_only':
    case 'unauthenticated': return { label: 'On device', tone: 'muted' }
    default:                return { label: 'Not synced', tone: 'muted' }
  }
}

export default function Settings() {
  const ah = useAppleHealthStatus()
  const { appVersion } = useApp()
  const { system, setSystem } = useUnits()
  const { theme, isExplicit, setTheme, clearTheme } = useTheme()
  const { goals } = useNutritionSettings()
  const { status } = useSync()
  const navigate = useNavigate()
  const [showSetupConfirm, setShowSetupConfirm] = useState(false)
  const [installOpen, setInstallOpen] = useState(false)
  const [profile, setProfile] = useState<ProfileData | null>(null)

  useEffect(() => {
    getProfile().then(setProfile)
    function onUpdate(e: Event) { setProfile((e as CustomEvent<ProfileData>).detail) }
    window.addEventListener('profile-updated', onUpdate)
    return () => window.removeEventListener('profile-updated', onUpdate)
  }, [])

  const isMetric = system === 'metric'
  const statsLine = (() => {
    if (!profile) return 'Set up your profile'
    const parts: string[] = []
    if (profile.heightCm) {
      if (isMetric) parts.push(`${Math.round(profile.heightCm)} cm`)
      else {
        const totalIn = Math.round(profile.heightCm / 2.54)
        parts.push(`${Math.floor(totalIn / 12)}′${totalIn % 12}″`)
      }
    }
    const w = (kg?: number) => kg == null ? null
      : isMetric ? `${Math.round(kg)} kg` : `${Math.round(kg * 2.20462)} lbs`
    const start = w(profile.startWeightKg)
    const goal = w(profile.goalWeightKg)
    if (start) parts.push(start)
    if (goal) parts.push(`Goal ${goal}`)
    return parts.length ? parts.join(' · ') : 'Add your height and weight'
  })()

  const macroCals = goals.proteinG * 4 + goals.carbsG * 4 + goals.fatG * 9 || 1
  const split = {
    protein: (goals.proteinG * 4) / macroCals,
    carbs: (goals.carbsG * 4) / macroCals,
    fat: (goals.fatG * 9) / macroCals,
  }
  const chip = syncChip(status)
  const themeChoice: 'auto' | 'light' | 'dark' = isExplicit ? theme : 'auto'

  return (
    <div className="settings-page jset-page">
      <header className="page-header">
        <h1 className="page-title">Settings</h1>
      </header>

      {/* ── Profile ── */}
      <button type="button" className="jset-profile" onClick={() => navigate('/profile')}>
        <span className="jset-profile-avatar">
          <AvatarDisplay
            name={profile?.name || 'Guest'}
            avatarId={profile?.avatarId}
            photoDataUrl={profile?.photoDataUrl}
            size="md"
          />
        </span>
        <span className="jset-profile-text">
          <span className="jset-profile-name">{profile?.name || 'Your Profile'}</span>
          <span className="jset-profile-stats">{statsLine}</span>
        </span>
        <span className="jset-profile-edit">Edit</span>
      </button>

      {/* ── Daily targets ── */}
      <section className="jset-section">
        <h2 className="jset-section-title">Daily Targets</h2>
        <div className="jset-card jset-targets">
          <div className="jset-targets-grid">
            <div className="jset-target"><span className="jset-target-num">{goals.calories.toLocaleString()}</span><span className="jset-target-lbl">Calories</span></div>
            <div className="jset-target"><span className="jset-target-num">{goals.proteinG}g</span><span className="jset-target-lbl">Protein</span></div>
            <div className="jset-target"><span className="jset-target-num">{goals.carbsG}g</span><span className="jset-target-lbl">Carbs</span></div>
            <div className="jset-target"><span className="jset-target-num">{goals.fatG}g</span><span className="jset-target-lbl">Fat</span></div>
          </div>
          <div className="jset-split" aria-hidden="true">
            <span style={{ flexGrow: split.protein, background: '#FB8A4C' }} />
            <span style={{ flexGrow: split.carbs, background: '#A66BF5' }} />
            <span style={{ flexGrow: split.fat, background: '#5B7FFF' }} />
          </div>
          <button type="button" className="jset-cta" onClick={() => navigate('/nutrition?goals=1')}>
            Adjust Targets
          </button>
        </div>
      </section>

      {/* ── Preferences ── */}
      <section className="jset-section">
        <h2 className="jset-section-title">Preferences</h2>
        <div className="jset-card">
          <div className="jset-pref">
            <div className="jset-pref-head"><Tile icon={Ruler} /><span className="jset-row-label">Units</span></div>
            <Segmented
              label="Units"
              value={system}
              onChange={setSystem}
              options={[{ id: 'us-hybrid', label: 'US' }, { id: 'metric', label: 'Metric' }]}
            />
            <span className="jset-row-desc">
              {isMetric ? 'kg · km · cm · food in grams' : 'lbs · miles · ft/in · food in grams'}
            </span>
          </div>
          <div className="jset-divider" />
          <div className="jset-pref">
            <div className="jset-pref-head"><Tile icon={Moon} /><span className="jset-row-label">Appearance</span></div>
            <Segmented
              label="Appearance"
              value={themeChoice}
              onChange={v => (v === 'auto' ? clearTheme() : setTheme(v))}
              options={[{ id: 'auto', label: 'Auto' }, { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }]}
            />
          </div>
        </div>
      </section>

      {/* ── App ── */}
      <section className="jset-section">
        <h2 className="jset-section-title">App</h2>
        <div className="jset-card">
          <button type="button" className="jset-row" onClick={() => navigate('/dashboard-settings')}>
            <Tile icon={LayoutDashboard} />
            <span className="jset-row-text">
              <span className="jset-row-label">Dashboard Layout</span>
              <span className="jset-row-desc">Choose and reorder Today's cards</span>
            </span>
            <ChevronRight size={18} className="jset-chev" />
          </button>
          <div className="jset-divider" />
          <button type="button" className="jset-row" onClick={() => navigate('/connected-accounts')}>
            <Tile icon={Heart} />
            <span className="jset-row-text">
              <span className="jset-row-label">Apple Health</span>
              <span className="jset-row-desc">{ah.connected && ah.lastSyncedAt ? `Synced ${timeAgo(ah.lastSyncedAt)}` : 'Watch, scale and app data'}</span>
            </span>
            {!ah.loading && (
              <span className={`jset-chip ${ah.connected ? 'jset-chip--ok' : 'jset-chip--muted'}`}>
                <span className="jset-chip-dot" />{ah.connected ? 'Connected' : 'Not Connected'}
              </span>
            )}
            <ChevronRight size={18} className="jset-chev" />
          </button>
          <div className="jset-divider" />
          <button type="button" className="jset-row" onClick={() => navigate('/settings/data')}>
            <Tile icon={Cloud} />
            <span className="jset-row-text">
              <span className="jset-row-label">Data &amp; Sync</span>
              <span className="jset-row-desc">Account, backups, storage</span>
            </span>
            <span className={`jset-chip jset-chip--${chip.tone}`}><span className="jset-chip-dot" />{chip.label}</span>
            <ChevronRight size={18} className="jset-chev" />
          </button>
          <div className="jset-divider" />
          <button type="button" className="jset-row" onClick={() => setShowSetupConfirm(true)}>
            <Tile icon={RefreshCw} />
            <span className="jset-row-text">
              <span className="jset-row-label">Run Setup Again</span>
              <span className="jset-row-desc">Update your profile and targets</span>
            </span>
            <ChevronRight size={18} className="jset-chev" />
          </button>
          {!isNativeApp && (
            <>
              <div className="jset-divider" />
              <button type="button" className="jset-row" aria-expanded={installOpen} onClick={() => setInstallOpen(o => !o)}>
                <Tile icon={Smartphone} />
                <span className="jset-row-text">
                  <span className="jset-row-label">Add to Home Screen</span>
                  <span className="jset-row-desc">Run Jeevan full screen from Safari</span>
                </span>
                <span className="jset-row-link">{installOpen ? 'Hide' : 'How'}</span>
              </button>
              {installOpen && (
                <ol className="jset-steps">
                  <li><span>1</span>Open Jeevan in Safari</li>
                  <li><span>2</span>Tap Share, then Add to Home Screen</li>
                  <li><span>3</span>Tap Add — it opens full screen</li>
                </ol>
              )}
            </>
          )}
        </div>
      </section>

      {/* ── Privacy ── */}
      <section className="jset-section">
        <h2 className="jset-section-title">Privacy</h2>
        <div className="jset-card jset-privacy">
          <Tile icon={Shield} />
          <span className="jset-row-text">
            <span className="jset-row-label">Your data stays yours</span>
            <span className="jset-row-desc">Stored on this device and synced only to your own account. Never shared with third parties.</span>
          </span>
        </div>
      </section>

      {/* ── About ── */}
      <footer className="jset-about">
        <span className="jset-about-name">Jeevan</span>
        <span>Version {appVersion}</span>
        <span>3D muscle model: Z-Anatomy / BodyParts3D — CC BY-SA 4.0</span>
      </footer>

      {/* ── Run Setup Again confirmation ── */}
      {showSetupConfirm && createPortal(
        <div className="settings-overlay" onClick={() => setShowSetupConfirm(false)}>
          <div className="settings-confirm-modal" onClick={e => e.stopPropagation()}>
            <h2 className="settings-confirm-title">Run setup again?</h2>
            <p className="settings-confirm-body">
              This lets you update your profile, goals, nutrition targets, and connected sources.
              Your workouts, meals, health data, and account will not be deleted.
            </p>
            <div className="settings-confirm-actions">
              <button className="settings-confirm-cancel" onClick={() => setShowSetupConfirm(false)}>
                Cancel
              </button>
              <button
                className="settings-confirm-go"
                data-no-press-glow
                onClick={() => { setShowSetupConfirm(false); navigate('/onboarding?edit=1') }}
              >
                Continue Setup
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
