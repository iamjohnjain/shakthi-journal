import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Link2, History, Download as DownloadIcon, Upload,
  FlaskConical, Database, Shield, ShieldCheck, ChevronRight, Trash2,
  Smartphone, LayoutDashboard, Ruler, RefreshCw,
  Cloud, LogOut, User, Heart,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { SyncStatusRow } from '../components/SyncStatus'
import { clearSyncHistory, setSetting } from '../db'
import { clearImportedMetrics } from '../db/healthStore'
import { useUnits } from '../hooks/useUnits'
import { isInsideNativeApp } from '../layout/BottomNav'
import './Settings.css'

// ─── Section wrapper ──────────────────────────────────────────────────────────

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="settings-section">
      <h2 className="settings-section-title">{title}</h2>
      <div className="settings-section-body">{children}</div>
    </div>
  )
}

// ─── Row types ────────────────────────────────────────────────────────────────

function SettingsRow({
  icon: Icon, label, description, value, onClick, destructive,
}: {
  icon?: React.ElementType
  label: string
  description?: string
  value?: string
  onClick?: () => void
  destructive?: boolean
}) {
  return (
    <button
      className={`settings-row ${destructive ? 'settings-row--destructive' : ''} ${onClick ? 'settings-row--clickable' : ''}`}
      onClick={onClick}
      disabled={!onClick}
    >
      {Icon && (
        <span className="settings-row-icon">
          <Icon size={15} />
        </span>
      )}
      {description ? (
        <span className="settings-row-text">
          <span className="settings-row-label">{label}</span>
          <span className="settings-row-description">{description}</span>
        </span>
      ) : (
        <span className="settings-row-label">{label}</span>
      )}
      {value && <span className="settings-row-value">{value}</span>}
      {onClick && <ChevronRight size={14} className="settings-row-chevron" />}
    </button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Settings() {
  const { dbStatus, appVersion } = useApp()
  const { mode: authMode, user, signOut, isSupabaseConfigured: sbConfigured } = useAuth()
  const { system, setSystem } = useUnits()
  const navigate = useNavigate()
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [exportNote, setExportNote] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  const [resetOnboardingConfirm, setResetOnboardingConfirm] = useState(false)

  async function handleResetOnboarding() {
    if (!resetOnboardingConfirm) { setResetOnboardingConfirm(true); return }
    await setSetting('onboarding.completed', false)
    setResetOnboardingConfirm(false)
    setExportNote('Onboarding reset. Reopen the app to run setup again.')
    setTimeout(() => setExportNote(''), 4000)
  }

  function openHealthSync() {
    const w = window as unknown as Record<string, unknown>
    const handlers = w.webkit as { messageHandlers?: { shakthiNative?: { postMessage: (m: unknown) => void } } } | undefined
    handlers?.messageHandlers?.shakthiNative?.postMessage({ type: 'openHealthSync' })
  }

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
    setSigningOut(false)
  }

  async function handleDeleteImported() {
    if (!deleteConfirm) { setDeleteConfirm(true); return }
    setDeleting(true)
    try {
      const [deleted] = await Promise.all([clearImportedMetrics(), clearSyncHistory()])
      setExportNote(`Deleted ${deleted} imported health records.`)
      window.dispatchEvent(new CustomEvent('health-data-cleared'))
      setTimeout(() => setExportNote(''), 4000)
    } catch {
      setExportNote('Error deleting records. Please try again.')
      setTimeout(() => setExportNote(''), 4000)
    } finally {
      setDeleting(false)
      setDeleteConfirm(false)
    }
  }

  return (
    <div className="settings-page">
      <header className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Shakthi Journal · v{appVersion}</p>
      </header>

      {exportNote && (
        <div className="settings-notice">{exportNote}</div>
      )}

      {/* ── Units ── */}
      <SettingsSection title="Units">
        <div className="settings-units-row">
          <span className="settings-row-icon"><Ruler size={15} /></span>
          <div className="settings-row-text">
            <span className="settings-row-label">Unit System</span>
            <span className="settings-row-description">
              US/Hybrid: lbs, miles, ft-in, grams · Metric: kg, km, cm, grams
            </span>
          </div>
          <div className="settings-unit-toggle">
            <button
              className={`su-btn ${system === 'us-hybrid' ? 'su-btn--on' : ''}`}
              onClick={() => setSystem('us-hybrid')}>US</button>
            <button
              className={`su-btn ${system === 'metric' ? 'su-btn--on' : ''}`}
              onClick={() => setSystem('metric')}>Metric</button>
          </div>
        </div>
        <div className="settings-units-detail">
          {system === 'us-hybrid'
            ? 'Weights in lbs · Distance in miles · Height in ft/in · Food in grams'
            : 'Weights in kg · Distance in km · Height in cm · Food in grams'}
        </div>
      </SettingsSection>

      {/* ── Profile ── */}
      <SettingsSection title="Profile">
        <SettingsRow
          icon={User}
          label="Edit Profile"
          description="Update name, avatar, height, weight, and goals"
          onClick={() => navigate('/profile')}
        />
        <SettingsRow
          icon={RefreshCw}
          label="Run Setup Again"
          description="Re-run the full setup wizard to update your profile and targets"
          onClick={() => navigate('/onboarding?edit=1')}
        />
        <SettingsRow
          icon={RefreshCw}
          label={resetOnboardingConfirm ? 'Tap again to confirm' : 'Reset Onboarding Only'}
          description="Marks setup as incomplete so it shows on next launch. Does not delete any data."
          onClick={handleResetOnboarding}
        />
      </SettingsSection>

      {/* ── Customize ── */}
      <SettingsSection title="Customize">
        <SettingsRow
          icon={LayoutDashboard}
          label="Dashboard Layout"
          description="Show or hide cards on the main screen"
          value="Cards on/off"
          onClick={() => navigate('/dashboard-settings')}
        />
      </SettingsSection>

      {/* ── Cloud Account ── */}
      <SettingsSection title="Cloud Account">
        {!sbConfigured ? (
          <div className="settings-cloud-notice">
            Cloud sync is not configured — add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to enable.
          </div>
        ) : authMode === 'authenticated' && user ? (
          <>
            <SettingsRow
              icon={User}
              label="Signed in as"
              value={user.email ?? user.displayName ?? 'Account'}
            />
            <SyncStatusRow />
            <SettingsRow
              icon={LogOut}
              label={signingOut ? 'Signing out…' : 'Sign out'}
              onClick={handleSignOut}
              destructive
            />
          </>
        ) : (
          <>
            <div className="settings-cloud-notice">
              Sign in to sync your data across devices automatically.
            </div>
            <SettingsRow
              icon={Cloud}
              label="Sign in / Create account"
              onClick={() => navigate('/auth')}
            />
          </>
        )}
      </SettingsSection>

      {/* ── Data Safety ── */}
      <SettingsSection title="Data Safety">
        <div className="settings-safety-notice">
          <ShieldCheck size={14} />
          <span>All data is stored locally in this browser. Export backups before switching browsers, devices, or domains.</span>
        </div>
        <SettingsRow
          icon={DownloadIcon}
          label="Export Backup"
          description="Download all your data as a JSON file"
          value="All data → JSON"
          onClick={() => navigate('/settings/backup')}
        />
        <SettingsRow
          icon={Upload}
          label="Restore from Backup"
          description="Import a previously exported JSON backup"
          value="Import .json"
          onClick={() => navigate('/settings/backup')}
        />
      </SettingsSection>

      {/* ── Data Storage ── */}
      <SettingsSection title="Data Storage">
        <SettingsRow
          icon={Database}
          label="Storage mode"
          value={dbStatus === 'ready' ? 'IndexedDB · Local' : dbStatus === 'loading' ? 'Loading…' : 'Error'}
        />
        <SettingsRow
          icon={Trash2}
          label={deleteConfirm ? 'Tap again to confirm' : 'Delete Imported Health Data'}
          description="Removes imported Apple Health metrics and sync history. Does not delete workouts, meals, profile, or account data."
          onClick={handleDeleteImported}
          destructive
        />
        {deleting && <p className="settings-inline-note">Deleting…</p>}
      </SettingsSection>

      {/* ── Integrations ── */}
      <SettingsSection title="Integrations">
        {isInsideNativeApp() && (
          <SettingsRow
            icon={Heart}
            label="Apple Health Sync"
            description="Sync steps, weight, sleep, heart rate, and more from Apple Health"
            onClick={openHealthSync}
          />
        )}
        <SettingsRow
          icon={Link2}
          label="Connected Accounts"
          description="Manage Apple Health, RENPHO, MyFitnessPal, and more"
          onClick={() => navigate('/connected-accounts')}
        />
        <SettingsRow
          icon={History}
          label="Sync History"
          description="View past imports and sync events"
          onClick={() => navigate('/sync-history')}
        />
        <SettingsRow
          icon={DownloadIcon}
          label="Import Data"
          description="Import Apple Health export.xml or other formats"
          onClick={() => navigate('/import')}
        />
      </SettingsSection>

      {/* ── Developer ── */}
      <SettingsSection title="Developer">
        <SettingsRow
          icon={FlaskConical}
          label="Developer Diagnostics"
          description="DB status, mock mode, sync queue inspection"
          onClick={() => navigate('/dev')}
        />
        <SettingsRow
          label="App version"
          value={`v${appVersion}`}
        />
      </SettingsSection>

      {/* ── Install as App ── */}
      <SettingsSection title="Install as App">
        <SettingsRow
          icon={Smartphone}
          label="Add to iPhone Home Screen"
        />
        <div className="settings-install-guide">
          <p className="settings-install-title">To install on iOS Safari:</p>
          <ol className="settings-install-steps">
            <li>Open this page in <strong>Safari</strong> on your iPhone.</li>
            <li>Tap the <strong>Share button</strong> (box with arrow) at the bottom.</li>
            <li>Scroll down and tap <strong>"Add to Home Screen"</strong>.</li>
            <li>Tap <strong>Add</strong> — the app will appear on your home screen.</li>
          </ol>
          <p className="settings-install-note">
            Once installed it runs fullscreen, no browser chrome.
            For best icon quality, PNG icons at 192×192 and 512×512 should be placed in <code>public/</code> as <code>icon-192.png</code> and <code>icon-512.png</code>.
          </p>
        </div>
      </SettingsSection>

      {/* ── Privacy ── */}
      <SettingsSection title="Privacy">
        <SettingsRow
          icon={Shield}
          label="Where is my data stored?"
        />
        <div className="settings-privacy-note">
          All health data is stored locally in your browser's IndexedDB database. Nothing is sent to third-party services.
          Cloud sync (if enabled) sends data only to your own Supabase account.
          Clearing your browser data or using private mode will erase local data.
        </div>
      </SettingsSection>

      {/* ── About ── */}
      <SettingsSection title="About">
        <SettingsRow label="App name" value="Shakthi Journal" />
        <SettingsRow label="Version"  value={`v${appVersion}`} />
      </SettingsSection>
    </div>
  )
}
