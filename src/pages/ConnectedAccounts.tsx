import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  CheckCircle, AlertCircle, Clock, XCircle, RefreshCw,
  ChevronRight, Info, Unlink,
} from 'lucide-react'
import DataBadge from '../components/DataBadge'
import { getSyncHistory } from '../db'
import './ConnectedAccounts.css'

// ─── Types ────────────────────────────────────────────────────────────────────

type AccountStatus =
  | 'import_ready'
  | 'connected'
  | 'needs_setup'
  | 'no_api'
  | 'coming_soon'

interface Account {
  id: string
  name: string
  shortName: string
  icon: string
  status: AccountStatus
  method: string
  dataTypes: string[]
  description: string
  lastSync?: string
  recordCount?: number
  accountName?: string
  permissions?: string[]
  setupInstructions?: string[]
  importNote?: string
  availability: 'now' | 'phase2' | 'phase6' | 'coming_soon'
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: AccountStatus }) {
  const cfg: Record<AccountStatus, { label: string; color: string }> = {
    import_ready: { label: 'Import Ready', color: 'var(--blue)' },
    connected:    { label: 'Connected',    color: 'var(--green)' },
    needs_setup:  { label: 'Needs Setup',  color: 'var(--orange)' },
    no_api:       { label: 'No API',       color: 'var(--text-tertiary)' },
    coming_soon:  { label: 'Coming Soon',  color: 'var(--purple)' },
  }
  const { label, color } = cfg[status]
  return (
    <span className="account-status-badge" style={{ color, borderColor: color + '44', background: color + '14' }}>
      {label}
    </span>
  )
}

// ─── Account card ─────────────────────────────────────────────────────────────

