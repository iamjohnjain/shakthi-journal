import { useState, useCallback } from 'react'
import type { DataSourceId, ImportRecord, ImportStatus } from '../types/health'
import { parseAppleHealthExport, summariseAppleHealthExport } from '../parsers/appleHealth'
import { parseRenphoCsv, summariseRenphoRecords } from '../parsers/renpho'
import { parseStravaCsv, summariseStravaActivities } from '../parsers/strava'
import { parseMFPCsv, summariseMFPLogs } from '../parsers/myFitnessPal'
import { mockImportHistory } from '../data/mock'
import './ImportPage.css'

interface DataSource {
  id: DataSourceId
  name: string
  subtitle: string
  icon: string
  accepts: string
  acceptMime: string
  availability: 'available' | 'coming_soon'
  comingSoonLabel?: string
  instruction: string
}

const SOURCES: DataSource[] = [
  {
    id: 'apple_health',
    name: 'Apple Health',
    subtitle: 'Includes Apple Watch · RingConn · Renpho',
    icon: '❤️',
    accepts: '.xml',
    acceptMime: '.xml,text/xml,application/xml',
    availability: 'available',
    instruction: 'iPhone → Health → profile icon → Export All Health Data',
  },
  {
    id: 'renpho',
    name: 'Renpho Scale',
    subtitle: 'Body weight · fat % · muscle mass',
    icon: '⚖️',
    accepts: '.csv',
    acceptMime: '.csv,text/csv',
    availability: 'available',
    instruction: 'Renpho app → Profile → Export Data',
  },
  {
    id: 'strava',
    name: 'Strava',
    subtitle: 'Runs · rides · GPS routes',
    icon: '🏃',
    accepts: '.csv',
    acceptMime: '.csv,text/csv',
    availability: 'available',
    instruction: 'Strava → Settings → My Account → Download or Delete Your Data → activities.csv',
  },
  {
    id: 'myfitnesspal',
    name: 'MyFitnessPal',
    subtitle: 'Nutrition · macros · calories',
    icon: '🥗',
    accepts: '.csv',
    acceptMime: '.csv,text/csv',
    availability: 'available',
    instruction: 'myfitnesspal.com → Reports → Export. Or enable MFP → Apple Health sync to get macros through the Apple Health export above.',
  },
]

type ParseSummary = Record<string, string | number>

interface ActiveImport {
  sourceId: DataSourceId
  status: ImportStatus
  summary: ParseSummary | null
  error: string | null
}

