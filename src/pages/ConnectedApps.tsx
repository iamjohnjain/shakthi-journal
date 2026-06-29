import { useState, useRef } from 'react'
import {
  RefreshCw, Upload, AlertCircle, CheckCircle2, Clock,
  ChevronRight, Shield, Wifi, WifiOff, Zap, Lock,
} from 'lucide-react'
import { PROVIDERS, INITIAL_CONNECTIONS, MOCK_SYNC_RESULTS } from '../data/providers'
import type { ConnectedApp, ConnectionStatus, SyncStatus } from '../types/sync'
import './ConnectedApps.css'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelative(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function delay(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms))
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ConnectionStatus, { label: string; color: string; bg: string; icon?: React.ElementType }> = {
  connected:     { label: 'Connected',     color: 'var(--green)',  bg: 'var(--green-dim)',  icon: CheckCircle2 },
  import_ready:  { label: 'Import Ready',  color: 'var(--blue)',   bg: 'var(--blue-dim)',   icon: Upload },
  via_hub:       { label: 'Via Apple Health', color: 'var(--teal)', bg: 'var(--teal-dim)', icon: CheckCircle2 },
  needs_setup:   { label: 'Needs Setup',   color: 'var(--yellow)', bg: 'var(--yellow-dim)', icon: AlertCircle },
  not_connected: { label: 'Not Connected', color: 'var(--text-tertiary)', bg: 'rgba(255,255,255,0.05)', icon: WifiOff },
  coming_soon:   { label: 'Coming Soon',   color: 'var(--text-tertiary)', bg: 'rgba(255,255,255,0.05)' },
  syncing:       { label: 'Syncing…',      color: 'var(--blue)',   bg: 'var(--blue-dim)',   icon: RefreshCw },
  failed:        { label: 'Sync Failed',   color: 'var(--red)',    bg: 'var(--red-dim)',    icon: AlertCircle },
}

function StatusBadge({ status }: { status: ConnectionStatus }) {
  const cfg = STATUS_CONFIG[status]
  const Icon = cfg.icon
  return (
    <span className={`status-badge ${status === 'syncing' ? 'status-badge--spinning' : ''}`}
      style={{ color: cfg.color, background: cfg.bg }}>
      {Icon && <Icon size={11} />}
      {cfg.label}
    </span>
  )
}

// ─── Sync Center ──────────────────────────────────────────────────────────────

interface SyncCenterProps {
  connections: ConnectedApp[]
  syncStates: Record<string, SyncStatus>
  globalSyncing: boolean
  lastSyncLabel: string
  totalRecords: number
  onSyncAll: () => void
}

