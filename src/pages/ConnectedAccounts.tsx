import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  CheckCircle, AlertCircle, Clock, XCircle, RefreshCw,
  ChevronRight, Info, ExternalLink, Unlink,
} from 'lucide-react'
import DataBadge from '../components/DataBadge'
import {
  redirectToStravaAuth,
  stravaCredentialsConfigured,
  stravaConnectedAccount,
  clearStravaToken,
  loadStravaToken,
} from '../services/strava/stravaOAuth'
import './ConnectedAccounts.css'

// ─── Types ────────────────────────────────────────────────────────────────────

type AccountStatus =
  | 'mock_only'
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
    mock_only:    { label: 'Mock Only',    color: 'var(--yellow)' },
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
  onSync,
  onDisconnect,
  onConnect,
}: {
  account: Account
  onSync: (id: string) => void
  onDisconnect: (id: string) => void
  onConnect: (id: string) => void
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

        <DataBadge
          mode={account.status === 'connected' ? 'live' : account.status === 'import_ready' ? 'imported' : 'mock'}
        />
      </div>

      <p className="account-description">{account.description}</p>

      {/* Data types / permissions */}
      <div className="account-chips-row">
        {account.dataTypes.map(t => (
          <span key={t} className="account-chip">{t}</span>
        ))}
      </div>

      {/* Last sync row */}
      {account.lastSync && (
        <div className="account-sync-row">
          <RefreshCw size={11} />
          <span>Last synced: {account.lastSync}</span>
          {account.recordCount != null && (
            <span className="account-record-count">{account.recordCount.toLocaleString()} records</span>
          )}
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
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/import')}>
            Import File
          </button>
        )}
        {account.status === 'needs_setup' && account.setupInstructions && (
          <button className="btn btn-secondary btn-sm" onClick={() => setShowSetup(true)}>
            <Info size={13} /> View Setup
          </button>
        )}
        {account.id === 'strava' && account.status !== 'connected' && (
          <button
            className="btn btn-strava btn-sm"
            onClick={() => onConnect(account.id)}
            disabled={account.status === 'coming_soon'}
          >
            <ExternalLink size={13} /> Connect with Strava
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ConnectedAccounts() {
  const stravaConnected = !!loadStravaToken()
  const stravaAccount = stravaConnectedAccount()
  const credentialsSet = stravaCredentialsConfigured()
  const { user, mode: authMode } = useAuth()

  const googleConnected = authMode === 'authenticated' && user?.provider === 'google'
  const appleConnected  = authMode === 'authenticated' && user?.provider === 'apple'

  const [accounts, setAccounts] = useState<Account[]>([
    {
      id: 'apple_health',
      name: 'Apple Health',
      shortName: 'Apple Health',
      icon: '🍎',
      status: 'import_ready',
      method: 'XML export · manual import',
      dataTypes: ['Steps', 'Heart Rate', 'HRV', 'Sleep', 'Calories', 'Workouts'],
      description: 'Acts as the central hub. Apple Watch, RingConn, and RENPHO all sync into Apple Health, so importing a single Apple Health export gives you everything.',
      lastSync: '2 hours ago',
      recordCount: 842,
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
      lastSync: '26 hours ago',
      recordCount: 4,
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
      status: stravaConnected ? 'connected' : (credentialsSet ? 'needs_setup' : 'mock_only'),
      method: 'OAuth 2.0 API',
      dataTypes: ['GPS Routes', 'Pace', 'Power', 'Heart Rate Zones', 'Splits'],
      description: 'Strava is the only source with a real public API. GPS route data and splits don\'t flow through Apple Health cleanly, so a direct connection gives you full data.',
      lastSync: stravaConnected ? 'Just now' : undefined,
      recordCount: stravaConnected ? 0 : undefined,
      accountName: stravaAccount?.name,
      availability: 'now',
      importNote: credentialsSet
        ? undefined
        : 'Add your Strava API credentials to .env to enable OAuth connection. See .env.example for instructions.',
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
      lastSync: '5 hours ago',
      recordCount: 5,
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
  const [stravaError, setStravaError] = useState<string | null>(null)

  function handleSync(id: string) {
    setSyncing(id)
    setTimeout(() => setSyncing(null), 1800)
  }

  function handleDisconnect(id: string) {
    if (id === 'strava') {
      clearStravaToken()
      setAccounts(prev => prev.map(a =>
        a.id === 'strava'
          ? { ...a, status: credentialsSet ? 'needs_setup' : 'mock_only', accountName: undefined, lastSync: undefined, recordCount: undefined }
          : a
      ))
    }
  }

  function handleConnect(id: string) {
    if (id === 'strava') {
      if (!credentialsSet) {
        setStravaError('Strava credentials not configured. Add VITE_STRAVA_CLIENT_ID and VITE_STRAVA_CLIENT_SECRET to your .env file.')
        return
      }
      try {
        redirectToStravaAuth()
      } catch (e) {
        setStravaError(e instanceof Error ? e.message : 'Unknown error')
      }
    }
  }

  const connectedCount = accounts.filter(a => a.status === 'connected').length
  const importReadyCount = accounts.filter(a => a.status === 'import_ready').length
  const needsSetupCount = accounts.filter(a => a.status === 'needs_setup').length

  return (
    <div className="connected-accounts-page">
      <header className="page-header">
        <h1 className="page-title">Connected Accounts</h1>
        <p className="page-subtitle">
          All health data sources — what's real, what's mocked, and what needs your action.
        </p>
      </header>

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

      {/* Strava error */}
      {stravaError && (
        <div className="accounts-error-banner">
          <AlertCircle size={14} />
          <span>{stravaError}</span>
          <button onClick={() => setStravaError(null)}>✕</button>
        </div>
      )}

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
              onSync={handleSync}
              onDisconnect={handleDisconnect}
              onConnect={handleConnect}
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
