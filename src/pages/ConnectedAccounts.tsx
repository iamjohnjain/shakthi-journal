import { useState, useMemo, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle, AlertCircle, Clock, XCircle, RefreshCw,
  ChevronRight, Info, Unlink,
} from 'lucide-react'
import DataBadge from '../components/DataBadge'
import { getSyncHistory } from '../db'
import { getImportedSources } from '../db/healthStore'
import { isInsideNativeApp } from '../layout/BottomNav'
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
  nativeAction,
}: {
  account: Account
  lastSync?: { at: string; count: number }
  onSync: (id: string) => void
  onDisconnect: (id: string) => void
  nativeAction?: { label: string; onClick: () => void }
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
        {nativeAction && (
          <button className="btn btn-primary btn-sm" onClick={nativeAction.onClick}>
            <RefreshCw size={13} /> {nativeAction.label}
          </button>
        )}
        {!nativeAction && account.status === 'connected' && (
          <>
            <button className="btn btn-secondary btn-sm" onClick={() => onSync(account.id)}>
              <RefreshCw size={13} /> Sync Now
            </button>
            <button className="btn btn-danger btn-sm" onClick={() => onDisconnect(account.id)}>
              <Unlink size={13} /> Disconnect
            </button>
          </>
        )}
        {!nativeAction && account.status === 'import_ready' && (
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/import/apple-health')}>
            Import File
          </button>
        )}
        {!nativeAction && account.status === 'needs_setup' && account.setupInstructions && (
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

function openNativeHealthSync() {
  const w = window as unknown as Record<string, unknown>
  const handlers = w.webkit as { messageHandlers?: { shakthiNative?: { postMessage: (m: unknown) => void } } } | undefined
  handlers?.messageHandlers?.shakthiNative?.postMessage({ type: 'openHealthSync' })
}

const PRIMARY_IDS = ['apple_health', 'apple_watch', 'renpho']

const COMING_SOON_PROVIDERS = [
  { id: 'ringconn',     icon: '💍', name: 'RingConn',       method: 'Via Apple Health · enable in RingConn app' },
  { id: 'myfitnesspal', icon: '🥗', name: 'MyFitnessPal',   method: 'Via Apple Health · or CSV from myfitnesspal.com' },
  { id: 'strava',       icon: '🏃', name: 'Strava',         method: 'OAuth 2.0 API · requires server-side proxy' },
  { id: 'garmin',       icon: '⌚', name: 'Garmin Connect', method: 'Via Apple Health · enable in Garmin Connect app' },
  { id: 'whoop',        icon: '⚡', name: 'WHOOP',          method: 'Via Apple Health · enable in WHOOP app' },
  { id: 'oura',         icon: '💍', name: 'Oura Ring',      method: 'Via Apple Health · enable in Oura app' },
]

export default function ConnectedAccounts() {
  const navigate = useNavigate()

  const inNativeApp = isInsideNativeApp()

  const [lastSyncs, setLastSyncs] = useState<Map<string, { at: string; count: number }>>(new Map())
  const [detectedSources, setDetectedSources] = useState<string[]>([])

  const loadData = useCallback(function loadData() {
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
    getImportedSources().then(setDetectedSources)
  }, [])

  useEffect(() => {
    loadData()
    window.addEventListener('native-health-sync-complete', loadData)
    return () => window.removeEventListener('native-health-sync-complete', loadData)
  }, [])

  const renphoDetected = detectedSources.includes('renpho')

  const accounts = useMemo<Account[]>(() => [
    {
      id: 'apple_health',
      name: 'Apple Health',
      shortName: 'Apple Health',
      icon: '🍎',
      status: inNativeApp ? 'connected' : 'import_ready',
      method: inNativeApp ? 'Via HealthKit · auto-sync' : 'XML export · manual import',
      dataTypes: ['Steps', 'Heart Rate', 'HRV', 'Sleep', 'Calories', 'Workouts'],
      description: inNativeApp
        ? 'Connected via HealthKit. Steps, heart rate, HRV, sleep, weight, and calories sync automatically. Tap "Sync Now" to pull the latest data immediately.'
        : 'Acts as the central hub. Apple Watch, RingConn, and RENPHO all sync into Apple Health, so importing a single Apple Health export gives you everything.',
      availability: 'now',
      setupInstructions: inNativeApp ? undefined : [
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
      status: inNativeApp ? 'connected' : 'needs_setup',
      method: inNativeApp ? 'Via HealthKit · included automatically' : 'Via Apple Health hub',
      dataTypes: ['Heart Rate', 'HRV', 'Activity', 'Workouts', 'ECG'],
      description: inNativeApp
        ? 'Apple Watch data flows through HealthKit automatically. No separate action needed — it\'s included every time you sync Apple Health.'
        : 'Apple Watch syncs all data to Apple Health automatically. No separate import needed — import Apple Health and Watch data is included.',
      availability: 'now',
      setupInstructions: inNativeApp ? undefined : [
        'Ensure Apple Watch is paired with your iPhone',
        'Open Watch app → Health → turn on all data sharing',
        'Then export Apple Health to get Watch data',
      ],
    },
    {
      id: 'renpho',
      name: 'RENPHO',
      shortName: 'RENPHO',
      icon: '⚖️',
      status: inNativeApp
        ? (renphoDetected ? 'connected' : 'needs_setup')
        : 'import_ready',
      method: inNativeApp
        ? (renphoDetected ? 'Connected via Apple Health' : 'Via Apple Health · setup needed')
        : 'CSV export · or via Apple Health',
      dataTypes: ['Weight', 'Body Fat', 'Muscle Mass', 'BMI', 'Water %'],
      description: inNativeApp
        ? (renphoDetected
          ? 'RENPHO body composition data is syncing through Apple Health — weight, body fat %, and more appear automatically after each sync.'
          : 'Open RENPHO app → Settings → Connect to → Health App → enable Weight and Body Fat. Then return here and tap "Sync Now" on Apple Health.')
        : 'RENPHO syncs to Apple Health if enabled, or you can export a CSV from the RENPHO app. Body composition data only — not available via any public API.',
      availability: 'now',
      importNote: inNativeApp ? undefined : 'No public RENPHO API exists. Apple Health sync or CSV export are the only options.',
      setupInstructions: inNativeApp ? (renphoDetected ? undefined : [
        'Open RENPHO app on your iPhone',
        'Go to Settings → Connect to → Health App',
        'Enable Weight, Body Fat %, Muscle Mass, and other metrics',
        'Return here and tap "Sync Now" on the Apple Health card',
      ]) : [
        'Open RENPHO app → More → Apple Health',
        'Enable body composition sharing, OR',
        'Go to RENPHO app → Profile → Export Data → select CSV',
      ],
    },
  ], [inNativeApp, renphoDetected])

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

  const primaryAccounts = accounts.filter(a => PRIMARY_IDS.includes(a.id))
  const connectedCount  = primaryAccounts.filter(a => a.status === 'connected').length
  const importReadyCount = primaryAccounts.filter(a => a.status === 'import_ready').length
  const needsSetupCount  = primaryAccounts.filter(a => a.status === 'needs_setup').length

  const deviceHint = useMemo(() => {
    if (inNativeApp) return { emoji: '✅', text: 'Apple Health is connected via HealthKit. Tap "Sync Now" on any card to pull the latest data.' }
    if (typeof navigator === 'undefined') return null
    const ua = navigator.userAgent
    if (/iPad|iPhone|iPod/.test(ua)) return { emoji: '📱', text: 'You\'re on iPhone — use the native app for automatic Apple Health sync, no file exports needed.' }
    if (/Android/.test(ua)) return { emoji: '🤖', text: 'You\'re on Android — Google Fit or Strava are your best starting points.' }
    return { emoji: '💻', text: 'On desktop, file imports work great. For live wearable sync, visit from your phone.' }
  }, [inNativeApp])

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

      {/* Primary accounts list */}
      <div className="accounts-list">
        {primaryAccounts.map(account => (
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
              nativeAction={
                inNativeApp && (account.id === 'apple_health' || account.id === 'apple_watch')
                  ? { label: 'Sync Now', onClick: openNativeHealthSync }
                  : undefined
              }
            />
          </div>
        ))}
      </div>

      {/* Coming Soon — compact list */}
      <div className="accounts-coming-soon">
        <h3 className="accounts-cs-heading">More sources coming soon</h3>
        <p className="accounts-cs-sub">These devices sync via Apple Health today. Direct integrations are planned for a future update.</p>
        {COMING_SOON_PROVIDERS.map(p => (
          <div key={p.id} className="accounts-cs-row">
            <span className="accounts-cs-icon">{p.icon}</span>
            <span className="accounts-cs-name">{p.name}</span>
            <span className="accounts-cs-method">{p.method}</span>
          </div>
        ))}
      </div>

      {/* What's real callout */}
      <div className="accounts-honesty-box">
        <h3>What's actually connected right now?</h3>
        <div className="honesty-grid">
          {inNativeApp ? (
            <>
              <div className="honesty-item honesty-item--yes">
                <strong>Real today (native app):</strong> Apple Health and Apple Watch via HealthKit — steps, heart rate, HRV, sleep, weight, calories, and body fat sync automatically. RENPHO data appears here automatically if you've enabled Apple Health sync in the RENPHO app.
              </div>
              <div className="honesty-item honesty-item--no">
                <strong>Not yet real:</strong> Background auto-sync (you tap Sync Now to pull fresh data), Strava direct API (requires server-side proxy), RingConn and WHOOP direct APIs (don't exist publicly).
              </div>
            </>
          ) : (
            <>
              <div className="honesty-item honesty-item--yes">
                <strong>Real today:</strong> Manual file import from Apple Health XML, RENPHO CSV, or MFP CSV. Strava OAuth once you add credentials.
              </div>
              <div className="honesty-item honesty-item--no">
                <strong>Not yet real:</strong> Automatic background sync, live API polling, Apple Watch direct access, RingConn API (doesn't exist publicly).
              </div>
              <div className="honesty-item honesty-item--future">
                <strong>Best experience:</strong> Use the native iOS app — Apple Health connects automatically via HealthKit with no file exports needed.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