function SyncCenter({ connections, syncStates, globalSyncing, lastSyncLabel, totalRecords, onSyncAll }: SyncCenterProps) {
  const activeConnections = connections.filter(c =>
    ['connected', 'import_ready', 'via_hub'].includes(c.status)
  )
  const needsSetup = connections.filter(c => c.status === 'needs_setup')
  const notReady = connections.filter(c => ['coming_soon', 'not_connected'].includes(c.status))

  return (
    <div className="sync-center">
      <div className="sync-center-header">
        <div className="sync-center-title-row">
          <Zap size={16} className="sync-center-icon" />
          <span className="sync-center-title">Sync Center</span>
        </div>
        <p className="sync-center-sub">One button. All your health data.</p>
      </div>

      {/* Source status dots */}
      <div className="sync-dots-grid">
        {PROVIDERS.map(provider => {
          const conn = connections.find(c => c.providerId === provider.id)
          const syncState = syncStates[provider.id]
          const status = syncState?.state === 'syncing' ? 'syncing'
            : syncState?.state === 'success' ? (conn?.status === 'via_hub' ? 'via_hub' : 'import_ready')
            : conn?.status ?? 'not_connected'

          const cfg = STATUS_CONFIG[status as ConnectionStatus]
          return (
            <div key={provider.id} className="sync-dot-item">
              <span className={`sync-dot ${syncState?.state === 'syncing' ? 'sync-dot--pulse' : ''}`}
                style={{ background: cfg.color }} />
              <span className="sync-dot-name">{provider.shortName}</span>
              {syncState?.state === 'success' && (
                <span className="sync-dot-count">+{syncStates[provider.id].message}</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Main sync button */}
      <button
        className={`sync-all-btn ${globalSyncing ? 'syncing' : ''}`}
        onClick={onSyncAll}
        disabled={globalSyncing}
      >
        <RefreshCw size={18} className={`sync-all-icon ${globalSyncing ? 'spinning' : ''}`} />
        {globalSyncing ? 'Syncing Health Data…' : 'Sync All Health Data'}
      </button>

      {/* Footer stats */}
      <div className="sync-center-footer">
        <div className="sync-footer-stat">
          <Clock size={12} />
          <span>Last synced: {lastSyncLabel}</span>
        </div>
        {totalRecords > 0 && (
          <div className="sync-footer-stat">
            <Wifi size={12} />
            <span>{totalRecords.toLocaleString()} total records</span>
          </div>
        )}
        <div className="sync-footer-stat">
          <CheckCircle2 size={12} style={{ color: 'var(--green)' }} />
          <span>{activeConnections.length} sources ready</span>
        </div>
        {needsSetup.length > 0 && (
          <div className="sync-footer-stat" style={{ color: 'var(--yellow)' }}>
            <AlertCircle size={12} />
            <span>{needsSetup.length} need setup</span>
          </div>
        )}
        {notReady.length > 0 && (
          <div className="sync-footer-stat" style={{ color: 'var(--text-tertiary)' }}>
            <Clock size={12} />
            <span>{notReady.length} planned</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── App Card ─────────────────────────────────────────────────────────────────

const PROVIDER_ICONS: Record<string, string> = {
  apple_health: '❤️',
  apple_watch: '⌚',
  ringconn: '💍',
  renpho: '⚖️',
  strava: '🏃',
  myfitnesspal: '🥗',
}

const PROVIDER_ACCENT: Record<string, string> = {
  apple_health: 'var(--red)',
  apple_watch: 'var(--blue)',
  ringconn: 'var(--purple)',
  renpho: 'var(--teal)',
  strava: 'var(--orange)',
  myfitnesspal: 'var(--green)',
}

interface AppCardProps {
  connection: ConnectedApp
  syncState?: SyncStatus
  onSync: (id: string) => void
  onImport: (id: string) => void
  onSetup: (id: string) => void
}

function AppCard({ connection, syncState, onSync, onImport, onSetup }: AppCardProps) {
  const provider = PROVIDERS.find(p => p.id === connection.providerId)!
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isSyncing = syncState?.state === 'syncing'
  const justSynced = syncState?.state === 'success'

  const effectiveStatus: ConnectionStatus = isSyncing ? 'syncing' : connection.status

  const accentColor = PROVIDER_ACCENT[provider.id]
  const isHub = provider.category === 'hub'
  const isViaHub = connection.status === 'via_hub'
  const canSync = ['import_ready', 'connected'].includes(connection.status)
  const canImport = !!provider.importFileType
  const isComingSoon = connection.status === 'coming_soon'

  const lastSynced = justSynced ? 'Just now'
    : syncState?.state === 'error' ? 'Failed'
    : formatRelative(connection.lastSyncedAt)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.[0]) {
      onImport(provider.id)
      e.target.value = ''
    }
  }

  return (
    <div className={`app-card ${isHub ? 'app-card--hub' : ''} ${isSyncing ? 'app-card--syncing' : ''}`}
      style={{ '--accent': accentColor } as React.CSSProperties}>

      {/* Header */}
      <div className="app-card-head">
        <div className="app-card-identity">
          <div className="app-card-icon"
            style={{ background: `color-mix(in srgb, ${accentColor} 12%, transparent)` }}>
            <span>{PROVIDER_ICONS[provider.id]}</span>
          </div>
          <div>
            <div className="app-card-name">{provider.name}</div>
            {isHub && <div className="app-card-hub-label">Central Health Hub</div>}
          </div>
        </div>
        <StatusBadge status={effectiveStatus} />
      </div>

      {/* Description */}
      <p className="app-card-desc">{provider.description}</p>

      {/* Data types */}
      <div className="app-card-types">
        {provider.dataTypes.slice(0, 5).map(t => (
          <span key={t} className="app-card-type-chip">{t}</span>
        ))}
        {provider.dataTypes.length > 5 && (
          <span className="app-card-type-chip app-card-type-chip--more">
            +{provider.dataTypes.length - 5} more
          </span>
        )}
      </div>

      {/* Last sync */}
      <div className="app-card-sync-row">
        <Clock size={12} />
        <span>Last synced: <strong>{lastSynced}</strong></span>
        {connection.lastSyncedRecordCount != null && !justSynced && (
          <span className="app-card-record-count">
            {connection.lastSyncedRecordCount.toLocaleString()} records
          </span>
        )}
        {justSynced && syncState?.message && (
          <span className="app-card-just-synced">✓ {syncState.message}</span>
        )}
      </div>

      {/* Setup note */}
      {provider.setupNote && ['needs_setup', 'not_connected'].includes(connection.status) && (
        <div className="app-card-setup-note">
          <AlertCircle size={13} style={{ flexShrink: 0, color: 'var(--yellow)' }} />
          <span>{provider.setupNote}</span>
        </div>
      )}

      {/* Coming soon phase note */}
      {isComingSoon && (
        <div className="app-card-phase-note">
          OAuth integration planned for Phase {provider.targetPhase}.
          Use "Import CSV" now as a manual fallback.
        </div>
      )}

      {/* Actions */}
      {!isViaHub && (
        <div className="app-card-actions">
          {canSync && (
            <button
              className="app-card-btn app-card-btn--primary"
              style={{ background: isSyncing ? 'rgba(255,255,255,0.06)' : accentColor }}
              onClick={() => onSync(provider.id)}
              disabled={isSyncing}
            >
              <RefreshCw size={13} className={isSyncing ? 'spinning' : ''} />
              {isSyncing ? 'Syncing…' : 'Sync Now'}
            </button>
          )}
          {connection.status === 'needs_setup' && (
            <button className="app-card-btn app-card-btn--outline" onClick={() => onSetup(provider.id)}>
              <ChevronRight size={13} />
              Setup Guide
            </button>
          )}
          {canImport && (
            <>
              <button
                className={`app-card-btn ${canSync ? 'app-card-btn--ghost' : 'app-card-btn--primary'}`}
                style={!canSync ? { background: accentColor } : undefined}
                onClick={() => fileInputRef.current?.click()}
                disabled={isSyncing}
              >
                <Upload size={13} />
                Import {provider.importFileType?.toUpperCase()}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept={`.${provider.importFileType}`}
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
            </>
          )}
          {isComingSoon && canImport && (
            <button className="app-card-btn app-card-btn--ghost" onClick={() => fileInputRef.current?.click()}>
              <Upload size={13} />
              Import CSV (now)
            </button>
          )}
          {isComingSoon && !canImport && (
            <button className="app-card-btn app-card-btn--disabled" disabled>
              <Lock size={13} />
              OAuth · Phase {provider.targetPhase}
            </button>
          )}
        </div>
      )}

      {isViaHub && (
        <div className="app-card-via-hub">
          <CheckCircle2 size={13} style={{ color: 'var(--teal)' }} />
          <span>Data flows through Apple Health automatically. No separate action needed.</span>
        </div>
      )}

      {/* Privacy note */}
      <div className="app-card-privacy">
        <Lock size={11} />
        <span>{provider.privacyNote}</span>
      </div>
    </div>
  )
}

// ─── Setup Modal (lightweight) ────────────────────────────────────────────────

function SetupModal({ providerId, onClose }: { providerId: string; onClose: () => void }) {
  const provider = PROVIDERS.find(p => p.id === providerId)
  if (!provider) return null

  return (
    <div className="setup-modal-overlay" onClick={onClose}>
      <div className="setup-modal" onClick={e => e.stopPropagation()}>
        <div className="setup-modal-header">
          <span className="setup-modal-icon">{PROVIDER_ICONS[provider.id]}</span>
          <h2>Set up {provider.name}</h2>
          <button className="setup-modal-close" onClick={onClose}>✕</button>
        </div>
        <p className="setup-modal-intro">{provider.description}</p>
        {provider.setupNote && (
          <div className="setup-modal-steps">
            <h3>Steps</h3>
            <p>{provider.setupNote}</p>
          </div>
        )}
        {provider.importInstructions && (
          <div className="setup-modal-steps">
            <h3>Manual export (alternative)</h3>
            <p>{provider.importInstructions}</p>
          </div>
        )}
        <div className="setup-modal-privacy">
          <Lock size={13} />
          <span>{provider.privacyNote}</span>
        </div>
        <button className="setup-modal-done" onClick={onClose}>Got it</button>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ConnectedApps() {
  const [connections, setConnections] = useState<ConnectedApp[]>(INITIAL_CONNECTIONS)
  const [syncStates, setSyncStates] = useState<Record<string, SyncStatus>>({})
  const [globalSyncing, setGlobalSyncing] = useState(false)
  const [lastSyncLabel, setLastSyncLabel] = useState('2 hours ago')
  const [totalRecords, setTotalRecords] = useState(
    INITIAL_CONNECTIONS.reduce((s, c) => s + (c.lastSyncedRecordCount ?? 0), 0)
  )
  const [setupModalId, setSetupModalId] = useState<string | null>(null)

  const syncableIds = connections
    .filter(c => ['import_ready', 'connected'].includes(c.status))
    .map(c => c.providerId)

  async function simulateSync(providerId: string): Promise<void> {
    const mockResult = MOCK_SYNC_RESULTS[providerId]
    if (!mockResult) return

    setSyncStates(prev => ({
      ...prev,
      [providerId]: { providerId, state: 'syncing', message: 'Pulling data…' },
    }))

    await delay(1200 + Math.random() * 800)

    setSyncStates(prev => ({
      ...prev,
      [providerId]: {
        providerId,
        state: 'success',
        message: `${mockResult.records} records`,
      },
    }))

    setConnections(prev => prev.map(c =>
      c.providerId === providerId
        ? { ...c, lastSyncedAt: new Date().toISOString(), lastSyncedRecordCount: mockResult.records }
        : c
    ))

    setTotalRecords(prev => prev + mockResult.records)
  }

  async function handleSyncAll() {
    if (globalSyncing || syncableIds.length === 0) return
    setGlobalSyncing(true)
    setLastSyncLabel('Syncing…')

    await Promise.all(syncableIds.map((id, i) =>
      delay(i * 300).then(() => simulateSync(id))
    ))

    setGlobalSyncing(false)
    setLastSyncLabel('Just now')
  }

  async function handleSyncOne(providerId: string) {
    await simulateSync(providerId)
    setLastSyncLabel('Just now')
  }

  function handleImport(providerId: string) {
    simulateSync(providerId)
    setLastSyncLabel('Just now')
  }

  return (
    <div className="connected-page">

      {/* Header */}
      <header className="connected-header">
        <div>
          <h1 className="connected-title">Connected Apps</h1>
          <p className="connected-subtitle">Manage your health data sources</p>
        </div>
      </header>

      {/* Privacy banner */}
      <div className="privacy-banner">
        <Shield size={15} className="privacy-banner-icon" />
        <div className="privacy-banner-text">
          <strong>Privacy first.</strong> All health data is processed locally on your Mac.
          Nothing is sent to a server unless you explicitly connect a cloud service.
          Import files are parsed in your browser and immediately discarded.
        </div>
      </div>

      {/* Sync Center */}
      <SyncCenter
        connections={connections}
        syncStates={syncStates}
        globalSyncing={globalSyncing}
        lastSyncLabel={lastSyncLabel}
        totalRecords={totalRecords}
        onSyncAll={handleSyncAll}
      />

      {/* Apple Health — featured hub card */}
      <section className="connected-section">
        <h2 className="connected-section-title">Health Hub</h2>
        <div className="hub-grid">
          <AppCard
            connection={connections.find(c => c.providerId === 'apple_health')!}
            syncState={syncStates['apple_health']}
            onSync={handleSyncOne}
            onImport={handleImport}
            onSetup={setSetupModalId}
          />
        </div>
      </section>

      {/* Devices — via Apple Health */}
      <section className="connected-section">
        <h2 className="connected-section-title">Your Devices <span className="connected-section-note">sync through Apple Health</span></h2>
        <div className="devices-grid">
          {['apple_watch', 'ringconn', 'renpho'].map(id => (
            <AppCard
              key={id}
              connection={connections.find(c => c.providerId === id)!}
              syncState={syncStates[id]}
              onSync={handleSyncOne}
              onImport={handleImport}
              onSetup={setSetupModalId}
            />
          ))}
        </div>
      </section>

      {/* Apps — direct connections */}
      <section className="connected-section">
        <h2 className="connected-section-title">Apps</h2>
        <div className="apps-grid">
          {['strava', 'myfitnesspal'].map(id => (
            <AppCard
              key={id}
              connection={connections.find(c => c.providerId === id)!}
              syncState={syncStates[id]}
              onSync={handleSyncOne}
              onImport={handleImport}
              onSetup={setSetupModalId}
            />
          ))}
        </div>
      </section>

      {/* Phase roadmap */}
      <section className="phase-roadmap">
        <h2 className="connected-section-title">Sync Roadmap</h2>
        <div className="phase-list">
          {[
            { phase: 1, label: 'Mock sync + manual file imports', done: true },
            { phase: 2, label: 'Apple Health XML full parser', done: false },
            { phase: 3, label: 'Strava official OAuth API', done: false },
            { phase: 4, label: 'RENPHO & RingConn via Apple Health', done: false },
            { phase: 5, label: 'MyFitnessPal CSV or official API', done: false },
            { phase: 6, label: 'Native iOS HealthKit companion (real-time)', done: false },
          ].map(p => (
            <div key={p.phase} className={`phase-item ${p.done ? 'phase-item--done' : ''}`}>
              <div className={`phase-num ${p.done ? 'phase-num--done' : ''}`}>{p.done ? '✓' : p.phase}</div>
              <span className="phase-label">{p.label}</span>
              {p.done && <span className="phase-badge">Current</span>}
            </div>
          ))}
        </div>
      </section>

      {/* Setup modal */}
      {setupModalId && (
        <SetupModal providerId={setupModalId} onClose={() => setSetupModalId(null)} />
      )}
    </div>
  )
}