export default function ImportPage() {
  const [history, setHistory] = useState<ImportRecord[]>(mockImportHistory)
  const [active, setActive] = useState<ActiveImport | null>(null)
  const [draggingOver, setDraggingOver] = useState<DataSourceId | null>(null)

  const handleFile = useCallback(async (sourceId: DataSourceId, file: File) => {
    setActive({ sourceId, status: 'parsing', summary: null, error: null })

    try {
      let summary: ParseSummary
      let recordCount: number

      if (sourceId === 'apple_health') {
        const data = await parseAppleHealthExport(file)
        const s = summariseAppleHealthExport(data)
        recordCount = s.totalRecords
        summary = {
          'Records': s.totalRecords,
          'Workouts': s.workouts,
          'Data types': s.dataTypes,
          'Device': s.device,
        }
      } else if (sourceId === 'renpho') {
        const data = await parseRenphoCsv(file)
        const s = summariseRenphoRecords(data)
        recordCount = s.totalRecords
        summary = {
          'Weigh-ins': s.totalRecords,
          'Latest weight': `${s.latestWeight} kg`,
          'Body fat': `${s.latestBodyFat}%`,
          'Muscle mass': `${s.latestMuscleMass} kg`,
          'Date range': s.dateRange,
        }
      } else if (sourceId === 'strava') {
        const data = await parseStravaCsv(file)
        const s = summariseStravaActivities(data)
        recordCount = s.totalActivities
        summary = {
          'Activities': s.totalActivities,
          'Runs': s.totalRuns,
          'Total distance': `${s.totalDistanceKm} km`,
          'Date range': s.dateRange,
        }
      } else {
        const data = await parseMFPCsv(file)
        const s = summariseMFPLogs(data)
        recordCount = s.totalDays
        summary = {
          'Days logged': s.totalDays,
          'Avg protein': `${s.avgProteinG}g`,
          'Avg calories': s.avgCalories,
          'Date range': s.dateRange,
        }
      }

      const source = SOURCES.find(s => s.id === sourceId)!
      setActive({ sourceId, status: 'success', summary, error: null })
      setHistory(prev => [{
        id: Date.now().toString(),
        sourceId,
        sourceName: source.name,
        importedAt: new Date().toISOString(),
        recordCount,
        fileName: file.name,
        status: 'success',
      }, ...prev])
    } catch (e) {
      setActive({ sourceId, status: 'error', summary: null, error: (e as Error).message })
    }
  }, [])

  const handleDrop = useCallback((sourceId: DataSourceId, e: React.DragEvent) => {
    e.preventDefault()
    setDraggingOver(null)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(sourceId, file)
  }, [handleFile])

  const handleInputChange = useCallback((sourceId: DataSourceId, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(sourceId, file)
    e.target.value = ''
  }, [handleFile])

  return (
    <div className="import-page">
      <header className="import-header">
        <h1>Import Data</h1>
        <p className="import-header-sub">All data is processed locally on your device and never sent to a server.</p>
      </header>

      <section className="sources-grid">
        {SOURCES.map(source => {
          const isActive = active?.sourceId === source.id
          const isParsing = isActive && active.status === 'parsing'
          const isSuccess = isActive && active.status === 'success'
          const isError = isActive && active.status === 'error'
          const isDragging = draggingOver === source.id

          return (
            <div
              key={source.id}
              className={`source-card ${isDragging ? 'drag-over' : ''} ${isParsing ? 'parsing' : ''}`}
              onDragOver={e => { e.preventDefault(); setDraggingOver(source.id) }}
              onDragLeave={() => setDraggingOver(null)}
              onDrop={e => handleDrop(source.id, e)}
            >
              <div className="source-card-top">
                <div className="source-icon">{source.icon}</div>
                <div className="source-info">
                  <div className="source-name">{source.name}</div>
                  <div className="source-subtitle">{source.subtitle}</div>
                </div>
                {source.availability === 'coming_soon' ? (
                  <span className="badge badge-soon">{source.comingSoonLabel ?? 'Coming soon'}</span>
                ) : (
                  <label className={`upload-btn ${isParsing ? 'disabled' : ''}`}>
                    {isParsing ? 'Parsing…' : `Upload ${source.accepts}`}
                    <input
                      type="file"
                      accept={source.acceptMime}
                      disabled={isParsing}
                      onChange={e => handleInputChange(source.id, e)}
                    />
                  </label>
                )}
              </div>

              <p className="source-instruction">{source.instruction}</p>

              {isSuccess && active.summary && (
                <div className="parse-result success">
                  <div className="parse-result-header">
                    <span className="result-dot green" />
                    Parsed successfully
                  </div>
                  <div className="summary-grid">
                    {Object.entries(active.summary).map(([k, v]) => (
                      <div key={k} className="summary-row">
                        <span className="summary-label">{k}</span>
                        <span className="summary-value">{v}</span>
                      </div>
                    ))}
                  </div>
                  <button className="import-confirm-btn">Import into Dashboard</button>
                </div>
              )}

              {isError && active.error && (
                <div className="parse-result error">
                  <div className="parse-result-header">
                    <span className="result-dot red" />
                    Could not parse file
                  </div>
                  <p className="error-msg">{active.error}</p>
                </div>
              )}

              {isParsing && (
                <div className="parse-result parsing-state">
                  <div className="parse-result-header">
                    <span className="spinner" />
                    Reading file…
                  </div>
                </div>
              )}

              {isDragging && !isParsing && (
                <div className="drop-overlay">Drop to import</div>
              )}
            </div>
          )
        })}
      </section>

      {history.length > 0 && (
        <section className="import-history">
          <h2>Import History</h2>
          <div className="history-list">
            {history.map(record => (
              <div key={record.id} className="history-row">
                <div className="history-left">
                  <span className={`result-dot ${record.status === 'success' ? 'green' : 'red'}`} />
                  <div>
                    <div className="history-source">{record.sourceName}</div>
                    <div className="history-file">{record.fileName}</div>
                  </div>
                </div>
                <div className="history-right">
                  <div className="history-count">{record.recordCount.toLocaleString()} records</div>
                  <div className="history-date">{formatRelative(record.importedAt)}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}
