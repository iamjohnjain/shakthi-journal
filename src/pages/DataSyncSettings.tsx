import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Link2, History, Download as DownloadIcon, Upload,
  FlaskConical, Database, ShieldCheck, Trash2,
  Cloud, LogOut, User, Heart, ChevronDown, ChevronUp, ChevronLeft,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { SyncStatusRow } from '../components/SyncStatus'
import { clearSyncHistory } from '../db'
import { clearImportedMetrics, getHealthDiagnostics } from '../db/healthStore'
import type { HealthDiagnosticEntry } from '../db/healthStore'
import { isInsideNativeApp } from '../layout/BottomNav'
import { SettingsSection, SettingsRow } from './Settings'
import './Settings.css'

/** Everything sync/data/storage-related, split out of the main Settings
    page so a typical user never sees it unless they come looking for it —
    this is where cloud-sync status (including any "N failed" warning)
    lives, instead of being the first thing on the main Settings screen. */
export default function DataSyncSettings() {
  const { dbStatus } = useApp()
  const { mode: authMode, user, signOut, isSupabaseConfigured: sbConfigured } = useAuth()
  const navigate = useNavigate()
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [exportNote, setExportNote] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  const [showHealthDiag, setShowHealthDiag] = useState(false)
  const [healthDiag, setHealthDiag] = useState<HealthDiagnosticEntry[] | null>(null)

  useEffect(() => {
    if (showHealthDiag && !healthDiag) {
      getHealthDiagnostics().then(setHealthDiag).catch(() => {})
    }
  }, [showHealthDiag, healthDiag])

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
        <div>
          <button className="ds-back-btn" onClick={() => navigate('/settings')}>
            <ChevronLeft size={16} /> Settings
          </button>
          <h1 className="page-title">Data & Sync</h1>
          <p className="page-subtitle">Cloud account, backups, connected sources</p>
        </div>
      </header>

      {exportNote && (
        <div className="settings-notice">{exportNote}</div>
      )}

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

      {/* ── Health Diagnostics (only inside iOS native app) ── */}
      {isInsideNativeApp() && (
        <SettingsSection title="Health Diagnostics">
          <button
            className="settings-row settings-row--clickable"
            onClick={() => setShowHealthDiag(v => !v)}
          >
            <span className="settings-row-icon"><Heart size={15} /></span>
            <span className="settings-row-label">HealthKit Data Freshness</span>
            <span className="settings-row-value" style={{ color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
              {showHealthDiag ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </span>
          </button>
          {showHealthDiag && (
            <div style={{ padding: '4px 0 8px' }}>
              {!healthDiag ? (
                <p className="settings-inline-note">Loading…</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {healthDiag.map(entry => (
                    <div
                      key={entry.typeId}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 16px',
                        borderBottom: '0.5px solid var(--border-subtle)',
                        fontSize: 13,
                      }}
                    >
                      <span style={{ color: 'var(--text-secondary)' }}>{entry.displayName}</span>
                      <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
                        {entry.recordCount === 0
                          ? 'No data'
                          : entry.daysAgo === 0
                          ? `${entry.recordCount} records · today`
                          : entry.daysAgo === 1
                          ? `${entry.recordCount} records · yesterday`
                          : `${entry.recordCount} records · ${entry.daysAgo}d ago`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </SettingsSection>
      )}

      {/* ── Developer (dev builds only — never shipped to real users) ── */}
      {import.meta.env.DEV && (
        <SettingsSection title="Developer">
          <SettingsRow
            icon={FlaskConical}
            label="Developer Diagnostics"
            description="DB status, mock mode, sync queue inspection"
            onClick={() => navigate('/dev')}
          />
        </SettingsSection>
      )}
    </div>
  )
}
