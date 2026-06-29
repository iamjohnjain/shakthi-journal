import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Download, Upload, ShieldCheck, AlertTriangle,
  CheckCircle, XCircle, ChevronLeft, RefreshCw,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import {
  exportAllData, downloadBackup, parseBackupFile, importBackup,
  BACKUP_STORES,
} from '../db/backupStore'
import type { BackupData, ImportMode } from '../db/backupStore'
import './BackupRestorePage.css'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STORE_LABELS: Record<string, string> = {
  health_metrics:   'Apple Health metrics',
  sync_history:     'Sync history',
  settings:         'App settings',
  daily_logs:       'Daily logs',
  profile:          'Profile',
  workouts:         'Workouts',
  nutrition_entries:'Nutrition entries',
  training_profile: 'Training profile',
  workout_plans:    'Workout plans',
  exercise_library: 'Exercise library',
  workout_templates:'Workout templates',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', year: 'numeric', month: 'short',
    day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

// ─── Import preview modal ─────────────────────────────────────────────────────

function ImportPreviewModal({
  data, onConfirm, onCancel,
}: {
  data: BackupData
  onConfirm: (mode: ImportMode) => void
  onCancel: () => void
}) {
  const [mode, setMode] = useState<ImportMode>('merge')
  const totalRecords = Object.values(data.summary).reduce((a, b) => a + b, 0)

  return (
    <div className="br-modal-overlay" onClick={onCancel}>
      <div className="br-modal" onClick={e => e.stopPropagation()}>
        <div className="br-modal-header">
          <h2>Import Backup</h2>
          <button className="br-modal-close" onClick={onCancel}>×</button>
        </div>

        <div className="br-modal-body">
          {/* Backup metadata */}
          <div className="br-preview-meta">
            <div className="br-meta-row">
              <span className="br-meta-label">Exported</span>
              <span className="br-meta-value">{formatDate(data.exportedAt)}</span>
            </div>
            <div className="br-meta-row">
              <span className="br-meta-label">App version</span>
              <span className="br-meta-value">v{data.appVersion}</span>
            </div>
            <div className="br-meta-row">
              <span className="br-meta-label">Total records</span>
              <span className="br-meta-value">{totalRecords.toLocaleString()}</span>
            </div>
          </div>

          {/* Record counts by store */}
          <div className="br-preview-stores">
            {BACKUP_STORES.map(store => {
              const count = data.summary[store] ?? 0
              if (count === 0) return null
              return (
                <div key={store} className="br-store-row">
                  <span className="br-store-label">{STORE_LABELS[store] ?? store}</span>
                  <span className="br-store-count">{count.toLocaleString()}</span>
                </div>
              )
            })}
          </div>

          {/* Mode selector */}
          <div className="br-mode-section">
            <p className="br-mode-title">Import mode</p>
            <div className="br-mode-options">
              <button
                className={`br-mode-btn ${mode === 'merge' ? 'br-mode-btn--on' : ''}`}
                onClick={() => setMode('merge')}
              >
                <div className="br-mode-btn-title">Merge</div>
                <div className="br-mode-btn-desc">Add records from backup that don't exist locally. Your existing data is kept.</div>
              </button>
              <button
                className={`br-mode-btn ${mode === 'replace' ? 'br-mode-btn--on' : ''}`}
                onClick={() => setMode('replace')}
              >
                <div className="br-mode-btn-title">Replace all</div>
                <div className="br-mode-btn-desc">Clear all local data first, then restore everything from backup. Cannot be undone.</div>
              </button>
            </div>

            {mode === 'replace' && (
              <div className="br-replace-warning">
                <AlertTriangle size={14} />
                <span>Replace will permanently delete all current local data before restoring. Make sure this backup is complete.</span>
              </div>
            )}
          </div>
        </div>

        <div className="br-modal-footer">
          <button className="br-btn-cancel" onClick={onCancel}>Cancel</button>
          <button
            className={`br-btn-confirm ${mode === 'replace' ? 'br-btn-confirm--destructive' : ''}`}
            onClick={() => onConfirm(mode)}
          >
            {mode === 'replace' ? 'Replace All Data' : 'Merge Import'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Status = 'idle' | 'exporting' | 'exported' | 'importing' | 'done' | 'error'

export default function BackupRestorePage() {
  const { appVersion } = useApp()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [status,        setStatus]        = useState<Status>('idle')
  const [message,       setMessage]       = useState('')
  const [pendingBackup, setPendingBackup] = useState<BackupData | null>(null)
  const [importResult,  setImportResult]  = useState<{ imported: number; skipped: number; errors: string[] } | null>(null)
  const [progressText,  setProgressText]  = useState('')

  // ── Export ──
  async function handleExport() {
    setStatus('exporting')
    setMessage('')
    try {
      const data = await exportAllData(appVersion)
      downloadBackup(data)
      const total = Object.values(data.summary).reduce((a, b) => a + b, 0)
      setStatus('exported')
      setMessage(`Backup downloaded — ${total.toLocaleString()} records across ${BACKUP_STORES.length} stores.`)
    } catch (e) {
      setStatus('error')
      setMessage(`Export failed: ${e}`)
    }
  }

  // ── File pick ──
  function handleFilePick() {
    fileInputRef.current?.click()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    try {
      const text = await file.text()
      const data = parseBackupFile(text)
      if (!data) {
        setStatus('error')
        setMessage('Invalid backup file. Make sure you selected a .json file exported from Shakthi Journal.')
        return
      }
      setPendingBackup(data)
    } catch (e) {
      setStatus('error')
      setMessage(`Could not read file: ${e}`)
    }
  }

  // ── Execute import ──
  async function handleImportConfirm(mode: ImportMode) {
    if (!pendingBackup) return
    setPendingBackup(null)
    setStatus('importing')
    setProgressText('Starting import…')

    try {
      const result = await importBackup(pendingBackup, mode, (store, done, total) => {
        setProgressText(`${STORE_LABELS[store] ?? store} — ${done}/${total}`)
      })
      setImportResult(result)
      setStatus('done')
      setProgressText('')
      setMessage(
        result.errors.length > 0
          ? `Import complete with ${result.errors.length} error(s). ${result.imported} imported, ${result.skipped} skipped.`
          : `Import successful — ${result.imported} records imported, ${result.skipped} already existed.`
      )
    } catch (e) {
      setStatus('error')
      setMessage(`Import failed: ${e}`)
      setProgressText('')
    }
  }

  return (
    <div className="br-page">
      <header className="page-header">
        <div>
          <button className="br-back-btn" onClick={() => navigate('/settings')}>
            <ChevronLeft size={16} /> Settings
          </button>
          <h1 className="page-title">Backup & Restore</h1>
          <p className="page-subtitle">Protect your health data</p>
        </div>
      </header>

      {/* Data safety notice */}
      <div className="br-safety-notice">
        <ShieldCheck size={18} className="br-safety-icon" />
        <div className="br-safety-text">
          <strong>Your data is local-only.</strong>{' '}
          It lives in this browser's IndexedDB on this device. Clearing browser storage, switching browsers,
          or moving to a different domain will erase it. Export a backup before switching devices or deploying.
        </div>
      </div>

      {/* Status messages */}
      {message && (
        <div className={`br-status-msg ${status === 'error' ? 'br-status-msg--error' : status === 'done' || status === 'exported' ? 'br-status-msg--success' : ''}`}>
          {status === 'error' && <XCircle size={15} />}
          {(status === 'done' || status === 'exported') && <CheckCircle size={15} />}
          <span>{message}</span>
        </div>
      )}

      {status === 'importing' && progressText && (
        <div className="br-progress-msg">
          <RefreshCw size={14} className="br-spin" />
          <span>{progressText}</span>
        </div>
      )}

      {/* Import result detail */}
      {importResult && importResult.errors.length > 0 && (
        <div className="br-error-detail">
          <p className="br-error-detail-title">Import errors ({importResult.errors.length})</p>
          <pre className="br-error-list">{importResult.errors.slice(0, 10).join('\n')}</pre>
        </div>
      )}

      {/* Export card */}
      <div className="br-card">
        <div className="br-card-header">
          <Download size={20} className="br-card-icon br-card-icon--export" />
          <div>
            <h2 className="br-card-title">Export Backup</h2>
            <p className="br-card-desc">Download all your data as a single JSON file. Includes workouts, nutrition, health metrics, settings, and everything else stored locally.</p>
          </div>
        </div>
        <button
          className="br-action-btn br-action-btn--export"
          onClick={handleExport}
          disabled={status === 'exporting' || status === 'importing'}
        >
          {status === 'exporting' ? 'Exporting…' : 'Export All Data'}
        </button>
        <p className="br-card-note">File is named <code>shakthi-journal-backup-YYYY-MM-DD.json</code> and saves to your Downloads folder.</p>
      </div>

      {/* Import card */}
      <div className="br-card">
        <div className="br-card-header">
          <Upload size={20} className="br-card-icon br-card-icon--import" />
          <div>
            <h2 className="br-card-title">Restore Backup</h2>
            <p className="br-card-desc">Choose a previously exported backup file. You'll see what's inside before deciding whether to merge with your current data or replace it entirely.</p>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <button
          className="br-action-btn br-action-btn--import"
          onClick={handleFilePick}
          disabled={status === 'exporting' || status === 'importing'}
        >
          {status === 'importing' ? 'Importing…' : 'Choose Backup File'}
        </button>
        <p className="br-card-note">Select a <code>.json</code> file previously exported from Shakthi Journal.</p>
      </div>

      {/* What's included */}
      <div className="br-stores-list">
        <h3 className="br-stores-title">What's included in a backup</h3>
        <div className="br-stores-grid">
          {BACKUP_STORES.map(store => (
            <div key={store} className="br-store-chip">
              {STORE_LABELS[store] ?? store}
            </div>
          ))}
        </div>
      </div>

      {/* Import preview modal */}
      {pendingBackup && (
        <ImportPreviewModal
          data={pendingBackup}
          onConfirm={handleImportConfirm}
          onCancel={() => setPendingBackup(null)}
        />
      )}
    </div>
  )
}
