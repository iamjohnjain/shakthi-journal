import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload, CheckCircle, AlertCircle, Loader, ChevronRight,
  Calendar, Hash, Database, FileText, Info, ArrowLeft,
  Heart, Share2,
} from 'lucide-react'
import { parseAppleHealthFile, type ParsePreview } from '../parsers/appleHealthParser'
import { storeMetrics } from '../db/healthStore'
import { addSyncHistoryEntry } from '../db'
import DataBadge from '../components/DataBadge'
import './ImportAppleHealth.css'

type Step = 'drop' | 'parsing' | 'preview' | 'importing' | 'done'

// ─── Drop zone ────────────────────────────────────────────────────────────────

function DropZone({ onFile }: { onFile: (f: File) => void }) {
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith('.xml')) {
      alert('Please select the export.xml file from your Apple Health archive.')
      return
    }
    onFile(file)
  }, [onFile])

  return (
    <div
      className={`drop-zone ${drag ? 'drop-zone--active' : ''}`}
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => {
        e.preventDefault()
        setDrag(false)
        const file = e.dataTransfer.files[0]
        if (file) handleFile(file)
      }}
      onClick={() => inputRef.current?.click()}
    >
      <Upload size={32} className="drop-zone-icon" />
      <p className="drop-zone-title">Drop your Apple Health export.xml here</p>
      <p className="drop-zone-sub">or click to browse</p>
      <div className="drop-zone-hint">
        <Info size={12} />
        Only <code>export.xml</code> files are supported. Your data never leaves this device.
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".xml,application/xml,text/xml"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
      />
    </div>
  )
}

// ─── Preview ──────────────────────────────────────────────────────────────────

