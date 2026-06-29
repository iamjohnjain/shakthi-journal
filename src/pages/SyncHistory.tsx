import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, AlertCircle, RefreshCw, Trash2 } from 'lucide-react'
import DataBadge, { type DataBadgeMode } from '../components/DataBadge'
import { getSyncHistory, clearSyncHistory } from '../db'
import type { ShakthiDB } from '../db'
import './SyncHistory.css'

type SyncEntry = ShakthiDB['sync_history']['value']

// ─── Seeded mock history so the page isn't empty ──────────────────────────────

const MOCK_HISTORY: SyncEntry[] = [
  {
    id: 'mock-1',
    sourceId: 'apple_health',
    sourceName: 'Apple Health',
    status: 'success',
    recordCount: 842,
    dataTypes: ['Steps', 'Heart Rate', 'HRV', 'Sleep', 'Workouts'],
    dataMode: 'mock',
    startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    completedAt: new Date(Date.now() - 2 * 60 * 60 * 1000 + 1200).toISOString(),
    durationMs: 1200,
  },
  {
    id: 'mock-2',
    sourceId: 'renpho',
    sourceName: 'RENPHO',
    status: 'success',
    recordCount: 4,
    dataTypes: ['Weight', 'Body Fat', 'Muscle Mass', 'BMI'],
    dataMode: 'mock',
    startedAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    completedAt: new Date(Date.now() - 26 * 60 * 60 * 1000 + 480).toISOString(),
    durationMs: 480,
  },
  {
    id: 'mock-3',
    sourceId: 'myfitnesspal',
    sourceName: 'MyFitnessPal',
    status: 'success',
    recordCount: 5,
    dataTypes: ['Calories In', 'Protein', 'Carbs', 'Fat'],
    dataMode: 'mock',
    startedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    completedAt: new Date(Date.now() - 5 * 60 * 60 * 1000 + 600).toISOString(),
    durationMs: 600,
  },
  {
    id: 'mock-4',
    sourceId: 'renpho',
    sourceName: 'RENPHO',
    status: 'failed',
    recordCount: 0,
    dataTypes: ['Weight'],
    dataMode: 'mock',
    startedAt: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(),
    completedAt: new Date(Date.now() - 50 * 60 * 60 * 1000 + 200).toISOString(),
    durationMs: 200,
    error: 'File format invalid — expected CSV, received XLSX',
  },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60_000)
  const hours = Math.floor(ms / 3_600_000)
  const days = Math.floor(ms / 86_400_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

function formatAbsolute(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

const SOURCE_ICONS: Record<string, string> = {
  apple_health: '🍎',
  apple_watch:  '⌚',
  ringconn:     '💍',
  renpho:       '⚖️',
  strava:       '🏃',
  myfitnesspal: '🥗',
}

// ─── Row component ────────────────────────────────────────────────────────────

function SyncRow({ entry }: { entry: SyncEntry }) {
  const [expanded, setExpanded] = useState(false)

  const StatusIcon =
    entry.status === 'success' ? CheckCircle :
    entry.status === 'failed'  ? XCircle :
    AlertCircle

  const statusColor =
    entry.status === 'success' ? 'var(--green)' :
    entry.status === 'failed'  ? 'var(--red)' :
    'var(--yellow)'

  const badgeMode: DataBadgeMode =
    entry.dataMode === 'live' ? 'live' :
    entry.dataMode === 'imported' ? 'imported' : 'mock'

  return (
    <div className={`sync-row ${entry.status === 'failed' ? 'sync-row--failed' : ''}`}>
      <div className="sync-row-main" onClick={() => setExpanded(v => !v)}>
        {/* Source */}
        <div className="sync-col sync-col--source">
          <span className="sync-source-icon">{SOURCE_ICONS[entry.sourceId] ?? '📦'}</span>
          <span className="sync-source-name">{entry.sourceName}</span>
        </div>

        {/* Status */}
        <div className="sync-col sync-col--status">
          <StatusIcon size={13} style={{ color: statusColor, flexShrink: 0 }} />
          <span style={{ color: statusColor, fontWeight: 600, fontSize: '12px' }}>
            {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
          </span>
        </div>

        {/* Records */}
        <div className="sync-col sync-col--records">
          <span className="sync-records">{entry.recordCount.toLocaleString()}</span>
          <span className="sync-records-label"> records</span>
        </div>

        {/* Data mode */}
        <div className="sync-col sync-col--mode">
          <DataBadge mode={badgeMode} />
        </div>

        {/* Time */}
        <div className="sync-col sync-col--time">
          <span className="sync-time-relative" title={formatAbsolute(entry.startedAt)}>
            {formatRelative(entry.startedAt)}
          </span>
          <span className="sync-duration">{formatDuration(entry.durationMs)}</span>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="sync-row-detail">
          <div className="sync-detail-row">
            <span className="sync-detail-label">Synced at</span>
            <span className="sync-detail-value">{formatAbsolute(entry.startedAt)}</span>
          </div>
          <div className="sync-detail-row">
            <span className="sync-detail-label">Duration</span>
            <span className="sync-detail-value">{formatDuration(entry.durationMs)}</span>
          </div>
          <div className="sync-detail-row">
            <span className="sync-detail-label">Data types</span>
            <span className="sync-detail-value">
              {entry.dataTypes.join(', ')}
            </span>
          </div>
          <div className="sync-detail-row">
            <span className="sync-detail-label">Source</span>
            <span className="sync-detail-value">{entry.sourceName}</span>
          </div>
          <div className="sync-detail-row">
            <span className="sync-detail-label">Storage</span>
            <span className="sync-detail-value">IndexedDB · shakthi-journal · local only</span>
          </div>
          {entry.error && (
            <div className="sync-detail-row sync-detail-row--error">
              <span className="sync-detail-label">Error</span>
              <span className="sync-detail-value">{entry.error}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type StatusFilter = 'all' | 'success' | 'failed'
type ModeFilter   = 'all' | 'imported' | 'mock' | 'manual' | 'live'
type SourceFilter = 'all' | string

const ALL_SOURCES = [
  { id: 'apple_health', label: 'Apple Health' },
  { id: 'renpho',       label: 'RENPHO' },
  { id: 'strava',       label: 'Strava' },
  { id: 'myfitnesspal', label: 'MyFitnessPal' },
  { id: 'manual',       label: 'Manual' },
]

export default function SyncHistory() {
  const [entries,      setEntries]      = useState<SyncEntry[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [modeFilter,   setModeFilter]   = useState<ModeFilter>('all')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [clearing,     setClearing]     = useState(false)

  useEffect(() => {
    getSyncHistory().then(real => {
      setEntries(real.length > 0 ? real : MOCK_HISTORY)
    })
  }, [])

  async function handleClear() {
    setClearing(true)
    await clearSyncHistory()
    setEntries(MOCK_HISTORY)
    setClearing(false)
  }

  const filtered = entries.filter(e => {
    if (statusFilter !== 'all' && e.status !== statusFilter) return false
    if (modeFilter   !== 'all' && e.dataMode !== modeFilter) return false
    if (sourceFilter !== 'all' && e.sourceId !== sourceFilter) return false
    return true
  })

  const successCount = entries.filter(e => e.status === 'success').length
  const failedCount  = entries.filter(e => e.status === 'failed').length
  const totalRecords = entries.filter(e => e.status === 'success').reduce((n, e) => n + e.recordCount, 0)
  const mockCount    = entries.filter(e => e.dataMode === 'mock').length

  return (
    <div className="sync-history-page">
      <header className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Sync History</h1>
          <p className="page-subtitle">Every import and sync attempt — what happened and when.</p>
        </div>
        <button className="btn-clear" onClick={handleClear} disabled={clearing}>
          <Trash2 size={13} />
          {clearing ? 'Clearing…' : 'Clear History'}
        </button>
      </header>

      {/* Stats row */}
      <div className="sync-stats">
        <div className="sync-stat">
          <span className="sync-stat-num" style={{ color: 'var(--green)' }}>{successCount}</span>
          <span className="sync-stat-label">Successful</span>
        </div>
        <div className="sync-stat">
          <span className="sync-stat-num" style={{ color: 'var(--red)' }}>{failedCount}</span>
          <span className="sync-stat-label">Failed</span>
        </div>
        <div className="sync-stat">
          <span className="sync-stat-num">{totalRecords.toLocaleString()}</span>
          <span className="sync-stat-label">Records imported</span>
        </div>
        {mockCount > 0 && (
          <div className="sync-stat">
            <span className="sync-stat-num" style={{ color: 'var(--yellow)' }}>{mockCount}</span>
            <span className="sync-stat-label">Mock entries</span>
          </div>
        )}
      </div>

      {/* Mock note */}
      {mockCount > 0 && (
        <div className="sync-mock-note">
          <DataBadge mode="mock" />
          <span>These entries are simulated — no real sync has occurred. They'll be replaced when you import real data.</span>
        </div>
      )}

      {/* Status filter */}
      <div className="sync-filters">
        <span className="sync-filter-label">Status:</span>
        {(['all', 'success', 'failed'] as StatusFilter[]).map(f => (
          <button
            key={f}
            className={`sync-filter-btn ${statusFilter === f ? 'active' : ''}`}
            onClick={() => setStatusFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f === 'all'     && <span className="sync-filter-count">{entries.length}</span>}
            {f === 'success' && <span className="sync-filter-count">{successCount}</span>}
            {f === 'failed'  && <span className="sync-filter-count">{failedCount}</span>}
          </button>
        ))}
      </div>

      {/* Source + mode filter */}
      <div className="sync-filters sync-filters--secondary">
        <span className="sync-filter-label">Source:</span>
        <button className={`sync-filter-btn ${sourceFilter === 'all' ? 'active' : ''}`} onClick={() => setSourceFilter('all')}>All</button>
        {ALL_SOURCES.filter(s => entries.some(e => e.sourceId === s.id)).map(s => (
          <button key={s.id} className={`sync-filter-btn ${sourceFilter === s.id ? 'active' : ''}`} onClick={() => setSourceFilter(s.id)}>
            {SOURCE_ICONS[s.id]} {s.label}
          </button>
        ))}

        <span className="sync-filter-label sync-filter-label--mode">Mode:</span>
        {(['all', 'imported', 'manual', 'mock'] as ModeFilter[]).map(m => (
          <button key={m} className={`sync-filter-btn ${modeFilter === m ? 'active' : ''}`} onClick={() => setModeFilter(m)}>
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      {/* Column headers */}
      <div className="sync-table-header">
        <span className="sync-col sync-col--source">Source</span>
        <span className="sync-col sync-col--status">Status</span>
        <span className="sync-col sync-col--records">Records</span>
        <span className="sync-col sync-col--mode">Data Mode</span>
        <span className="sync-col sync-col--time">When</span>
      </div>

      {/* Rows */}
      <div className="sync-rows">
        {filtered.length === 0 ? (
          <div className="sync-empty">
            <RefreshCw size={24} style={{ color: 'var(--text-tertiary)' }} />
            <p>No matching sync entries.</p>
          </div>
        ) : (
          filtered.map(e => <SyncRow key={e.id} entry={e} />)
        )}
      </div>
    </div>
  )
}
