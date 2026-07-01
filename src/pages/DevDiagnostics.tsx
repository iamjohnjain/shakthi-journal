import { useState, useEffect } from 'react'
import { RefreshCw, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { getDBStats } from '../db'
import { stravaCredentialsConfigured, loadStravaToken } from '../services/strava/stravaOAuth'
import './DevDiagnostics.css'

interface DBStats { metricCount: number; syncCount: number; version: number }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusDot({ ok, warn }: { ok: boolean; warn?: boolean }) {
  const color = ok ? 'var(--green)' : warn ? 'var(--yellow)' : 'var(--red)'
  const Icon  = ok ? CheckCircle : warn ? AlertCircle : XCircle
  return <Icon size={14} style={{ color, flexShrink: 0 }} />
}

function DiagRow({
  label, value, ok, warn, mono,
}: {
  label: string; value: string; ok?: boolean; warn?: boolean; mono?: boolean
}) {
  return (
    <div className="diag-row">
      <span className="diag-label">{label}</span>
      <span className={`diag-value ${mono ? 'mono' : ''}`} style={{
        color: ok === true ? 'var(--green)' : ok === false ? 'var(--red)' : warn ? 'var(--yellow)' : 'var(--text-secondary)'
      }}>
        {ok !== undefined && <StatusDot ok={ok} warn={warn} />}
        {value}
      </span>
    </div>
  )
}

function DiagSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="diag-section">
      <h2 className="diag-section-title">{title}</h2>
      <div className="diag-section-body">{children}</div>
    </div>
  )
}

// ─── Integration matrix ───────────────────────────────────────────────────────

interface Integration {
  name: string
  realStatus: 'live_api' | 'import_only' | 'via_hub' | 'no_api' | 'needs_credentials'
  note: string
}

const INTEGRATIONS: Integration[] = [
  { name: 'Apple Health',  realStatus: 'import_only',        note: 'XML export → manual import. No web API.' },
  { name: 'Apple Watch',   realStatus: 'via_hub',            note: 'Data flows through Apple Health.' },
  { name: 'RingConn',      realStatus: 'via_hub',            note: 'Enable Apple Health sync in RingConn app.' },
  { name: 'RENPHO',        realStatus: 'import_only',        note: 'CSV export or Apple Health sync. No API.' },
  { name: 'Strava',        realStatus: stravaCredentialsConfigured() ? 'live_api' : 'needs_credentials', note: stravaCredentialsConfigured() ? 'OAuth 2.0 credentials configured.' : 'Add credentials to .env.' },
  { name: 'MyFitnessPal',  realStatus: 'no_api',             note: 'API removed 2019. CSV or Apple Health only.' },
]

const STATUS_LABEL: Record<Integration['realStatus'], string> = {
  live_api:          'OAuth API',
  import_only:       'Import Only',
  via_hub:           'Via Apple Health',
  no_api:            'No API',
  needs_credentials: 'Missing credentials',
}

