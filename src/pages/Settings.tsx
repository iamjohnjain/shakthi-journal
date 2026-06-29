import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Link2, History, Download as DownloadIcon, Upload,
  FlaskConical, Database, Shield, ShieldCheck, ChevronRight, Trash2,
  ToggleLeft, ToggleRight, Smartphone, LayoutDashboard, Ruler,
  Cloud, LogOut, RefreshCw, User,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { useSync, syncStatusLabel } from '../hooks/useSync'
import { clearSyncHistory } from '../db'
import { clearImportedMetrics } from '../db/healthStore'
import { useUnits } from '../hooks/useUnits'
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
  icon: Icon, label, value, onClick, destructive,
}: {
  icon?: React.ElementType
  label: string
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
      <span className="settings-row-label">{label}</span>
      {value && <span className="settings-row-value">{value}</span>}
      {onClick && <ChevronRight size={14} className="settings-row-chevron" />}
    </button>
  )
}

function SettingsToggleRow({
  icon: Icon, label, description, value, onChange,
}: {
  icon?: React.ElementType
  label: string
  description?: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="settings-row settings-row--toggle">
      {Icon && (
        <span className="settings-row-icon">
          <Icon size={15} />
        </span>
      )}
      <div className="settings-row-text">
        <span className="settings-row-label">{label}</span>
        {description && <span className="settings-row-description">{description}</span>}
      </div>
      <button
        className={`settings-toggle ${value ? 'settings-toggle--on' : ''}`}
        onClick={() => onChange(!value)}
        aria-label={`Toggle ${label}`}
      >
        {value ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
      </button>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Settings() {
  const { mockMode, setMockMode, dbStatus, appVersion } = useApp()
  const { mode: authMode, user, signOut, isSupabaseConfigured: sbConfigured } = useAuth()
  const { status: syncStatus, syncNow } = useSync()
  const { system, setSystem } = useUnits()
  const navigate = useNavigate()
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [exportNote, setExportNote] = useState('')
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
    setSigningOut(false)
  }

  async function handleDeleteImported() {
    if (!deleteConfirm) { setDeleteConfirm(true); return }
    setDeleting(true)
    const [deleted] = await Promise.all([clearImportedMetrics(), clearSyncHistory()])
    setDeleting(false)
    setDeleteConfirm(false)
    setExportNote(`Deleted ${deleted} imported records. Mock data still available.`)
    setTimeout(() => setExportNote(''), 4000)
  }

  async function handleDeleteAll() {
    if (!deleteConfirm) { setDeleteConfirm(true); return }
    setDeleting(true)
    await Promise.all([clearImportedMetrics(), clearSyncHistory()])
    setDeleting(false)
    setDeleteConfirm(false)
    setExportNote('All local data deleted.')
    setTimeout(() => setExportNote(''), 3000)
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

      {/* ── Customize ── */}
      <SettingsSection title="Customize">
        <SettingsRow
          icon={LayoutDashboard}
          label="Dashboard Layout"
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
            <SettingsRow
              icon={Cloud}
              label="Sync status"
              value={syncStatusLabel(syncStatus)}
            />
            <SettingsRow
              icon={RefreshCw}
              label="Sync now"
              onClick={syncNow}
            />
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
          value="All data → JSON"
          onClick={() => navigate('/settings/backup')}
        />
        <SettingsRow
          icon={Upload}
          label="Restore from Backup"
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
          icon={Database}
          label="Estimated size"
          value="< 1 MB"
        />
        <SettingsRow
          icon={Trash2}
          label={deleteConfirm ? 'Tap again to confirm' : 'Delete imported data'}
          onClick={handleDeleteImported}
          destructive
        />
        <SettingsRow
          icon={Trash2}
          label={deleteConfirm ? 'Tap again to confirm' : 'Delete all local data'}
          onClick={handleDeleteAll}
          destructive
        />
        {deleting && <p className="settings-inline-note">Deleting…</p>}
      </SettingsSection>

      {/* ── Integrations ── */}
      <SettingsSection title="Integrations">
        <SettingsRow
          icon={Link2}
          label="Connected Accounts"
          value="6 sources"
          onClick={() => navigate('/connected-accounts')}
        />
        <SettingsRow
          icon={History}
          label="Sync History"
          onClick={() => navigate('/sync-history')}
        />
        <SettingsRow
          icon={DownloadIcon}
          label="Import Data"
          onClick={() => navigate('/import')}
        />
      </SettingsSection>

      {/* ── Developer ── */}
      <SettingsSection title="Developer">
        <SettingsToggleRow
          label="Mock Data Mode"
          description="When ON, dashboard shows simulated data with yellow badges. Turn OFF when you have real imported data."
          value={mockMode}
          onChange={setMockMode}
        />
        <SettingsRow
          icon={FlaskConical}
          label="Developer Diagnostics"
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
          All health data is stored locally in your browser's IndexedDB database. Nothing is sent to any server.
          Strava tokens are stored in localStorage on this device only.
          Clearing your browser data or using private mode will erase everything.
        </div>
      </SettingsSection>

      {/* ── About ── */}
      <SettingsSection title="About">
        <SettingsRow label="App name"    value="Shakthi Journal" />
        <SettingsRow label="Version"     value={`v${appVersion}`} />
        <SettingsRow label="Framework"   value="Vite 6 + React 18" />
        <SettingsRow label="Local URL"   value="localhost:5173" />
        <SettingsRow label="Custom domain" value="Not configured (Phase 5)" />
      </SettingsSection>
    </div>
  )
}