function Preview({
  preview,
  onConfirm,
  onReset,
}: {
  preview: ParsePreview
  onConfirm: () => void
  onReset: () => void
}) {
  const [showSamples, setShowSamples] = useState(false)

  const dayCount = preview.dateRange
    ? Math.round((new Date(preview.dateRange.end).getTime() - new Date(preview.dateRange.start).getTime()) / 86_400_000) + 1
    : 0

  return (
    <div className="preview">
      {/* Header */}
      <div className="preview-header">
        <div className="preview-file">
          <FileText size={16} />
          <span>{preview.fileName}</span>
          <span className="preview-size">{preview.fileSizeMB} MB</span>
        </div>
        <DataBadge mode="imported" source="Apple Health" />
      </div>

      {/* Warnings */}
      {preview.warnings.length > 0 && (
        <div className="preview-warnings">
          {preview.warnings.map((w, i) => (
            <div key={i} className="preview-warning-row">
              <AlertCircle size={13} />
              {w}
            </div>
          ))}
        </div>
      )}

      {/* Stats grid */}
      <div className="preview-stats">
        {preview.exportDate && (
          <div className="preview-stat">
            <Calendar size={13} />
            <div>
              <span className="preview-stat-label">Export date</span>
              <span className="preview-stat-value">{preview.exportDate.slice(0, 10)}</span>
            </div>
          </div>
        )}
        {preview.dateRange && (
          <div className="preview-stat">
            <Calendar size={13} />
            <div>
              <span className="preview-stat-label">Date range</span>
              <span className="preview-stat-value">{preview.dateRange.start} → {preview.dateRange.end}</span>
              <span className="preview-stat-sub">{dayCount.toLocaleString()} days</span>
            </div>
          </div>
        )}
        <div className="preview-stat">
          <Hash size={13} />
          <div>
            <span className="preview-stat-label">Raw records</span>
            <span className="preview-stat-value">{preview.totalRawRecords.toLocaleString()}</span>
          </div>
        </div>
        <div className="preview-stat">
          <Database size={13} />
          <div>
            <span className="preview-stat-label">Daily summaries to store</span>
            <span className="preview-stat-value">{preview.metrics.length.toLocaleString()}</span>
          </div>
        </div>
        {preview.totalWorkouts > 0 && (
          <div className="preview-stat">
            <Hash size={13} />
            <div>
              <span className="preview-stat-label">Workouts found</span>
              <span className="preview-stat-value">{preview.totalWorkouts.toLocaleString()}</span>
            </div>
          </div>
        )}
      </div>

      {/* Record types */}
      <div className="preview-types">
        <h3 className="preview-types-title">Record types found</h3>
        <div className="preview-types-list">
          {preview.byType.map(t => (
            <div key={t.hkType} className="preview-type-row">
              <span className="preview-type-label">{t.label}</span>
              <span className="preview-type-raw">{t.rawCount.toLocaleString()} raw</span>
              <span className="preview-type-daily">→ {t.dailyCount} days</span>
            </div>
          ))}
          {preview.byType.length === 0 && (
            <p className="preview-empty">No supported record types found in this file.</p>
          )}
        </div>
      </div>

      {/* Sample rows toggle */}
      {preview.sampleRows.length > 0 && (
        <div className="preview-samples">
          <button className="preview-samples-toggle" onClick={() => setShowSamples(v => !v)}>
            {showSamples ? 'Hide' : 'Show'} sample records
            <ChevronRight size={13} style={{ transform: showSamples ? 'rotate(90deg)' : '', transition: 'transform 0.2s' }} />
          </button>
          {showSamples && (
            <div className="preview-samples-table">
              {preview.sampleRows.map((row, i) => (
                <div key={i} className="preview-sample-row">
                  <span className="ps-label">{row.label}</span>
                  <span className="ps-date">{row.date}</span>
                  <span className="ps-value">{row.value}</span>
                  <span className="ps-source">{row.source}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Privacy note */}
      <div className="preview-privacy">
        <Info size={12} />
        All data is stored locally in your browser's IndexedDB. Nothing is sent to any server.
      </div>

      {/* Actions */}
      <div className="preview-actions">
        <button className="btn-back" onClick={onReset}>
          <ArrowLeft size={14} />
          Choose different file
        </button>
        {preview.metrics.length === 0 ? (
          <p className="preview-no-data">No importable records found. Check the file is the Apple Health export.xml.</p>
        ) : (
          <button className="btn-confirm" onClick={onConfirm}>
            Import {preview.metrics.length.toLocaleString()} records
            <ChevronRight size={16} />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Done screen ──────────────────────────────────────────────────────────────

function DoneScreen({ preview, onImportAnother }: { preview: ParsePreview; onImportAnother: () => void }) {
  const navigate = useNavigate()
  return (
    <div className="import-done">
      <CheckCircle size={48} className="done-icon" />
      <h2 className="done-title">Import complete</h2>
      <p className="done-sub">
        {preview.metrics.length.toLocaleString()} records imported from {preview.fileName}
      </p>
      <div className="done-actions">
        <button className="btn-confirm" onClick={() => navigate('/')}>
          View Dashboard
        </button>
        <button className="btn-text" onClick={onImportAnother}>
          Import another file
        </button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ImportAppleHealth() {
  const [step, setStep] = useState<Step>('drop')
  const [parseStage, setParseStage] = useState('')
  const [preview, setPreview] = useState<ParsePreview | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [importProgress, setImportProgress] = useState('')
  const startedAt = useRef<string>('')

  async function handleFile(file: File) {
    setStep('parsing')
    setParseError(null)
    startedAt.current = new Date().toISOString()

    try {
      const result = await parseAppleHealthFile(file, setParseStage)
      setPreview(result)
      setStep('preview')
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Unknown parse error')
      setStep('drop')
    }
  }

  async function handleConfirm() {
    if (!preview) return
    setStep('importing')
    setImportProgress('Saving to IndexedDB…')

    try {
      const t0 = Date.now()
      await storeMetrics(preview.metrics)
      const durationMs = Date.now() - t0

      setImportProgress('Logging sync history…')
      await addSyncHistoryEntry({
        id: `apple-health-import-${Date.now()}`,
        sourceId: 'apple_health',
        sourceName: 'Apple Health',
        status: 'success',
        recordCount: preview.metrics.length,
        dataTypes: preview.byType.map(t => t.label),
        dataMode: 'imported',
        startedAt: startedAt.current,
        completedAt: new Date().toISOString(),
        durationMs,
      })

      setStep('done')
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Failed to save to IndexedDB')
      setStep('preview')
    }
  }

  function reset() {
    setStep('drop')
    setPreview(null)
    setParseError(null)
    setParseStage('')
  }

  return (
    <div className="import-ah-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Import Apple Health</h1>
          <p className="page-subtitle">
            Upload your Apple Health export.xml to import real health data.
          </p>
        </div>
      </header>

      {/* Step-by-step guide */}
      {step === 'drop' && (
        <div className="import-steps">
          <div className="import-step">
            <div className="import-step-badge">
              <Heart size={16} />
            </div>
            <div className="import-step-body">
              <h3 className="import-step-title">Open Apple Health</h3>
              <p className="import-step-desc">On your iPhone, open the <strong>Health</strong> app. Tap your profile photo in the top-right corner.</p>
            </div>
          </div>

          <div className="import-step-connector" aria-hidden="true" />

          <div className="import-step">
            <div className="import-step-badge">
              <Share2 size={16} />
            </div>
            <div className="import-step-body">
              <h3 className="import-step-title">Export your data</h3>
              <p className="import-step-desc">Scroll down and tap <strong>Export All Health Data</strong>. Share the ZIP file to your Mac via AirDrop, iCloud Drive, or email. Unzip the archive.</p>
            </div>
          </div>

          <div className="import-step-connector" aria-hidden="true" />

          <div className="import-step">
            <div className="import-step-badge">
              <Upload size={16} />
            </div>
            <div className="import-step-body">
              <h3 className="import-step-title">Upload export.xml</h3>
              <p className="import-step-desc">From the unzipped folder, select <code>export.xml</code> below. Only this file is needed — not workout routes.</p>
              <p className="import-step-note">Large exports (years of Watch data) can be 50 MB+ and may take 20–30 seconds to process.</p>
            </div>
          </div>
        </div>
      )}

      {/* Parse error */}
      {parseError && (
        <div className="import-ah-error">
          <AlertCircle size={14} />
          <span>{parseError}</span>
        </div>
      )}

      {/* Step content */}
      {step === 'drop' && <DropZone onFile={handleFile} />}

      {step === 'parsing' && (
        <div className="import-ah-loading">
          <Loader size={32} className="spin" />
          <p className="loading-stage">{parseStage || 'Starting…'}</p>
          <p className="loading-note">
            The page may be unresponsive for a moment while parsing large XML files. This is normal.
          </p>
        </div>
      )}

      {step === 'preview' && preview && (
        <Preview preview={preview} onConfirm={handleConfirm} onReset={reset} />
      )}

      {step === 'importing' && (
        <div className="import-ah-loading">
          <Loader size={32} className="spin" />
          <p className="loading-stage">{importProgress}</p>
        </div>
      )}

      {step === 'done' && preview && (
        <DoneScreen preview={preview} onImportAnother={reset} />
      )}
    </div>
  )
}
