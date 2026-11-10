import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  Shield, ChevronRight,
  Smartphone, LayoutDashboard, Ruler, RefreshCw,
  User, Database,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useUnits } from '../hooks/useUnits'
import './Settings.css'

// ─── Section wrapper ──────────────────────────────────────────────────────────

export function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="settings-section">
      <h2 className="settings-section-title">{title}</h2>
      <div className="settings-section-body">{children}</div>
    </div>
  )
}

// ─── Row types ────────────────────────────────────────────────────────────────

export function SettingsRow({
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
  const { appVersion } = useApp()
  const { system, setSystem } = useUnits()
  const navigate = useNavigate()
  const [showSetupConfirm, setShowSetupConfirm] = useState(false)

  return (
    <div className="settings-page">
      <header className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Shakthi · v{appVersion}</p>
      </header>

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
          onClick={() => setShowSetupConfirm(true)}
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

      {/* ── Data & Sync ── */}
      <SettingsSection title="Data & Sync">
        <SettingsRow
          icon={Database}
          label="Data & Sync"
          description="Cloud account, backups, connected sources, storage"
          onClick={() => navigate('/settings/data')}
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
        <SettingsRow label="App name" value="Shakthi" />
        <SettingsRow label="Version"  value={`v${appVersion}`} />
      </SettingsSection>

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