function AccountCard({
  account,
  lastSync,
  onSync,
  onDisconnect,
}: {
  account: Account
  lastSync?: { at: string; count: number }
  onSync: (id: string) => void
  onDisconnect: (id: string) => void
}) {
  const [showSetup, setShowSetup] = useState(false)
  const navigate = useNavigate()

  const StatusIcon =
    account.status === 'connected' ? CheckCircle :
    account.status === 'import_ready' ? Clock :
    account.status === 'needs_setup' ? AlertCircle :
    XCircle

  const iconColor =
    account.status === 'connected' ? 'var(--green)' :
    account.status === 'import_ready' ? 'var(--blue)' :
    account.status === 'needs_setup' ? 'var(--orange)' :
    'var(--text-tertiary)'

  return (
    <div className={`account-card ${account.status === 'coming_soon' ? 'account-card--dim' : ''}`}>
      <div className="account-card-header">
        <div className="account-card-left">
          <div className="account-icon-wrap">
            <span className="account-icon">{account.icon}</span>
            <StatusIcon size={14} className="account-status-icon" style={{ color: iconColor }} />
          </div>
          <div className="account-card-info">
            <div className="account-card-title-row">
              <span className="account-name">{account.name}</span>
              <StatusBadge status={account.status} />
            </div>
            {account.accountName && (
              <span className="account-connected-as">Connected as: {account.accountName}</span>
            )}
            <span className="account-method">{account.method}</span>
          </div>
        </div>

        {(account.status === 'connected' || account.status === 'import_ready') && (
          <DataBadge mode={account.status === 'connected' ? 'live' : 'imported'} />
        )}
      </div>

      <p className="account-description">{account.description}</p>

      {/* Data types / permissions */}
      <div className="account-chips-row">
        {account.dataTypes.map(t => (
          <span key={t} className="account-chip">{t}</span>
        ))}
      </div>

      {/* Last sync row — from real IDB sync history */}
      {lastSync && (
        <div className="account-sync-row">
          <RefreshCw size={11} />
          <span>Last synced: {timeAgo(lastSync.at)}</span>
          <span className="account-record-count">{lastSync.count.toLocaleString()} records</span>
          <button className="account-link-btn" onClick={() => navigate('/sync-history')}>
            View history <ChevronRight size={11} />
          </button>
        </div>
      )}

      {/* Setup instructions (expandable) */}
      {account.setupInstructions && (
        <div className="account-setup-wrap">
          <button className="account-setup-toggle" onClick={() => setShowSetup(v => !v)}>
            <Info size={12} />
            {showSetup ? 'Hide setup steps' : 'How to set up'}
          </button>
          {showSetup && (
            <ol className="account-setup-steps">
              {account.setupInstructions.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* Import note */}
      {account.importNote && (
        <p className="account-import-note">
          <Info size={11} /> {account.importNote}
        </p>
      )}

      {/* Actions */}
      <div className="account-actions">
        {account.status === 'connected' && (
          <>
            <button className="btn btn-secondary btn-sm" onClick={() => onSync(account.id)}>
              <RefreshCw size={13} /> Sync Now
            </button>
            <button className="btn btn-danger btn-sm" onClick={() => onDisconnect(account.id)}>
              <Unlink size={13} /> Disconnect
            </button>
          </>
        )}
        {account.status === 'import_ready' && (
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/import/apple-health')}>
            Import File
          </button>
        )}
        {account.status === 'needs_setup' && account.setupInstructions && (
          <button className="btn btn-secondary btn-sm" onClick={() => setShowSetup(true)}>
            <Info size={13} /> View Setup
          </button>
        )}
        {/* Strava OAuth disabled for beta — requires server-side token exchange */}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60_000)
  const hours = Math.floor(ms / 3_600_000)
  const days = Math.floor(ms / 86_400_000)
  if (mins < 2) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

export default function ConnectedAccounts() {
  const navigate = useNavigate()
  const { user, mode: authMode } = useAuth()

  const googleConnected = authMode === 'authenticated' && user?.provider === 'google'
  const appleConnected  = authMode === 'authenticated' && user?.provider === 'apple'

  const [lastSyncs, setLastSyncs] = useState<Map<string, { at: string; count: number }>>(new Map())

  useEffect(() => {
    getSyncHistory(200).then(entries => {
      const map = new Map<string, { at: string; count: number }>()
      for (const e of entries) {
        if (e.status === 'success' && e.completedAt) {
          const existing = map.get(e.sourceId)
          if (!existing || e.completedAt > existing.at) {
            map.set(e.sourceId, { at: e.completedAt, count: e.recordCount })
          }
        }
      }
      setLastSyncs(map)
    })
  }, [])

  const [accounts] = useState<Account[]>([
    {
      id: 'apple_health',
      name: 'Apple Health',
      shortName: 'Apple Health',
      icon: '🍎',
      status: 'import_ready',
      method: 'XML export · manual import',
      dataTypes: ['Steps', 'Heart Rate', 'HRV', 'Sleep', 'Calories', 'Workouts'],
      description: 'Acts as the central hub. Apple Watch, RingConn, and RENPHO all sync into Apple Health, so importing a single Apple Health export gives you everything.',
      availability: 'now',
      setupInstructions: [
        'Open Health app on iPhone',
        'Tap your profile photo → Export All Health Data',
        'Share the export.zip to your Mac',
        'Unzip and import the export.xml file here',
      ],
    },
    {
      id: 'apple_watch',
      name: 'Apple Watch',
      shortName: 'Watch',
      icon: '⌚',
      status: 'needs_setup',
      method: 'Via Apple Health hub',
      dataTypes: ['Heart Rate', 'HRV', 'Activity', 'Workouts', 'ECG'],
      description: 'Apple Watch syncs all data to Apple Health automatically. No separate import needed — import Apple Health and Watch data is included.',
      availability: 'now',
      setupInstructions: [
        'Ensure Apple Watch is paired with your iPhone',
        'Open Watch app → Health → turn on all data sharing',
        'Then export Apple Health to get Watch data',
      ],
    },
    {
      id: 'ringconn',
      name: 'RingConn',
      shortName: 'RingConn',
      icon: '💍',
      status: 'needs_setup',
      method: 'Via Apple Health · or direct CSV',
      dataTypes: ['Sleep', 'HRV', 'SpO2', 'Stress', 'Activity'],
      description: 'RingConn can sync to Apple Health. Enable this in the RingConn app and your ring data will be included in the Apple Health export.',
      availability: 'now',
      setupInstructions: [
        'Open RingConn app on iPhone',
        'Go to Profile → Connected Apps → Apple Health',
        'Enable all data categories',
        'RingConn data will now appear in Apple Health exports',
      ],
    },
    {
      id: 'renpho',
      name: 'RENPHO',
      shortName: 'RENPHO',
      icon: '⚖️',
      status: 'import_ready',
      method: 'CSV export · or via Apple Health',
      dataTypes: ['Weight', 'Body Fat', 'Muscle Mass', 'BMI', 'Water %'],
      description: 'RENPHO syncs to Apple Health if enabled, or you can export a CSV from the RENPHO app. Body composition data only — not available via any public API.',
      availability: 'now',
      importNote: 'No public RENPHO API exists. Apple Health sync or CSV export are the only options.',
      setupInstructions: [
        'Open RENPHO app → More → Apple Health',
        'Enable body composition sharing, OR',
        'Go to RENPHO app → Profile → Export Data → select CSV',
      ],
    },
    {
      id: 'strava',
      name: 'Strava',
      shortName: 'Strava',
      icon: '🏃',
      status: 'coming_soon' as AccountStatus,
      method: 'OAuth 2.0 API · server-side (coming later)',
      dataTypes: ['GPS Routes', 'Pace', 'Power', 'Heart Rate Zones', 'Splits'],
      description: 'Strava has a real public API. GPS route data and splits don\'t flow through Apple Health cleanly, so a direct connection gives the best data.',
      availability: 'coming_soon' as const,
      importNote: 'Strava OAuth requires a secure server-side token exchange to keep your API credentials safe. This will be enabled in a future update once a backend proxy is in place.',
    },
    {
      id: 'myfitnesspal',
      name: 'MyFitnessPal',
      shortName: 'MFP',
      icon: '🥗',
      status: 'import_ready',
      method: 'CSV export · or via Apple Health',
      dataTypes: ['Calories In', 'Protein', 'Carbs', 'Fat', 'Meals'],
      description: 'MyFitnessPal removed their public API in 2019. The best option is enabling MFP → Apple Health sync (for nutrition totals), or exporting a CSV from myfitnesspal.com.',
      availability: 'now',
      importNote: 'No MFP API available. Apple Health sync (in MFP app settings) or CSV export from myfitnesspal.com.',
      setupInstructions: [
        'Open MFP app → More → Apps & Devices → Apple Health',
        'Enable "Nutrition" to sync daily totals to Apple Health, OR',
        'Go to myfitnesspal.com → Settings → Diary Settings → Export',
      ],
    },
    {
      id: 'google',
      availability: 'now' as const,
      name: 'Google',
      shortName: 'Google',
      icon: '🔵',
      status: googleConnected ? 'connected' : 'needs_setup',
      method: 'OAuth 2.0 · via Supabase',
      dataTypes: ['Account identity', 'Cloud sync'],
      description: 'Sign in with Google to enable cloud sync across devices. Requires Google OAuth configured in Supabase dashboard.',
      accountName: googleConnected ? user?.email ?? undefined : undefined,
      setupInstructions: [
        'In Supabase Dashboard → Authentication → Providers → Google',
        'Create a Google OAuth app at console.cloud.google.com',
        'Add Client ID and Secret to Supabase',
        'Then use Settings → Sign in with Google',
      ],
    },
    {
      id: 'apple_id',
      availability: 'now' as const,
      name: 'Apple ID',
      shortName: 'Apple ID',
      icon: '🍏',
      status: appleConnected ? 'connected' : 'needs_setup',
      method: 'OAuth 2.0 · via Supabase',
      dataTypes: ['Account identity', 'Cloud sync'],
      description: 'Sign in with Apple for private cloud sync. Requires Apple Developer account and Supabase Apple provider configuration.',
      accountName: appleConnected ? user?.email ?? undefined : undefined,
      setupInstructions: [
        'Requires Apple Developer Program membership ($99/yr)',
        'In Supabase Dashboard → Authentication → Providers → Apple',
        'Create a Services ID at developer.apple.com',
        'Add Key ID, Team ID, and Private Key to Supabase',
      ],
    },
    {
      id: 'garmin',
      name: 'Garmin Connect',
      shortName: 'Garmin',
      icon: '⌚',
      status: 'coming_soon',
      method: 'Garmin Health API · requires partnership',
      dataTypes: ['GPS', 'Heart Rate', 'VO2 Max', 'Stress', 'Body Battery'],
      description: 'Garmin data (from Garmin watches) can be imported via Apple Health if the Garmin Connect app syncs to Apple Health on iPhone.',
      availability: 'phase6' as const,
      setupInstructions: [
        'Open Garmin Connect app → More → Connected Apps → Apple Health',
        'Enable all data categories',
        'Garmin data will appear in your next Apple Health export',
      ],
    },
    {
      id: 'whoop',
      name: 'WHOOP',
      shortName: 'WHOOP',
      icon: '⚡',
      status: 'coming_soon',
      method: 'WHOOP API · invite-only',
      dataTypes: ['Recovery', 'Strain', 'HRV', 'Sleep', 'Respiratory Rate'],
      description: 'WHOOP data is available via Apple Health sync from the WHOOP app. A direct API integration would require WHOOP developer access.',
      availability: 'phase6' as const,
      setupInstructions: [
        'Open WHOOP app → More → Integrations → Apple Health',
        'Enable data sync',
        'Import via Apple Health export',
      ],
    },
    {
      id: 'oura',
      name: 'Oura Ring',
      shortName: 'Oura',
      icon: '💍',
      status: 'coming_soon',
      method: 'Oura API v2 · available',
      dataTypes: ['Sleep Score', 'Readiness', 'HRV', 'Temperature', 'Activity'],
      description: 'Oura has a public API (oura.com/oauth/authorize). A direct integration would pull readiness, sleep, and HRV scores automatically.',
      availability: 'phase6' as const,
      setupInstructions: [
        'Oura API integration is planned for a future phase',
        'For now: enable Oura → Apple Health sync in the Oura app',
        'Then import via Apple Health export',
      ],
    },
  ])

  const [syncing, setSyncing] = useState<string | null>(null)
  const [disconnectMsg, setDisconnectMsg] = useState('')

  function handleSync(id: string) {
    const account = accounts.find(a => a.id === id)
    if (account?.status === 'import_ready') {
      navigate('/import/apple-health')
      return
    }
    setSyncing(id)
    setTimeout(() => setSyncing(null), 800)
  }

  function handleDisconnect(_id: string) {
    setDisconnectMsg('No live connections to disconnect — data is stored locally only.')
    setTimeout(() => setDisconnectMsg(''), 4000)
  }

  const connectedCount = accounts.filter(a => a.status === 'connected').length
  const importReadyCount = accounts.filter(a => a.status === 'import_ready').length
  const needsSetupCount = accounts.filter(a => a.status === 'needs_setup').length

  const deviceHint = useMemo(() => {
    if (typeof navigator === 'undefined') return null
    const ua = navigator.userAgent
    if (/iPad|iPhone|iPod/.test(ua)) return { emoji: '📱', text: 'You\'re on iPhone — Apple Health is your best first integration.' }
    if (/Android/.test(ua)) return { emoji: '🤖', text: 'You\'re on Android — Google Fit or Strava are your best starting points.' }
    return { emoji: '💻', text: 'On desktop, file imports work great. For live wearable sync, visit from your phone.' }
  }, [])

  return (
    <div className="connected-accounts-page">
      <header className="page-header">
        <h1 className="page-title">Data Sources</h1>
        <p className="page-subtitle">
          What's connected, what needs your action, and what's coming soon.
        </p>
      </header>

      {deviceHint && (
        <div className="accounts-device-hint">
          <span>{deviceHint.emoji}</span>
          <span>{deviceHint.text}</span>
        </div>
      )}

      {disconnectMsg && (
        <div className="settings-notice" style={{ marginBottom: 0 }}>{disconnectMsg}</div>
      )}

      {/* Status summary bar */}
      <div className="accounts-summary">
        <div className="accounts-summary-stat">
          <span className="accounts-summary-num" style={{ color: 'var(--green)' }}>{connectedCount}</span>
          <span className="accounts-summary-label">Connected</span>
        </div>
        <div className="accounts-summary-divider" />
        <div className="accounts-summary-stat">
          <span className="accounts-summary-num" style={{ color: 'var(--blue)' }}>{importReadyCount}</span>
          <span className="accounts-summary-label">Import Ready</span>
        </div>
        <div className="accounts-summary-divider" />
        <div className="accounts-summary-stat">
          <span className="accounts-summary-num" style={{ color: 'var(--orange)' }}>{needsSetupCount}</span>
          <span className="accounts-summary-label">Needs Setup</span>
        </div>
      </div>

      {/* Accounts list */}
      <div className="accounts-list">
        {accounts.map(account => (
          <div key={account.id} className="account-wrap">
            {syncing === account.id && (
              <div className="account-syncing-overlay">
                <RefreshCw size={14} className="spin" />
                <span>Syncing {account.shortName}…</span>
              </div>
            )}
            <AccountCard
              account={account}
              lastSync={lastSyncs.get(account.id)}
              onSync={handleSync}
              onDisconnect={handleDisconnect}
            />
          </div>
        ))}
      </div>

      {/* What's real callout */}
      <div className="accounts-honesty-box">
        <h3>What's actually connected right now?</h3>
        <div className="honesty-grid">
          <div className="honesty-item honesty-item--yes">
            <strong>Real today:</strong> Manual file import from Apple Health XML, RENPHO CSV, or MFP CSV. Strava OAuth once you add credentials.
          </div>
          <div className="honesty-item honesty-item--no">
            <strong>Not yet real:</strong> Automatic background sync, live API polling, Apple Watch direct access, RingConn API (doesn't exist), native iOS companion.
          </div>
          <div className="honesty-item honesty-item--future">
            <strong>Phase 6 (future):</strong> Native iOS app with HealthKit for automatic real-time sync. That's when everything becomes truly seamless.
          </div>
        </div>
      </div>
    </div>
  )
}
