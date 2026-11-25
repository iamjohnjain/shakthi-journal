import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  History, Download as DownloadIcon, Upload,
  FlaskConical, Database, ShieldCheck, Trash2,
  Cloud, LogOut, User, Heart, ChevronLeft, Activity,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { SyncStatusRow } from '../components/SyncStatus'
import { clearSyncHistory } from '../db'
import { clearImportedMetrics, getHealthDiagnostics } from '../db/healthStore'
import type { HealthDiagnosticEntry } from '../db/healthStore'
import { isInsideNativeApp } from '../layout/BottomNav'
import { JSection, JRow } from './Settings'
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

  const storageValue = dbStatus === 'ready' ? 'On this device' : dbStatus === 'loading' ? 'Loading…' : 'Error'
  const native = isInsideNativeApp()

  return (
    <div className="settings-page jset-page">
      <header className="jset-title-block">
        <button type="button" className="jset-back" data-no-press-glow onClick={() => navigate('/settings')}>
          <ChevronLeft size={16} /> Settings
        </button>
        <h1 className="page-title">Data &amp; Sync</h1>
        <p className="jset-subtitle">Account, backups, connected sources</p>
      </header>

      {exportNote && <div className="jset-notice" role="status">{exportNote}</div>}

      {/* ── Account ── */}
      {!sbConfigured ? (
        <JSection title="Account">
          <div className="jset-sub">
            <Cloud size={16} />
            <span>Cloud sync isn't configured — add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to enable it.</span>
          </div>
        </JSection>
      ) : authMode === 'authenticated' && user ? (
        <JSection title="Account">
          <JRow icon={User} label="Signed in" desc={user.email ?? user.displayName ?? 'Account'} />
          <SyncStatusRow />
          <JRow
            icon={LogOut}
            label={signingOut ? 'Signing out…' : 'Sign Out'}
            onClick={handleSignOut}
            destructive
            chevron={false}
          />
        </JSection>
      ) : (
        <section className="jset-section">
          <h2 className="jset-section-title">Account</h2>
          <div className="jset-card jset-signin">
            <p>Sign in to back up your data and sync it across your devices automatically.</p>
            <button type="button" className="jset-cta" onClick={() => navigate('/auth')}>
              Sign In or Create Account
            </button>
          </div>
        </section>
      )}

      {/* ── Backups ── */}
      <JSection title="Backups">
        <div className="jset-sub">
          <ShieldCheck size={16} />
          <span>Your data lives on this device. Export a backup before switching phones or browsers.</span>
        </div>
        <JRow icon={DownloadIcon} label="Export Backup" desc="Save all your data as a JSON file" onClick={() => navigate('/settings/backup')} />
        <JRow icon={Upload} label="Restore From Backup" desc="Bring back a JSON backup you exported" onClick={() => navigate('/settings/backup')} />
      </JSection>

      {/* ── Sources ── */}
      <JSection title="Sources">
        <JRow icon={Heart} label="Apple Health" desc="Status and Sync Now" onClick={() => navigate('/connected-accounts')} />
        <JRow icon={History} label="Sync History" desc="Past imports and sync events" onClick={() => navigate('/sync-history')} />
        <JRow icon={DownloadIcon} label="Import Data" desc="Apple Health export.xml and other formats" onClick={() => navigate('/import')} />
      </JSection>

      {/* ── Health diagnostics (native app only) ── */}
      {native && (
        <JSection title="Health Diagnostics">
          <JRow
            icon={Activity}
            label="HealthKit Data Freshness"
            desc="Latest data per health type"
            onClick={() => setShowHealthDiag(v => !v)}
            chevron={false}
            trailing={<span className="jset-row-link">{showHealthDiag ? 'Hide' : 'Show'}</span>}
          />
          {showHealthDiag && (
            <div className="jset-diag">
              {!healthDiag ? (
                <div className="jset-diag-row"><span>Loading…</span><span /></div>
              ) : healthDiag.map(entry => (
                <div key={entry.typeId} className="jset-diag-row">
                  <span>{entry.displayName}</span>
                  <span>
                    {entry.recordCount === 0
                      ? 'No data'
                      : `${entry.recordCount} · ${entry.daysAgo === 0 ? 'today' : entry.daysAgo === 1 ? 'yesterday' : `${entry.daysAgo}d ago`}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </JSection>
      )}

      {/* ── Storage ── */}
      <JSection title="Storage">
        <JRow icon={Database} label="Storage" trailing={<span className="jset-row-value">{storageValue}</span>} />
        <JRow
          icon={Trash2}
          label={deleting ? 'Deleting…' : deleteConfirm ? 'Tap Again to Confirm' : 'Delete Imported Health Data'}
          desc="Removes imported Apple Health metrics and sync history. Workouts, meals, profile and account stay."
          onClick={handleDeleteImported}
          destructive
          chevron={false}
        />
      </JSection>

      {/* ── Developer (dev builds only — never shipped to real users) ── */}
      {import.meta.env.DEV && (
        <JSection title="Developer">
          <JRow icon={FlaskConical} label="Developer Diagnostics" desc="DB status, mock mode, sync queue" onClick={() => navigate('/dev')} />
        </JSection>
      )}
    </div>
  )
}