const STATUS_COLOR: Record<Integration['realStatus'], string> = {
  live_api:          'var(--green)',
  import_only:       'var(--blue)',
  via_hub:           'var(--teal)',
  no_api:            'var(--text-tertiary)',
  needs_credentials: 'var(--yellow)',
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DevDiagnostics() {
  const { mockMode, setMockMode, dbStatus, dbError, appVersion } = useApp()
  const [dbStats, setDbStats] = useState<DBStats | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [resetConfirm, setResetConfirm] = useState(false)

  async function handleResetLocalState() {
    if (!resetConfirm) { setResetConfirm(true); return }
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase('shakthi-journal')
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
    window.location.reload()
  }

  async function refresh() {
    setRefreshing(true)
    try {
      const stats = await getDBStats()
      setDbStats(stats)
    } catch { /* DB not ready */ }
    setRefreshing(false)
  }

  useEffect(() => { refresh() }, [])

  // Env var checks
  const stravaClientId  = !!import.meta.env.VITE_STRAVA_CLIENT_ID
  const stravaSecret    = !!import.meta.env.VITE_STRAVA_CLIENT_SECRET
  const stravaRedirect  = !!import.meta.env.VITE_STRAVA_REDIRECT_URI
  const stravaToken     = !!loadStravaToken()

  return (
    <div className="dev-diagnostics-page">
      <header className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Developer Diagnostics</h1>
          <p className="page-subtitle">Real-time status of integrations, database, and environment.</p>
        </div>
        <button className="btn-refresh" onClick={refresh} disabled={refreshing}>
          <RefreshCw size={13} className={refreshing ? 'spin' : ''} />
          Refresh
        </button>
      </header>

      {/* ── Environment variables ── */}
      <DiagSection title="Environment Variables">
        <DiagRow label="VITE_STRAVA_CLIENT_ID"     value={stravaClientId  ? 'Set' : 'Missing'} ok={stravaClientId}  mono />
        <DiagRow label="VITE_STRAVA_CLIENT_SECRET"  value={stravaSecret   ? 'Set (do not log)' : 'Missing'} ok={stravaSecret}    mono />
        <DiagRow label="VITE_STRAVA_REDIRECT_URI"   value={import.meta.env.VITE_STRAVA_REDIRECT_URI ?? 'Not set (using default)'} ok={stravaRedirect} mono />
        <DiagRow label="VITE_APP_VERSION"           value={import.meta.env.VITE_APP_VERSION ?? 'Not set'} ok={!!import.meta.env.VITE_APP_VERSION} mono />
        <div className="diag-note">
          Env vars are embedded in the JS bundle at build time (VITE_ prefix). Never log client secrets.
          Add values to .env (gitignored). See .env.example.
        </div>
      </DiagSection>

      {/* ── Database ── */}
      <DiagSection title="IndexedDB Database">
        <DiagRow label="Status"      value={dbStatus}                  ok={dbStatus === 'ready'} />
        {dbError && <DiagRow label="Error" value={dbError} ok={false} />}
        <DiagRow label="DB name"     value="shakthi-journal"           mono />
        <DiagRow label="Version"     value={dbStats ? String(dbStats.version) : '…'} mono />
        <DiagRow label="Metrics"     value={dbStats ? `${dbStats.metricCount} records` : '…'} />
        <DiagRow label="Sync log"    value={dbStats ? `${dbStats.syncCount} entries` : '…'} />
        <DiagRow label="Stores"      value="health_metrics · sync_history · settings" mono />
        <div className="diag-note">
          Data is stored locally in this browser's IndexedDB. Clearing browser data deletes everything.
        </div>
      </DiagSection>

      {/* ── Mock mode ── */}
      <DiagSection title="Mock Data Mode">
        <DiagRow
          label="Status"
          value={mockMode ? 'ON — simulated data active' : 'OFF — showing real data only'}
          ok={!mockMode}
          warn={mockMode}
        />
        <div className="diag-actions">
          <button
            className={`diag-action-btn ${mockMode ? 'diag-action-btn--warn' : ''}`}
            onClick={() => setMockMode(!mockMode)}
          >
            {mockMode ? 'Disable Mock Mode' : 'Enable Mock Mode'}
          </button>
        </div>
        <div className="diag-note">
          When ON, dashboard shows realistic simulated data with yellow MOCK DATA badges.
          Turn OFF when you have real imported data.
        </div>
      </DiagSection>

      {/* ── Strava OAuth state ── */}
      <DiagSection title="Strava OAuth">
        <DiagRow label="Credentials configured" value={stravaCredentialsConfigured() ? 'Yes' : 'No'} ok={stravaCredentialsConfigured()} />
        <DiagRow label="Token stored"           value={stravaToken ? 'Yes — localStorage' : 'No'} ok={stravaToken} />
        {stravaToken && (() => {
          const t = loadStravaToken()!
          const expired = Date.now() / 1000 >= t.expires_at - 60
          return <>
            <DiagRow label="Token expires"  value={new Date(t.expires_at * 1000).toLocaleString()} ok={!expired} warn={expired} />
            <DiagRow label="Athlete"        value={`${t.athlete.firstname} ${t.athlete.lastname} (ID: ${t.athlete.id})`} />
          </>
        })()}
        <div className="diag-note">
          Strava token is stored in localStorage. Not encrypted — acceptable for personal dev use.
          Production apps should use a backend token proxy.
        </div>
      </DiagSection>

      {/* ── Integration matrix ── */}
      <DiagSection title="Integration Status Matrix">
        {INTEGRATIONS.map(i => (
          <div key={i.name} className="diag-integration-row">
            <span className="diag-label">{i.name}</span>
            <div className="diag-integration-right">
              <span className="diag-integration-status" style={{ color: STATUS_COLOR[i.realStatus] }}>
                {STATUS_LABEL[i.realStatus]}
              </span>
              <span className="diag-integration-note">{i.note}</span>
            </div>
          </div>
        ))}
      </DiagSection>

      {/* ── Danger zone ── */}
      <DiagSection title="Danger Zone">
        <div className="diag-note">
          These actions affect local IndexedDB only. Cloud data in Supabase is never touched.
        </div>
        <div className="diag-actions">
          <button
            className="diag-action-btn diag-action-btn--destructive"
            onClick={handleResetLocalState}
          >
            {resetConfirm ? 'Tap again — this deletes all local data' : 'Reset Local App State'}
          </button>
        </div>
      </DiagSection>

      {/* ── App ── */}
      <DiagSection title="App">
        <DiagRow label="App name"  value="Shakthi Journal" />
        <DiagRow label="Version"   value={`v${appVersion}`} mono />
        <DiagRow label="Framework" value="Vite 6 · React 18 · TypeScript" mono />
        <DiagRow label="Dev URL"   value="http://localhost:5173" mono />
        <DiagRow label="Build"     value="npm run build → dist/" mono />
        <DiagRow label="DB"        value="IndexedDB via idb · local only" mono />
        <DiagRow label="Auth"      value="None — local only (cloud auth in docs/AUTH_PLAN.md)" />
      </DiagSection>
    </div>
  )
}
